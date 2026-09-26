# Product Store & Favicon Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Capture each product's store (AI-extracted name + favicon fetched from the loaded page), persist it once per domain in a `Store` table linked to products, and show it on the dashboard and product detail page.

**Architecture:** A new `Store` table keyed by normalized domain holds the name and favicon bytes. `store_service` owns domain normalization and get-or-create; `product_service` resolves a product's store from its URL on create/update and during extraction (downloading the favicon through the Stagehand browser only for unseen domains). A new `GET /stores/{id}/favicon` endpoint serves the bytes; the frontend renders them via `StoreFavicon`/`StoreBadge`.

**Tech Stack:** FastAPI + SQLModel (SQLite), Stagehand v4 Python SDK, pytest · React 19 + Chakra UI v3, Vitest + Testing Library, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-product-store-favicon-design.md`

## Global Constraints

- No backward compatibility / migrations: the dev database is recreated (`just db-init` or `python -m src.setup_backend`).
- Store identity = hostname, lower-cased, trailing dot and leading `www.` stripped; other subdomains kept. `amazon.es` ≠ `amazon.com`.
- The first name/favicon stored for a domain wins; an existing store is never modified.
- Favicon: `image/*` only, 1 byte – 256 KB (`MAX_FAVICON_BYTES = 256 * 1024`), stored as BLOB + mime (parameters stripped).
- Favicon response headers: `Cache-Control: public, max-age=604800`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.
- A URL without a hostname → HTTP 422 on create, update and extract.
- Store name is read-only in the UI; no store management, no Telegram changes.
- Everything (code, comments, docs, commit messages) in English; Conventional Commits (enforced by a pre-commit hook).
- Lucide icons via `react-icons/lu` with the global `<Icon as={...} size=...>` convention.

## Review Focus

1. **Messy URLs** (`https://WWW.Amazon.ES:443/dp/x?ref=1`, trailing-dot hosts) must map to the same store as `https://amazon.es/...` → Task 1 test `test_normalize_domain_*`.
2. **A "favicon" that is really an HTML error page / octet-stream / oversized file** must be rejected, leaving the store without favicon → Task 4 tests `test_parse_favicon_payload_*`.
3. **Two extractions of the same new domain racing** must not 500 on the unique constraint; the second reuses the first store → Task 1 test `test_get_or_create_recovers_from_unique_race`.
4. **An SVG favicon opened directly from our API origin** must not run scripts → Task 2 test `test_favicon_endpoint_sets_cache_and_security_headers`.
5. **Editing a product's URL to a malformed value** must 422 and leave the product (and its store) unchanged → Task 3 test `test_update_with_invalid_url_returns_422_and_keeps_product`.

---

## File Map

| File | Responsibility |
| --- | --- |
| `backend/src/models/database_models.py` (modify) | `Store` table, `Product.store_id` |
| `backend/src/services/store_service.py` (create) | Domain normalization, name fallback, get-or-create, favicon read, `to_response` |
| `backend/src/schemas/store.py` (create) | `StoreResponse` |
| `backend/src/routers/store_router.py` (create) | `GET /stores/{id}/favicon` |
| `backend/src/api.py` (modify) | Register store router |
| `backend/src/schemas/product.py` (modify) | `store_id` on create; store fields on info/summary/detail |
| `backend/src/services/product_service.py` (modify) | Resolve store on create/update/extract; store fields in responses |
| `backend/src/stagehand_utils.py` (modify) | `store_name` in extraction, favicon fetch + validation |
| `backend/src/setup_backend.py` (modify) | Sample stores and a duplicated product |
| `backend/tests/test_stores.py` (create) | Store service + endpoint tests |
| `backend/tests/test_product_store.py` (create) | Product ↔ store resolution and response fields |
| `backend/tests/test_extraction.py` (create) | Favicon payload parsing and `extract_product_info` |
| `frontend/src/lib/api/stores.js` (+ test) (create) | `faviconUrl(storeId)` |
| `frontend/src/components/common/StoreBadge.jsx` (+ test) (create) | `StoreFavicon`, `StoreBadge` |
| `frontend/src/components/dashboard/ProductTable.jsx`, `ProductCardList.jsx` (+ tests) (modify) | Favicon before name, store name in meta line |
| `frontend/src/pages/ProductPage.jsx` (+ test) (modify) | Store badge, "Open in {store}" |
| `frontend/src/components/products/ProductFormDialog.jsx` (+ test) (modify) | Read-only store row, send `store_id` |
| `frontend/src/i18n/english.json`, `spanish.json` (modify) | New strings |
| `frontend/e2e/**` (modify) | Fixtures, favicon route, snapshots |
| `README.md`, `backend/README.md`, `frontend/README.md` (modify) | Docs |

---

### Task 1: `Store` model and store service

**Files:**
- Modify: `backend/src/models/database_models.py`
- Create: `backend/src/services/store_service.py`
- Test: `backend/tests/test_stores.py`

**Interfaces:**
- Produces:
  - `Store(id: int | None, domain: str, name: str, favicon: bytes | None, favicon_mime: str | None)`; `Product.store_id: int | None`
  - `store_service.normalize_domain(url: str) -> str` (raises `HTTPException(422)`)
  - `store_service.derive_name(domain: str) -> str`
  - `store_service.get_by_domain(session: Session, domain: str) -> Store | None`
  - `store_service.get_or_create(session, url: str, name: str | None = None, favicon: bytes | None = None, favicon_mime: str | None = None) -> Store`
  - `store_service.get_favicon(session, store_id: int) -> tuple[bytes, str]` (raises `HTTPException(404)`)

- [ ] **Step 1: Write the failing tests** — create `backend/tests/test_stores.py`:

```python
"""Tests for the store service and the store favicon endpoint."""

import pytest
from fastapi import HTTPException
from sqlmodel import select
from src.models.database_models import Store
from src.services import store_service

# --- normalize_domain ---


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.amazon.es/dp/B0?ref=1", "amazon.es"),
        ("https://WWW.Amazon.ES:443/dp/x", "amazon.es"),
        ("http://amazon.es./dp/x", "amazon.es"),
        ("https://es.aliexpress.com/item/1.html", "es.aliexpress.com"),
        ("https://www.pccomponentes.com/x", "pccomponentes.com"),
    ],
)
def test_normalize_domain_variants(url, expected):
    assert store_service.normalize_domain(url) == expected


@pytest.mark.parametrize("url", ["", "   ", "amazon.es/dp/x", "not a url"])
def test_normalize_domain_rejects_urls_without_host(url):
    with pytest.raises(HTTPException) as exc_info:
        store_service.normalize_domain(url)
    assert exc_info.value.status_code == 422


# --- derive_name ---


@pytest.mark.parametrize(
    ("domain", "expected"),
    [
        ("pccomponentes.com", "Pccomponentes"),
        ("es.aliexpress.com", "Aliexpress"),
        ("amazon.co.uk", "Amazon"),
        ("localhost", "Localhost"),
    ],
)
def test_derive_name(domain, expected):
    assert store_service.derive_name(domain) == expected


# --- get_or_create ---


def test_get_or_create_creates_store_with_given_name_and_favicon(session):
    store = store_service.get_or_create(
        session,
        "https://www.decathlon.es/p/1",
        name="  Decathlon  ",
        favicon=b"\x89PNG",
        favicon_mime="image/png",
    )

    assert store.id is not None
    assert store.domain == "decathlon.es"
    assert store.name == "Decathlon"
    assert store.favicon == b"\x89PNG"
    assert store.favicon_mime == "image/png"


def test_get_or_create_falls_back_to_derived_name(session):
    store = store_service.get_or_create(session, "https://pccomponentes.com/x", name="  ")

    assert store.name == "Pccomponentes"
    assert store.favicon is None
    assert store.favicon_mime is None


def test_get_or_create_drops_mime_without_favicon(session):
    store = store_service.get_or_create(
        session, "https://a.com/x", name="A", favicon=None, favicon_mime="image/png"
    )

    assert store.favicon_mime is None


def test_get_or_create_reuses_existing_store_unchanged(session):
    first = store_service.get_or_create(session, "https://amazon.es/a", name="Amazon")
    second = store_service.get_or_create(
        session,
        "https://www.amazon.es/b",
        name="Amazon Spain",
        favicon=b"x",
        favicon_mime="image/png",
    )

    assert second.id == first.id
    assert second.name == "Amazon"
    assert second.favicon is None
    assert len(session.exec(select(Store)).all()) == 1


def test_get_or_create_recovers_from_unique_race(session, monkeypatch):
    existing = Store(domain="amazon.es", name="Amazon")
    session.add(existing)
    session.commit()

    real_get_by_domain = store_service.get_by_domain
    calls = {"count": 0}

    def stale_first_lookup(session_, domain):
        # Simulates another request inserting the row between our lookup
        # and our insert: the first lookup misses, later ones see it.
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return real_get_by_domain(session_, domain)

    monkeypatch.setattr(store_service, "get_by_domain", stale_first_lookup)

    store = store_service.get_or_create(session, "https://amazon.es/x", name="Other")

    assert store.id == existing.id
    assert store.name == "Amazon"


# --- get_favicon ---


def test_get_favicon_returns_bytes_and_mime(session):
    store = store_service.get_or_create(
        session, "https://a.com", name="A", favicon=b"ico", favicon_mime="image/x-icon"
    )

    assert store_service.get_favicon(session, store.id) == (b"ico", "image/x-icon")


def test_get_favicon_404_when_store_missing_or_without_favicon(session):
    store = store_service.get_or_create(session, "https://a.com", name="A")

    for store_id in (store.id, 999):
        with pytest.raises(HTTPException) as exc_info:
            store_service.get_favicon(session, store_id)
        assert exc_info.value.status_code == 404
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_stores.py -v`
Expected: collection error `ImportError: cannot import name 'Store'`.

- [ ] **Step 3: Add the model** — in `backend/src/models/database_models.py`, insert before `class Product` and add the field to `Product`:

```python
class Store(SQLModel, table=True):
    """An online store (retailer), identified by its normalized domain.

    Shared by every product whose URL points to the same domain, so the
    favicon is downloaded and stored only once per store.
    """

    id: int | None = Field(default=None, primary_key=True)
    domain: str = Field(unique=True, index=True)  # e.g. "pccomponentes.com"
    name: str
    favicon: bytes | None = None  # Raw image bytes
    favicon_mime: str | None = None  # e.g. "image/png"
```

In `Product`, after `currency: str`:

```python
    store_id: int | None = Field(default=None, foreign_key="store.id", index=True)
```

- [ ] **Step 4: Create the service** — `backend/src/services/store_service.py`:

```python
"""
Store service — lookup, creation and favicon access for online stores.

A store is identified by the normalized domain of a product URL, so every
product pointing to the same domain shares one ``Store`` row (and its
favicon, which is therefore downloaded only once).
"""

from urllib.parse import urlparse

from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select
from src.models.database_models import Store

# Second-level labels used under country-code TLDs (e.g. "amazon.co.uk"),
# skipped when deriving a store name from its domain.
_SECOND_LEVEL_LABELS = {"co", "com", "org", "net", "gov", "ac", "edu"}


def normalize_domain(url: str) -> str:
    """Return the store domain for a product URL.

    The hostname is lower-cased, and a trailing dot and a leading ``www.``
    are removed. Other subdomains are kept, so ``es.aliexpress.com`` and
    ``aliexpress.com`` are different stores.

    Args:
        url (str): An absolute product URL.

    Returns:
        str: The normalized domain, e.g. ``"amazon.es"``.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    hostname = urlparse((url or "").strip()).hostname
    if not hostname or not hostname.strip("."):
        raise HTTPException(
            status_code=422, detail="Invalid product URL: no domain found."
        )
    return hostname.lower().rstrip(".").removeprefix("www.")


def derive_name(domain: str) -> str:
    """Build a readable fallback store name from its domain.

    Uses the registrable name label: ``pccomponentes.com`` → ``Pccomponentes``,
    ``es.aliexpress.com`` → ``Aliexpress``, ``amazon.co.uk`` → ``Amazon``.

    Args:
        domain (str): A normalized domain.

    Returns:
        str: The capitalized name label.
    """
    labels = domain.split(".")
    if len(labels) >= 3 and labels[-2] in _SECOND_LEVEL_LABELS:
        core = labels[-3]
    elif len(labels) >= 2:
        core = labels[-2]
    else:
        core = labels[0]
    return core.capitalize()


def get_by_domain(session: Session, domain: str) -> Store | None:
    """Return the store for a normalized domain, if any.

    Args:
        session (Session): Active database session.
        domain (str): A normalized domain.

    Returns:
        Store | None: The matching store.
    """
    return session.exec(select(Store).where(Store.domain == domain)).first()


def get_or_create(
    session: Session,
    url: str,
    name: str | None = None,
    favicon: bytes | None = None,
    favicon_mime: str | None = None,
) -> Store:
    """Return the store for a URL's domain, creating it if needed.

    An existing store is returned unchanged (the first name and favicon
    stored for a domain win). A new store uses ``name`` or, when it is
    empty, a name derived from the domain.

    Args:
        session (Session): Active database session.
        url (str): The product URL.
        name (str | None): Store name to use if the store is created.
        favicon (bytes | None): Favicon bytes to store if the store is created.
        favicon_mime (str | None): Favicon mime type (ignored without ``favicon``).

    Returns:
        Store: The existing or newly created store.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    domain = normalize_domain(url)
    store = get_by_domain(session, domain)
    if store:
        return store

    store = Store(
        domain=domain,
        name=(name or "").strip() or derive_name(domain),
        favicon=favicon,
        favicon_mime=favicon_mime if favicon else None,
    )
    session.add(store)
    try:
        session.commit()
    except IntegrityError:
        # Another request created this domain in the meantime: reuse it.
        session.rollback()
        return get_by_domain(session, domain)
    session.refresh(store)
    return store


def get_favicon(session: Session, store_id: int) -> tuple[bytes, str]:
    """Return a store's favicon bytes and mime type.

    Args:
        session (Session): Active database session.
        store_id (int): The store's primary key.

    Returns:
        tuple[bytes, str]: The favicon content and its mime type.

    Raises:
        HTTPException: 404 if the store does not exist or has no favicon.
    """
    store = session.get(Store, store_id)
    if not store or not store.favicon or not store.favicon_mime:
        raise HTTPException(status_code=404, detail="Favicon not found")
    return store.favicon, store.favicon_mime
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_stores.py -v`
Expected: all PASS. Then `uv run pytest` — the whole suite still passes.

- [ ] **Step 6: Commit**

```bash
git add backend/src/models/database_models.py backend/src/services/store_service.py backend/tests/test_stores.py
git commit -m "feat(backend): add Store model and store service"
```

---

### Task 2: `StoreResponse` schema and favicon endpoint

**Files:**
- Create: `backend/src/schemas/store.py`, `backend/src/routers/store_router.py`
- Modify: `backend/src/api.py`, `backend/src/services/store_service.py`
- Test: `backend/tests/test_stores.py` (append)

**Interfaces:**
- Consumes: `store_service.get_favicon`, `Store` (Task 1).
- Produces:
  - `StoreResponse(id: int, name: str, domain: str, has_favicon: bool)` in `src.schemas.store`
  - `store_service.to_response(store: Store) -> StoreResponse`
  - `GET /stores/{store_id}/favicon`

- [ ] **Step 1: Write the failing tests** — append to `backend/tests/test_stores.py`:

```python
# --- to_response ---


def test_to_response_reports_favicon_presence(session):
    with_icon = store_service.get_or_create(
        session, "https://a.com", name="A", favicon=b"x", favicon_mime="image/png"
    )
    without_icon = store_service.get_or_create(session, "https://b.com", name="B")

    assert store_service.to_response(with_icon).model_dump() == {
        "id": with_icon.id,
        "name": "A",
        "domain": "a.com",
        "has_favicon": True,
    }
    assert store_service.to_response(without_icon).has_favicon is False


# --- GET /stores/{id}/favicon ---


def test_favicon_endpoint_returns_bytes_with_stored_mime(client, session):
    store = store_service.get_or_create(
        session, "https://a.com", name="A", favicon=b"<svg/>", favicon_mime="image/svg+xml"
    )

    response = client.get(f"/stores/{store.id}/favicon")

    assert response.status_code == 200
    assert response.content == b"<svg/>"
    assert response.headers["content-type"] == "image/svg+xml"


def test_favicon_endpoint_sets_cache_and_security_headers(client, session):
    store = store_service.get_or_create(
        session, "https://a.com", name="A", favicon=b"<svg/>", favicon_mime="image/svg+xml"
    )

    response = client.get(f"/stores/{store.id}/favicon")

    assert response.headers["cache-control"] == "public, max-age=604800"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == (
        "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    )


def test_favicon_endpoint_404(client, session):
    store = store_service.get_or_create(session, "https://a.com", name="A")

    assert client.get(f"/stores/{store.id}/favicon").status_code == 404
    assert client.get("/stores/999/favicon").status_code == 404
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && uv run pytest tests/test_stores.py -v`
Expected: the 4 new tests FAIL (`AttributeError: ... has no attribute 'to_response'`, 404s on the endpoint).

- [ ] **Step 3: Implement**

`backend/src/schemas/store.py`:

```python
"""Response schemas for stores."""

from pydantic import BaseModel


class StoreResponse(BaseModel):
    """Public store information (the favicon is served separately)."""

    id: int
    name: str
    domain: str
    has_favicon: bool
```

Append to `backend/src/services/store_service.py` (and add `from src.schemas.store import StoreResponse` to its imports):

```python
def to_response(store: Store) -> StoreResponse:
    """Convert a store into its public response schema.

    Args:
        store (Store): The store to convert.

    Returns:
        StoreResponse: Store data without the favicon bytes.
    """
    return StoreResponse(
        id=store.id,
        name=store.name,
        domain=store.domain,
        has_favicon=bool(store.favicon),
    )
```

`backend/src/routers/store_router.py`:

```python
"""
Store router — serves store favicons.
"""

from fastapi import APIRouter, Response
from src.core.database import SessionDep
from src.services import store_service

router = APIRouter(tags=["stores"])

# Favicons never change once stored, so browsers may cache them for a week.
# The CSP/nosniff headers keep a stored SVG inert if opened directly.
FAVICON_HEADERS = {
    "Cache-Control": "public, max-age=604800",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
}


@router.get("/stores/{store_id}/favicon")
def get_store_favicon(store_id: int, session: SessionDep) -> Response:
    """Return the stored favicon image of a store."""
    content, mime = store_service.get_favicon(session, store_id)
    return Response(content=content, media_type=mime, headers=FAVICON_HEADERS)
```

In `backend/src/api.py`, add `store_router` to the router import tuple (alphabetical, after `product_router`) and register it:

```python
app.include_router(store_router.router)
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && uv run pytest tests/test_stores.py -v`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/schemas/store.py backend/src/routers/store_router.py backend/src/api.py backend/src/services/store_service.py backend/tests/test_stores.py
git commit -m "feat(backend): serve store favicons from /stores/{id}/favicon"
```

---

### Task 3: Resolve a product's store and expose store fields

**Files:**
- Modify: `backend/src/schemas/product.py`, `backend/src/services/product_service.py`
- Test: `backend/tests/test_product_store.py` (create)

**Interfaces:**
- Consumes: `store_service.normalize_domain`, `store_service.get_or_create` (Task 1).
- Produces:
  - `ProductCreate.store_id: int | None = None`
  - `ProductDashboardSummary` / `ProductDetailResponse` fields: `store_id: int | None`, `store_name: str | None`, `store_domain: str | None`, `store_has_favicon: bool`
  - `product_service._resolve_store(session, url: str, store_id: int | None = None) -> Store`

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_product_store.py`:

```python
"""Tests for linking products to stores and exposing store fields."""

from sqlmodel import select
from src.models.database_models import Category, Product, Store
from src.services import store_service


def _category(session):
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def _payload(category_id, url="https://www.amazon.es/dp/1", **overrides):
    return {
        "name": "Widget",
        "url": url,
        "priority": "medium",
        "category_id": category_id,
        "description": "A widget",
        "currency": "EUR",
        **overrides,
    }


# --- create ---


def test_create_uses_matching_store_id(client, session):
    category = _category(session)
    store = store_service.get_or_create(session, "https://amazon.es", name="Amazon")

    response = client.post("/products/", json=_payload(category.id, store_id=store.id))

    assert response.status_code == 200
    assert response.json()["store_id"] == store.id


def test_create_without_store_id_resolves_store_from_url(client, session):
    category = _category(session)

    response = client.post("/products/", json=_payload(category.id))

    store = session.get(Store, response.json()["store_id"])
    assert store.domain == "amazon.es"
    assert store.name == "Amazon"


def test_create_ignores_store_id_of_another_domain(client, session):
    category = _category(session)
    other = store_service.get_or_create(session, "https://decathlon.es", name="Decathlon")

    response = client.post("/products/", json=_payload(category.id, store_id=other.id))

    assert response.json()["store_id"] != other.id
    assert session.get(Store, response.json()["store_id"]).domain == "amazon.es"


def test_create_ignores_unknown_store_id(client, session):
    category = _category(session)

    response = client.post("/products/", json=_payload(category.id, store_id=999))

    assert response.status_code == 200
    assert session.get(Store, response.json()["store_id"]).domain == "amazon.es"


def test_create_with_invalid_url_returns_422(client, session):
    category = _category(session)

    response = client.post("/products/", json=_payload(category.id, url="amazon.es/dp/1"))

    assert response.status_code == 422
    assert session.exec(select(Product)).all() == []


# --- update ---


def _created(client, session):
    category = _category(session)
    return client.post("/products/", json=_payload(category.id)).json()


def test_update_same_domain_keeps_store(client, session):
    product = _created(client, session)

    response = client.patch(
        f"/products/{product['id']}", json={"url": "https://amazon.es/dp/2"}
    )

    assert response.json()["store_id"] == product["store_id"]


def test_update_new_domain_switches_store(client, session):
    product = _created(client, session)

    response = client.patch(
        f"/products/{product['id']}", json={"url": "https://www.decathlon.es/p/9"}
    )

    new_store = session.get(Store, response.json()["store_id"])
    assert new_store.domain == "decathlon.es"
    assert new_store.id != product["store_id"]


def test_update_without_url_keeps_store(client, session):
    product = _created(client, session)

    response = client.patch(f"/products/{product['id']}", json={"name": "Renamed"})

    assert response.json()["store_id"] == product["store_id"]


def test_update_with_invalid_url_returns_422_and_keeps_product(client, session):
    product = _created(client, session)

    response = client.patch(f"/products/{product['id']}", json={"url": "nonsense"})

    assert response.status_code == 422
    stored = session.get(Product, product["id"])
    session.refresh(stored)
    assert stored.url == "https://www.amazon.es/dp/1"
    assert stored.store_id == product["store_id"]


# --- dashboard summary / detail ---


def test_summary_and_detail_include_store_fields(client, session):
    category = _category(session)
    store = store_service.get_or_create(
        session, "https://amazon.es", name="Amazon", favicon=b"x", favicon_mime="image/png"
    )
    product = client.post(
        "/products/", json=_payload(category.id, store_id=store.id)
    ).json()

    summary = client.get("/products/dashboard-summary").json()[0]
    detail = client.get(f"/products/{product['id']}").json()

    for data in (summary, detail):
        assert data["store_id"] == store.id
        assert data["store_name"] == "Amazon"
        assert data["store_domain"] == "amazon.es"
        assert data["store_has_favicon"] is True


def test_summary_store_fields_empty_for_product_without_store(client, session):
    category = _category(session)
    session.add(
        Product(
            name="Legacy",
            url="https://example.com",
            priority="low",
            category_id=category.id,
            description="",
            currency="EUR",
        )
    )
    session.commit()

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["store_id"] is None
    assert data["store_name"] is None
    assert data["store_domain"] is None
    assert data["store_has_favicon"] is False
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && uv run pytest tests/test_product_store.py -v`
Expected: FAIL (`store_id` missing from responses / `KeyError`).

- [ ] **Step 3: Update schemas** — `backend/src/schemas/product.py`:

In `ProductCreate`, after `currency: str`:

```python
    store_id: int | None = None
```

In both `ProductDashboardSummary` and `ProductDetailResponse`, after `currency: str`:

```python
    store_id: int | None
    store_name: str | None
    store_domain: str | None
    store_has_favicon: bool
```

- [ ] **Step 4: Update the product service** — `backend/src/services/product_service.py`:

Imports: add `Store` to the `database_models` import and `from src.services import store_service`.

Add after the imports, before `# --- CRUD operations ---`:

```python
# --- Store resolution ---


def _resolve_store(session: Session, url: str, store_id: int | None = None) -> Store:
    """Return the store a product URL belongs to.

    ``store_id`` is reused only when it exists and matches the URL's
    domain; otherwise the store is looked up (or created) from the URL,
    which is always the source of truth.

    Args:
        session (Session): Active database session.
        url (str): The product URL.
        store_id (int | None): A candidate store (e.g. from extraction).

    Returns:
        Store: The product's store.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    domain = store_service.normalize_domain(url)
    if store_id is not None:
        store = session.get(Store, store_id)
        if store and store.domain == domain:
            return store
    return store_service.get_or_create(session, url)


def _store_fields(session: Session, store_id: int | None) -> dict:
    """Return the store fields shared by the summary and detail responses.

    Args:
        session (Session): Active database session.
        store_id (int | None): The product's store id.

    Returns:
        dict: ``store_id``, ``store_name``, ``store_domain`` and
            ``store_has_favicon`` (empty values when there is no store).
    """
    store = session.get(Store, store_id) if store_id is not None else None
    return {
        "store_id": store.id if store else None,
        "store_name": store.name if store else None,
        "store_domain": store.domain if store else None,
        "store_has_favicon": bool(store and store.favicon),
    }
```

Replace the body of `create` (keep its docstring, adding `Raises: HTTPException: 422 if the URL has no hostname.`):

```python
    store = _resolve_store(session, payload.url, payload.store_id)
    product = Product.model_validate(payload, update={"store_id": store.id})
    session.add(product)
    session.commit()
    session.refresh(product)
    return product
```

In `update`, replace `product_data = payload.model_dump(exclude_unset=True)` with:

```python
    product_data = payload.model_dump(exclude_unset=True)
    if product_data.get("url") is not None:
        # Keeps the current store when the domain is unchanged.
        product_data["store_id"] = _resolve_store(
            session, product_data["url"], product.store_id
        ).id
```

and add `422 if a new URL has no hostname` to its `Raises:` docstring.

In `get_dashboard_summary`, add to the `ProductDashboardSummary(...)` call, after `currency=product.currency,`:

```python
                **_store_fields(session, product.store_id),
```

In `get_detail`, add to the `ProductDetailResponse(...)` call, after `currency=product.currency,`:

```python
        **_store_fields(session, product.store_id),
```

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && uv run pytest -v`
Expected: all PASS (new file plus the existing suite).

- [ ] **Step 6: Commit**

```bash
git add backend/src/schemas/product.py backend/src/services/product_service.py backend/tests/test_product_store.py
git commit -m "feat(backend): link products to their store and expose store fields"
```

---

### Task 4: Extract the store name and favicon

**Files:**
- Modify: `backend/src/stagehand_utils.py`, `backend/src/schemas/product.py`, `backend/src/services/product_service.py`
- Test: `backend/tests/test_extraction.py` (create)

**Interfaces:**
- Consumes: `store_service.normalize_domain`, `get_by_domain`, `get_or_create`, `to_response` (Tasks 1–2); `StoreResponse`.
- Produces:
  - `stagehand_utils.MAX_FAVICON_BYTES = 256 * 1024`
  - `stagehand_utils.FaviconData(content: bytes, mime: str)`
  - `stagehand_utils.parse_favicon_payload(raw: object) -> FaviconData | None`
  - `stagehand_utils.ProductInfoResult(info: ProductInfoExtraction, favicon: FaviconData | None)`
  - `stagehand_utils.get_product_info(google_api_key, url, language, categories, fetch_favicon: bool = True) -> ProductInfoResult`
  - `ProductInfoExtraction.store_name: str`
  - `ProductInfoResponse.store: StoreResponse` — JSON: `{"name", "category", "description", "currency", "store": {"id", "name", "domain", "has_favicon"}}`

- [ ] **Step 1: Probe `page.evaluate` promise handling (throwaway, not committed)**

The favicon is downloaded by an async script inside the page. Confirm Stagehand's `page.evaluate` awaits a returned promise. Write `$SCRATCHPAD/probe_evaluate.py` (scratchpad dir, not the repo):

```python
import asyncio
import os

from dotenv import load_dotenv
from src.stagehand_utils import _open_product_page

load_dotenv(override=True)


async def main():
    async with _open_product_page(os.getenv("ASD_GOOGLE"), "https://example.com") as (_, page):
        value = await page.evaluate(
            "(async () => { await new Promise((r) => setTimeout(r, 50)); return 'ok'; })()"
        )
        print(repr(value))


asyncio.run(main())
```

Run: `cd backend && uv run python $SCRATCHPAD/probe_evaluate.py`
Expected: `'ok'`. If it prints anything else (e.g. `{}` or `None`), stop and report: the favicon download in Step 4 must then move to Python (`httpx` with the page's `User-Agent`), which is a design change to confirm with the user.

- [ ] **Step 2: Write the failing tests** — `backend/tests/test_extraction.py`:

```python
"""Tests for favicon payload parsing and the product-info extraction flow."""

import base64
import json

import pytest
from src.models.database_models import Category, Config, Store
from src.services import product_service, store_service
from src.stagehand_utils import (
    MAX_FAVICON_BYTES,
    FaviconData,
    ProductInfoExtraction,
    ProductInfoResult,
    parse_favicon_payload,
)


def _payload(mime="image/png", content=b"\x89PNG"):
    return json.dumps({"mime": mime, "data": base64.b64encode(content).decode()})


# --- parse_favicon_payload ---


def test_parse_favicon_payload_accepts_image():
    assert parse_favicon_payload(_payload()) == FaviconData(
        content=b"\x89PNG", mime="image/png"
    )


def test_parse_favicon_payload_strips_mime_parameters_and_case():
    result = parse_favicon_payload(_payload(mime="Image/SVG+XML; charset=utf-8"))

    assert result.mime == "image/svg+xml"


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "not json",
        json.dumps(["list"]),
        json.dumps({"mime": "image/png"}),
        json.dumps({"mime": "image/png", "data": "***not base64***"}),
        _payload(mime="text/html", content=b"<html>404</html>"),
        _payload(mime="application/octet-stream"),
        _payload(content=b""),
        _payload(content=b"x" * (MAX_FAVICON_BYTES + 1)),
    ],
)
def test_parse_favicon_payload_rejects_invalid(raw):
    assert parse_favicon_payload(raw) is None


def test_parse_favicon_payload_accepts_max_size():
    assert parse_favicon_payload(_payload(content=b"x" * MAX_FAVICON_BYTES))


# --- extract_product_info ---


@pytest.fixture
def extraction_setup(session, monkeypatch):
    """Seed the config/categories and replace Stagehand with a fake."""
    session.add(Category(name="Electronics", color="#000"))
    session.add(Config(key="google_api_key", value="key"))
    session.commit()

    calls = []

    async def fake_get_product_info(
        google_api_key, url, language, categories, fetch_favicon=True
    ):
        calls.append({"url": url, "fetch_favicon": fetch_favicon})
        return ProductInfoResult(
            info=ProductInfoExtraction(
                name="Widget",
                category="Electronics",
                currency="EUR",
                description="A widget",
                store_name="Amazon",
            ),
            favicon=FaviconData(content=b"ico", mime="image/x-icon")
            if fetch_favicon
            else None,
        )

    monkeypatch.setattr(product_service, "get_product_info", fake_get_product_info)
    return calls


def test_extract_new_domain_fetches_favicon_and_creates_store(
    client, session, extraction_setup
):
    response = client.post(
        "/extract-product-info/", json={"url": "https://www.amazon.es/dp/1"}
    )

    assert response.status_code == 200
    assert extraction_setup == [
        {"url": "https://www.amazon.es/dp/1", "fetch_favicon": True}
    ]
    body = response.json()
    assert body["name"] == "Widget"
    store = session.get(Store, body["store"]["id"])
    assert body["store"] == {
        "id": store.id,
        "name": "Amazon",
        "domain": "amazon.es",
        "has_favicon": True,
    }
    assert store.favicon == b"ico"
    assert store.favicon_mime == "image/x-icon"


def test_extract_known_domain_skips_favicon_and_reuses_store(
    client, session, extraction_setup
):
    existing = store_service.get_or_create(session, "https://amazon.es", name="Amazon.es")

    response = client.post(
        "/extract-product-info/", json={"url": "https://amazon.es/dp/2"}
    )

    assert extraction_setup[0]["fetch_favicon"] is False
    assert response.json()["store"]["id"] == existing.id
    assert response.json()["store"]["name"] == "Amazon.es"


def test_extract_invalid_url_returns_422_without_scraping(client, extraction_setup):
    response = client.post("/extract-product-info/", json={"url": "amazon.es"})

    assert response.status_code == 422
    assert extraction_setup == []
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && uv run pytest tests/test_extraction.py -v`
Expected: collection error `ImportError: cannot import name 'MAX_FAVICON_BYTES'`.

- [ ] **Step 4: Implement the extraction helpers** — `backend/src/stagehand_utils.py`:

Update the module docstring's last sentence to: "…and extracts structured data validated by a Pydantic model. Product-info extraction can also download the store favicon from the loaded page."

Add imports: `import base64`, `import binascii`, `import json`.

After `CHROME_ARGS`, add:

```python
# Largest favicon accepted (bytes); anything bigger is ignored.
MAX_FAVICON_BYTES = 256 * 1024

# Runs inside the product page: tries the declared icons (``rel=icon`` first,
# then ``apple-touch-icon``) and ``/favicon.ico``, downloading them with the
# page's own session (so anti-bot checks already passed apply). Returns a JSON
# string ``{"mime", "data"}`` (base64) for the first usable image, or null.
FAVICON_SCRIPT = """
(async () => {
  const MAX_BYTES = %d;
  const links = Array.from(document.querySelectorAll('link[rel][href]'))
    .filter((link) => /(^|\\s)(icon|apple-touch-icon)(\\s|$)/i.test(link.rel));
  const rank = (link) => (/apple-touch-icon/i.test(link.rel) ? 1 : 0);
  const candidates = links.sort((a, b) => rank(a) - rank(b)).map((l) => l.href);
  candidates.push(new URL('/favicon.ico', location.origin).href);
  for (const href of candidates) {
    try {
      const response = await fetch(href, { credentials: 'include' });
      if (!response.ok) continue;
      const blob = await response.blob();
      const mime = blob.type.startsWith('image/')
        ? blob.type
        : /\\.ico(\\?|$)/i.test(href) ? 'image/x-icon' : '';
      if (!mime || blob.size === 0 || blob.size > MAX_BYTES) continue;
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let binary = '';
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return JSON.stringify({ mime, data: btoa(binary) });
    } catch (error) {
      // Unreachable or CORS-blocked candidate: try the next one.
    }
  }
  return null;
})()
""" % MAX_FAVICON_BYTES
```

Add `store_name` to `ProductInfoExtraction` (after `description`) and update its docstring to "(name, category, currency, description, store)":

```python
    store_name: str = Field(
        description=(
            "Name of the online store/retailer selling the product "
            "(e.g. Amazon, Decathlon, PcComponentes)"
        )
    )
```

After `ProductInfoExtraction`, add:

```python
class FaviconData(BaseModel):
    """A validated favicon image downloaded from the store page."""

    content: bytes
    mime: str


class ProductInfoResult(BaseModel):
    """Product information plus the store favicon, if it was fetched."""

    info: ProductInfoExtraction
    favicon: FaviconData | None = None


def parse_favicon_payload(raw: object) -> FaviconData | None:
    """Validate the JSON string returned by ``FAVICON_SCRIPT``.

    Args:
        raw (object): The value returned by ``page.evaluate``.

    Returns:
        FaviconData | None: The favicon if it is a non-empty ``image/*``
            of at most ``MAX_FAVICON_BYTES``; otherwise None.
    """
    if not isinstance(raw, str) or not raw:
        return None
    try:
        payload = json.loads(raw)
        mime = str(payload["mime"]).split(";")[0].strip().lower()
        content = base64.b64decode(payload["data"], validate=True)
    except (ValueError, KeyError, TypeError, binascii.Error):
        return None
    if not mime.startswith("image/") or not 0 < len(content) <= MAX_FAVICON_BYTES:
        return None
    return FaviconData(content=content, mime=mime)
```

In the `# --- Internal helpers ---` section, after `_open_product_page`, add:

```python
async def _fetch_favicon(page: Page) -> FaviconData | None:
    """Download the favicon of the page currently loaded.

    Never raises: any failure is logged and results in None, so a missing
    favicon never breaks the product extraction.

    Args:
        page (Page): The loaded product page.

    Returns:
        FaviconData | None: The favicon, or None if none could be fetched.
    """
    try:
        return parse_favicon_payload(await page.evaluate(FAVICON_SCRIPT))
    except Exception as error:  # noqa: BLE001 - best effort by design
        print(f"Could not fetch favicon: {error}")
        return None
```

Replace `get_product_info` with:

```python
async def get_product_info(
    google_api_key: str,
    url: str,
    language: str,
    categories: list[str],
    fetch_favicon: bool = True,
) -> ProductInfoResult:
    """Fetch the product information (and store favicon) from the given URL.

    Args:
        google_api_key (str): The Google API key for the AI model.
        url (str): The URL of the product page.
        language (str): The language to use for the extraction output.
        categories (list[str]): List of possible product categories to choose from.
        fetch_favicon (bool): Whether to download the store favicon too
            (skipped when the store is already known).

    Returns:
        ProductInfoResult: The extracted information and the favicon, if any.

    Raises:
        pydantic.ValidationError: If the extracted data doesn't match the schema.
    """
    async with _open_product_page(google_api_key, url) as (stagehand, page):
        result = await stagehand.extract(
            (
                f"Extract the product name, category, currency, description and store name. "
                f"The name should be short and descriptive, including a short sequence of words like: brand, type, specs, etc. "
                f"For description, provide a concise summary of the product's key features and uses. "
                f"For categories, select one from the following list, the most accurate: {', '.join(categories)} "
                f"For currency, extract the currency code (e.g., EUR, USD, GBP) used for the product price. "
                f"For store name, give the brand name of the online store selling the product (e.g., Amazon, Decathlon, PcComponentes), not the product brand. "
                f"The product information should be provided in {language} language."
            ),
            ProductInfoExtraction,
            page=page,
        )
        favicon = await _fetch_favicon(page) if fetch_favicon else None
    print(f"Extracted product info: {result.data} (favicon: {favicon is not None})")
    return ProductInfoResult(info=result.data, favicon=favicon)
```

- [ ] **Step 5: Update the response schema** — `backend/src/schemas/product.py`: add `from src.schemas.store import StoreResponse` and, in `ProductInfoResponse` after `currency: str`:

```python
    store: StoreResponse
```

- [ ] **Step 6: Update the service** — in `product_service.extract_product_info`, add as the first statement of the body:

```python
    # Validate the URL before any database or browser work.
    domain = store_service.normalize_domain(request.url)
```

Replace everything from `# Delegate to Stagehand` to the end of the function with:

```python
    # Delegate to Stagehand; the favicon is only downloaded for new stores.
    existing_store = store_service.get_by_domain(session, domain)
    result = await get_product_info(
        google_api_key,
        request.url,
        selected_language,
        category_names,
        fetch_favicon=existing_store is None,
    )
    product_info = result.info

    store = existing_store or store_service.get_or_create(
        session,
        request.url,
        name=product_info.store_name,
        favicon=result.favicon.content if result.favicon else None,
        favicon_mime=result.favicon.mime if result.favicon else None,
    )

    return ProductInfoResponse(
        name=product_info.name,
        category=product_info.category,
        description=product_info.description,
        currency=product_info.currency,
        store=store_service.to_response(store),
    )
```

Update its docstring: mention the store is created (with favicon) when its domain is new, and add `422 if the URL has no hostname` to `Raises:`.

- [ ] **Step 7: Run to verify pass**

Run: `cd backend && uv run pytest -v`
Expected: all PASS.

- [ ] **Step 8: Manual smoke check of the real favicon download** (needs `ASD_GOOGLE` in `backend/.env` and Chrome)

Run: `cd backend && uv run python -m src.stagehand_utils`
Expected: the log line `Extracted product info: ... store_name='...' ... (favicon: True)`. If `favicon: False`, open the test URL in a browser, check its `<link rel="icon">`, and report the finding before changing `FAVICON_SCRIPT`.

- [ ] **Step 9: Commit**

```bash
git add backend/src/stagehand_utils.py backend/src/schemas/product.py backend/src/services/product_service.py backend/tests/test_extraction.py
git commit -m "feat(backend): extract the store name and favicon with the product info"
```

---

### Task 5: Sample data and backend docs

**Files:**
- Modify: `backend/src/setup_backend.py`, `README.md`, `backend/README.md`

**Interfaces:**
- Consumes: `Store`, `Product.store_id` (Task 1).

- [ ] **Step 1: Seed stores** — in `populate_test_data` (`backend/src/setup_backend.py`), add `Store` to the models import. After the categories block, add:

```python
        # Create stores (no favicons: they are fetched on real extractions)
        print("Creating stores...")
        thomann = Store(domain="thomann.es", name="Thomann")
        amazon = Store(domain="amazon.es", name="Amazon")
        session.add(thomann)
        session.add(amazon)
        session.commit()
        session.refresh(thomann)
        session.refresh(amazon)
        print(f"  ✓ Created stores: {thomann.name}, {amazon.name}")
```

Set `store_id=thomann.id` on the existing `producto`. Then replace the single-product history loop with a loop over two products — the same drum kit in both stores, so the duplicate use case is visible:

```python
        # Same product in a second store, with its own prices
        producto_amazon = Product(
            name="Millenium MPS-850 E-Drum Set Bundle",
            url="https://www.amazon.es/dp/B07MPS850",
            category_id=electronica.id,
            priority="high",
            description="Set de batería electrónica Millenium MPS-850 con todo lo necesario para empezar a tocar.",
            currency="EUR",
            store_id=amazon.id,
        )
        session.add(producto_amazon)
        session.commit()
        session.refresh(producto_amazon)
        print(f"  ✓ Created product: {producto_amazon.name} (ID: {producto_amazon.id}, store: {amazon.name})")
```

Wrap the existing 60-day history loop in `for product, base_price in ((producto, 599.99), (producto_amazon, 629.99)):`, using `product.id` for `product_id` and deleting the old `base_price = 599.99` line; update its print to `"  ✓ Created 60 price history records per product"`.

- [ ] **Step 2: Verify the script** (uses a temporary copy, never the real DB)

Run: `cd backend && uv run python -c "import src.setup_backend as s, tempfile, os; d=tempfile.mkdtemp(); p=os.path.join(d,'t.db'); e=s.create_database_and_tables(p, f'sqlite:///{p}'); s.populate_test_data(e)"`
Expected: output ends with `✓ Test data populated successfully` and lists both stores and products.

- [ ] **Step 3: Update docs**

`README.md`:
- Key Features table: add a row `| **Store Detection** | Each product records its store (AI-extracted name + favicon downloaded from the page), shown on the dashboard and detail page, so the same item tracked in several stores is easy to tell apart. |` after "AI-Powered Extraction", and add "store" to the AI-Powered Extraction list of extracted fields.
- Database Schema: "There are 5 tables"; add a `Store` box (`id (PK)`, `domain (UNIQUE)`, `name`, `favicon (BLOB)`, `favicon_mime`) linked `1:N` to `Product`, and add `store_id (FK)` to the `Product` box.
- API Reference: add after "Products":

```markdown
### Stores

| Method | Endpoint                | Description                                                      |
| ------ | ----------------------- | ---------------------------------------------------------------- |
| `GET`  | `/stores/{id}/favicon`  | Store favicon image (cached for a week; 404 if none was found)   |
```

- In the Products table, note that dashboard-summary and detail include `store_id`, `store_name`, `store_domain`, `store_has_favicon`; in AI Extraction, that the response includes `store`.
- Project Structure tree: add `store.py` under schemas, `store_service.py` under services, `store_router.py` under routers.

`backend/README.md` testing paragraph: add "the store linking and favicon endpoint (`test_stores.py`, `test_product_store.py`) and the favicon validation/extraction flow with Stagehand mocked (`test_extraction.py`)".

Run: `npx --prefix frontend prettier --check README.md backend/README.md` and fix with `--write` if needed.

- [ ] **Step 4: Commit**

```bash
git add backend/src/setup_backend.py README.md backend/README.md
git commit -m "docs: document stores and seed sample stores"
```

---

### Task 6: `faviconUrl`, `StoreFavicon` / `StoreBadge` and i18n

**Files:**
- Create: `frontend/src/lib/api/stores.js`, `frontend/src/lib/api/stores.test.js`, `frontend/src/components/common/StoreBadge.jsx`, `frontend/src/components/common/StoreBadge.test.jsx`
- Modify: `frontend/src/lib/api/index.js`, `frontend/src/components/common/index.js`, `frontend/src/i18n/english.json`, `frontend/src/i18n/spanish.json`

**Interfaces:**
- Produces:
  - `faviconUrl(storeId: number|string) => string` in `@/lib/api/stores` (also `stores.faviconUrl` from `@/lib/api`)
  - `<StoreFavicon storeId hasFavicon size="sm"|"md" />` — favicon `<img alt="">`, or `LuStore` fallback
  - `<StoreBadge storeId name hasFavicon size="sm"|"md" />` — favicon + name; renders nothing when `name` is empty
  - i18n: `components.productFormDialog.fields.store`, `pages.product.actions.openInStore` (`{{store}}`)
- Components import `faviconUrl` from `@/lib/api/stores` (not the `@/lib/api` barrel), so existing tests that `vi.mock('@/lib/api')` keep working.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/api/stores.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { API_URL } from './client';
import { faviconUrl } from './stores';

describe('stores api module', () => {
  it('faviconUrl points to /stores/:id/favicon on the API origin', () => {
    expect(faviconUrl(7)).toBe(`${API_URL}/stores/7/favicon`);
  });
});
```

`frontend/src/components/common/StoreBadge.test.jsx`:

```jsx
import { fireEvent, screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/renderWithProviders';
import { spyOnConsoleError } from '@/test/consoleErrors';
import { faviconUrl } from '@/lib/api/stores';
import { StoreBadge, StoreFavicon } from './StoreBadge';

describe('StoreFavicon', () => {
  it('renders the favicon as a decorative image', () => {
    const getUnexpectedErrors = spyOnConsoleError();
    const { container } = renderWithProviders(
      <StoreFavicon storeId={7} hasFavicon />
    );

    const img = container.querySelector('img');
    expect(img).toHaveAttribute('src', faviconUrl(7));
    expect(img).toHaveAttribute('alt', '');
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('shows the fallback icon when the store has no favicon', () => {
    const { container } = renderWithProviders(
      <StoreFavicon storeId={7} hasFavicon={false} />
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('shows the fallback icon when the favicon fails to load', () => {
    const { container } = renderWithProviders(
      <StoreFavicon storeId={7} hasFavicon />
    );

    fireEvent.error(container.querySelector('img'));

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});

describe('StoreBadge', () => {
  it('renders the favicon and the store name', () => {
    const { container } = renderWithProviders(
      <StoreBadge storeId={7} name="Amazon" hasFavicon />
    );

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute('src', faviconUrl(7));
  });

  it('renders nothing without a store name', () => {
    const { container } = renderWithProviders(
      <StoreBadge storeId={null} name={null} hasFavicon={false} />
    );

    expect(container.querySelector('img, svg')).toBeNull();
    expect(container).not.toHaveTextContent(/\S/);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/lib/api/stores.test.js src/components/common/StoreBadge.test.jsx`
Expected: FAIL (`Failed to resolve import "./stores"` / `"./StoreBadge"`).

- [ ] **Step 3: Implement**

`frontend/src/lib/api/stores.js`:

```js
import { API_URL } from './client';

/**
 * URL of a store's favicon image (`GET /stores/{id}/favicon`). Used directly
 * as an `<img src>`, so the browser caches it (the API sends a week-long
 * `Cache-Control`).
 * @param {number|string} storeId
 * @returns {string}
 */
export const faviconUrl = (storeId) => `${API_URL}/stores/${storeId}/favicon`;
```

`frontend/src/lib/api/index.js`: add `export * as stores from './stores';`.

`frontend/src/components/common/StoreBadge.jsx`:

```jsx
import { useState } from 'react';
import { HStack, Icon, Image, Text } from '@chakra-ui/react';
import { LuStore } from 'react-icons/lu';
import { faviconUrl } from '@/lib/api/stores';

/** Rendered favicon size per badge size. */
const FAVICON_BOX_SIZES = { sm: '16px', md: '20px' };

/**
 * A store's favicon, served by the backend. Falls back to the Lucide store
 * icon when the store has no favicon or the image fails to load. Always
 * decorative (`alt=""`): the store name is rendered as text next to it.
 *
 * @param {object} props
 * @param {number|null} props.storeId
 * @param {boolean} props.hasFavicon - Whether the backend stored a favicon.
 * @param {'sm'|'md'} [props.size='sm']
 * @param {object} [rest] - Forwarded to the image or icon.
 */
export const StoreFavicon = ({ storeId, hasFavicon, size = 'sm', ...rest }) => {
  const [failedSrc, setFailedSrc] = useState(null);
  const src = hasFavicon && storeId != null ? faviconUrl(storeId) : null;

  if (!src || failedSrc === src) {
    return (
      <Icon
        as={LuStore}
        size={size}
        color="fg.muted"
        flexShrink={0}
        aria-hidden="true"
        {...rest}
      />
    );
  }

  return (
    <Image
      src={src}
      alt=""
      boxSize={FAVICON_BOX_SIZES[size]}
      borderRadius="xs"
      objectFit="contain"
      flexShrink={0}
      onError={() => setFailedSrc(src)}
      {...rest}
    />
  );
};

/**
 * The store a product belongs to: favicon + name. Renders nothing when the
 * product has no store. `sm` is muted, for dense lists; `md` is for the
 * product page and form.
 *
 * @param {object} props
 * @param {number|null} props.storeId
 * @param {string|null} props.name
 * @param {boolean} props.hasFavicon
 * @param {'sm'|'md'} [props.size='sm']
 * @param {object} [rest] - Forwarded to the wrapping `HStack`.
 */
export const StoreBadge = ({
  storeId,
  name,
  hasFavicon,
  size = 'sm',
  ...rest
}) => {
  if (!name) return null;

  return (
    <HStack gap={1.5} minW={0} {...rest}>
      <StoreFavicon storeId={storeId} hasFavicon={hasFavicon} size={size} />
      <Text
        textStyle={size === 'md' ? 'sm' : 'xs'}
        fontWeight="medium"
        color={size === 'md' ? 'fg' : 'fg.muted'}
        truncate
      >
        {name}
      </Text>
    </HStack>
  );
};
```

`frontend/src/components/common/index.js`: add `export { StoreBadge, StoreFavicon } from './StoreBadge';`.

i18n — `english.json`: `components.productFormDialog.fields.store` = `"Store"`; `pages.product.actions.openInStore` = `"Open in {{store}}"`.
`spanish.json`: `components.productFormDialog.fields.store` = `"Tienda"`; `pages.product.actions.openInStore` = `"Abrir en {{store}}"`.

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/lib/api src/components/common`
Expected: all PASS (includes `index.test.js` for the barrel; if it asserts the exact export list, add `stores` there).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/api frontend/src/components/common frontend/src/i18n
git commit -m "feat(frontend): add StoreBadge and StoreFavicon components"
```

---

### Task 7: Store on the dashboard list

**Files:**
- Modify: `frontend/src/components/dashboard/ProductTable.jsx`, `frontend/src/components/dashboard/ProductCardList.jsx`
- Test: `frontend/src/components/dashboard/ProductTable.test.jsx`, `frontend/src/components/dashboard/ProductCardList.test.jsx`

**Interfaces:**
- Consumes: `StoreFavicon` from `@/components/common` (Task 6); summary fields `store_id`, `store_name`, `store_has_favicon` (Task 3).

- [ ] **Step 1: Write the failing tests**

In both test files, add to the shared `PRODUCT` fixture:

```js
  store_id: 7,
  store_name: 'Amazon',
  store_domain: 'amazon.es',
  store_has_favicon: true,
```

Add `import { faviconUrl } from '@/lib/api/stores';` and this test to each `describe` (use each file's existing render helper — `renderTable()` in `ProductTable.test.jsx`, the equivalent helper in `ProductCardList.test.jsx`):

```jsx
  it('shows the store favicon and name for each product', () => {
    const { container } = renderTable();

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(container.querySelector('img')).toHaveAttribute(
      'src',
      faviconUrl(7)
    );
  });
```

(`Sparkline` renders an SVG, not an `<img>`, so the only `<img>` in a row is the favicon.)

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/dashboard`
Expected: the two new tests FAIL (`Unable to find an element with the text: Amazon`).

- [ ] **Step 3: Implement**

`ProductTable.jsx`: import `HStack` from `@chakra-ui/react` and `StoreFavicon` from `@/components/common`. Replace the name cell's `VStack` content with:

```jsx
        <VStack align="flex-start" gap={1}>
          <HStack gap={2} minW={0}>
            <StoreFavicon
              storeId={product.store_id}
              hasFavicon={product.store_has_favicon}
            />
            <Link href={`/product/${product.id}`} asChild>
              {/* existing <Text as="a" ...>{product.name}</Text>, unchanged */}
            </Link>
          </HStack>
          <HStack gap={2} wrap="wrap">
            {product.store_name && (
              <Text textStyle="xs" color="fg.muted">
                {product.store_name}
              </Text>
            )}
            <CategoryTag
              name={product.category_name}
              color={product.category_color}
            />
          </HStack>
        </VStack>
```

(Keep the existing `<Text as="a" …>` element exactly as it is inside `Link`.)

`ProductCardList.jsx`: import `HStack` and `StoreFavicon` the same way. Replace the name `Text` and `CategoryTag` with:

```jsx
            <HStack gap={2} minW={0}>
              <StoreFavicon
                storeId={product.store_id}
                hasFavicon={product.store_has_favicon}
              />
              <Text fontWeight="medium" color="fg">
                {product.name}
              </Text>
            </HStack>
            <HStack gap={2} wrap="wrap">
              {product.store_name && (
                <Text textStyle="xs" color="fg.muted">
                  {product.store_name}
                </Text>
              )}
              <CategoryTag
                name={product.category_name}
                color={product.category_color}
              />
            </HStack>
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/components/dashboard src/pages`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/dashboard
git commit -m "feat(frontend): show the store on dashboard rows and cards"
```

---

### Task 8: Store on the product detail page

**Files:**
- Modify: `frontend/src/pages/ProductPage.jsx`
- Test: `frontend/src/pages/ProductPage.test.jsx`

**Interfaces:**
- Consumes: `StoreBadge` (Task 6); detail fields `store_id`, `store_name`, `store_has_favicon` (Task 3); i18n `pages.product.actions.openInStore`.

- [ ] **Step 1: Write the failing test** — add to `ProductPage.test.jsx`'s `describe` (uses the file's `buildProduct` and `renderProductPage` helpers):

```jsx
  it('shows the store badge and names the store on the store link', async () => {
    const getUnexpectedErrors = spyOnConsoleError();
    productsApi.get.mockResolvedValue(
      buildProduct({
        store_id: 7,
        store_name: 'Amazon',
        store_domain: 'amazon.es',
        store_has_favicon: true
      })
    );

    renderProductPage();

    expect(
      await screen.findByRole('link', { name: 'Open in Amazon' })
    ).toHaveAttribute('href', 'https://example.com/keyboard');
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(getUnexpectedErrors()).toEqual([]);
  });
```

The existing test asserting `'Open store page'` stays valid as long as `buildProduct()` has no `store_name` (add `store_name: null, store_id: null, store_domain: null, store_has_favicon: false` to `buildProduct`'s defaults so it mirrors the API shape).

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/pages/ProductPage.test.jsx`
Expected: the new test FAILS (no link named "Open in Amazon").

- [ ] **Step 3: Implement** — `ProductPage.jsx`: import `StoreBadge` from `@/components/common` (extend the existing import). Change the store button label:

```jsx
                {product.store_name
                  ? t('pages.product.actions.openInStore', {
                      store: product.store_name
                    })
                  : t('pages.product.actions.openStorePage')}
```

and make the badge the first child of the chip row `HStack` (before `CategoryTag`):

```jsx
            <StoreBadge
              storeId={product.store_id}
              name={product.store_name}
              hasFavicon={product.store_has_favicon}
              size="md"
            />
```

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npx vitest run src/pages`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/ProductPage.jsx frontend/src/pages/ProductPage.test.jsx
git commit -m "feat(frontend): show the store on the product detail page"
```

---

### Task 9: Store in the product form

**Files:**
- Modify: `frontend/src/components/products/ProductFormDialog.jsx`
- Test: `frontend/src/components/products/ProductFormDialog.test.jsx`

**Interfaces:**
- Consumes: `StoreBadge` (Task 6); extraction response `store: {id, name, domain, has_favicon}` (Task 4); `ProductCreate.store_id` (Task 3); i18n `components.productFormDialog.fields.store`.
- Produces: create payload includes `store_id` when a store was extracted for the current URL.

- [ ] **Step 1: Write the failing tests** — add to the `describe` in `ProductFormDialog.test.jsx`:

```jsx
  const AMAZON = { id: 7, name: 'Amazon', domain: 'amazon.es', has_favicon: true };

  it('shows the extracted store read-only and sends its id on create', async () => {
    const user = userEvent.setup();
    const getUnexpectedErrors = spyOnConsoleError();
    productsApi.extractInfo.mockResolvedValue({
      name: 'Standing Desk',
      description: 'A nice desk',
      category: 'Electronics',
      currency: 'EUR',
      store: AMAZON
    });
    productsApi.create.mockResolvedValue({ id: 1, name: 'Standing Desk' });

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );

    await user.type(
      screen.getByRole('textbox', { name: 'Product URL' }),
      'https://www.amazon.es/desk'
    );
    await user.click(screen.getByRole('button', { name: 'Generate details' }));
    await screen.findByDisplayValue('Standing Desk');

    expect(screen.getByText('Store')).toBeInTheDocument();
    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(
      screen.queryByRole('textbox', { name: /store/i })
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add product' }));

    await waitFor(() => expect(productsApi.create).toHaveBeenCalled());
    expect(productsApi.create.mock.calls[0][0]).toMatchObject({ store_id: 7 });
    expect(getUnexpectedErrors()).toEqual([]);
  });

  it('clears the extracted store when the URL changes', async () => {
    const user = userEvent.setup();
    productsApi.extractInfo.mockResolvedValue({
      name: 'Standing Desk',
      description: '',
      category: 'Electronics',
      currency: 'EUR',
      store: AMAZON
    });

    renderWithProviders(
      <ProductFormDialog open mode="create" onClose={vi.fn()} product={null} />
    );

    const urlInput = screen.getByRole('textbox', { name: 'Product URL' });
    await user.type(urlInput, 'https://www.amazon.es/desk');
    await user.click(screen.getByRole('button', { name: 'Generate details' }));
    await screen.findByText('Amazon');

    await user.type(urlInput, 'x');

    expect(screen.queryByText('Amazon')).not.toBeInTheDocument();
  });

  it('shows the product store read-only in edit mode', async () => {
    renderWithProviders(
      <ProductFormDialog
        open
        mode="edit"
        onClose={vi.fn()}
        product={{
          id: 3,
          name: 'Desk',
          url: 'https://amazon.es/desk',
          description: 'A desk',
          category_id: 5,
          priority: 'Medium',
          currency: 'EUR',
          store_id: 7,
          store_name: 'Amazon',
          store_has_favicon: true
        }}
      />
    );

    expect(await screen.findByText('Amazon')).toBeInTheDocument();
  });
```

If `productsStore.create` passes a second argument to `productsApi.create`, the `mock.calls[0][0]` assertion still targets the payload.

- [ ] **Step 2: Run to verify failure**

Run: `cd frontend && npx vitest run src/components/products`
Expected: the 3 new tests FAIL (no "Amazon" text).

- [ ] **Step 3: Implement** — `ProductFormDialog.jsx`:

Import `StoreBadge` (extend `import { ErrorState, CategoryColorPicker } from '@/components/common';`).

State, after `const [currency, setCurrency] = useState('EUR');`:

```jsx
  // Store the product belongs to: read-only, set by extraction (create) or
  // taken from the product (edit). `{ id, name, has_favicon }` or null.
  const [store, setStore] = useState(null);
```

In the render-time sync block: in the `mode === 'create'` branch add `setStore(null);`; in the `else if (sourceProduct)` branch add:

```jsx
      setStore(
        sourceProduct.store_name
          ? {
              id: sourceProduct.store_id,
              name: sourceProduct.store_name,
              has_favicon: Boolean(sourceProduct.store_has_favicon)
            }
          : null
      );
```

In `runExtraction`, right after `setDescription(data.description ?? '');`:

```jsx
        setStore(data.store ?? null);
```

URL input `onChange`:

```jsx
                  onChange={(e) => {
                    setUrl(e.target.value);
                    // An extracted store belongs to the URL it came from.
                    if (mode === 'create') setStore(null);
                  }}
```

In `handleSubmit`'s `payload`, after `currency: ...`:

```jsx
      ...(mode === 'create' && store ? { store_id: store.id } : {})
```

Render, right after the `{mode === 'create' && extractionError && (...)}` block:

```jsx
              {store && (
                <HStack gap={2}>
                  <Text textStyle="sm" color="fg.muted">
                    {t('components.productFormDialog.fields.store')}
                  </Text>
                  <StoreBadge
                    storeId={store.id}
                    name={store.name}
                    hasFavicon={store.has_favicon}
                    size="md"
                  />
                </HStack>
              )}
```

Update the component's JSDoc bullet for `mode="create"` to mention the read-only store row filled by extraction.

- [ ] **Step 4: Run to verify pass**

Run: `cd frontend && npm test`
Expected: the whole Vitest suite PASSES.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/products
git commit -m "feat(frontend): show the store in the product form and send store_id"
```

---

### Task 10: E2E fixtures, visual snapshots and frontend docs

**Files:**
- Modify: `frontend/e2e/fixtures/products.js`, `frontend/e2e/support/apiMock.js`, `frontend/e2e/visual.spec.js-snapshots/*` (regenerated), `frontend/README.md`

**Interfaces:**
- Consumes: all store fields and `GET /stores/{id}/favicon`.

- [ ] **Step 1: Fixtures** — in `e2e/fixtures/products.js`, add to both `buildDashboardProduct` and `buildProductDetail` defaults:

```js
    store_id: 1,
    store_name: 'Amazon',
    store_domain: 'amazon.com',
    store_has_favicon: true,
```

In the multi-product builder around line 175 (`url: \`https://example.com/product-${i + 1}\``), alternate stores so the dashboard snapshot shows several: `...(i % 2 === 0 ? {} : { store_id: 2, store_name: 'Decathlon', store_domain: 'decathlon.com', store_has_favicon: false })`.

- [ ] **Step 2: Mock API** — in `e2e/support/apiMock.js`:

Add `store: { id: 1, name: 'Amazon', domain: 'amazon.com', has_favicon: true }` to `DEFAULT_EXTRACTION`.

Add a constant after `DEFAULT_EXTRACTION`:

```js
/** 1x1 orange PNG served for every mocked store favicon, so snapshots are
 * deterministic and no request leaves the mocked API. */
const FAVICON_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==',
  'base64'
);
```

Register a route in `install` next to the products routes:

```js
    await page.route(
      (url) => matchesApiPath(url, /^\/stores\/\d+\/favicon$/),
      (route) =>
        route.fulfill({ contentType: 'image/png', body: FAVICON_PNG })
    );
```

In the `POST /products/` handler, compute the store from the extraction the form used and add it to both the summary row and detail record:

```js
        const extractedStore = (this.extraction ?? DEFAULT_EXTRACTION).store;
        const store =
          extractedStore && extractedStore.id === body.store_id
            ? extractedStore
            : null;
        const storeFields = {
          store_id: store?.id ?? null,
          store_name: store?.name ?? null,
          store_domain: store?.domain ?? null,
          store_has_favicon: store?.has_favicon ?? false
        };
```

and spread `...storeFields` into the new `this.products` entry and `this.details[id]`. Add `store_id: product.store_id ?? null` to the plain `GET /products/` mapping.

- [ ] **Step 3: Run the e2e suite (non-visual first)**

Run: `cd frontend && npx playwright test --ignore-snapshots`
Expected: all PASS; no "unmatched route" failures.

- [ ] **Step 4: Regenerate and review snapshots**

Run: `cd frontend && npx playwright test visual.spec.js --update-snapshots`, then open a few changed PNGs (`git diff --stat frontend/e2e/visual.spec.js-snapshots`; view e.g. `dashboard-light-desktop-linux.png` and `product-dark-mobile-linux.png`) and confirm the favicon sits before the product name, the store name precedes the category tag, and the detail page shows the badge and "Open in Amazon".
Then run the full suite: `npx playwright test` — Expected: all PASS.

- [ ] **Step 5: Frontend docs** — `frontend/README.md`, "Components" → `components/common/` list: add `StoreBadge`/`StoreFavicon` ("store favicon + name, with a Lucide fallback"). In "lib": mention `lib/api/stores.js` (`faviconUrl`). In the e2e section: note that `apiMock` serves a fixed 1x1 PNG for `/stores/{id}/favicon`.

- [ ] **Step 6: Final checks**

Run: `just lint && just test`
Expected: both succeed.

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e frontend/README.md
git commit -m "test(frontend): cover stores in e2e fixtures and refresh visual snapshots"
```
