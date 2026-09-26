# Product Store & Favicon — Design

- **Date:** 2026-09-26
- **Branch:** `feat/product-store-favicon`
- **Status:** Approved in brainstorming, pending spec review

## 1. Goal

The wishlist is meant to hold the *same* product more than once — one entry per
store, since every store sets its own price. Today nothing in the UI tells those
entries apart. This feature captures the **store** (name + favicon) when a
product's information is extracted, persists it in a dedicated `Store` table
linked to products by id, and shows it on the dashboard list and the product
detail page so each entry's store is recognisable at a glance.

### Success criteria

- Extracting a product URL returns the store (name, domain, favicon available).
- Each store (domain) is stored once; its favicon is downloaded only the first
  time the domain is seen.
- Dashboard rows/cards and the detail page show the store favicon and name.
- Two copies of the same product in different stores are visually distinct.

### Constraints / decisions

- **No backward compatibility.** The project is in development; the database
  will be recreated. No migration code.
- **Store name comes from the AI model**, as part of the existing product-info
  extraction prompt.
- **Favicon is fetched programmatically** from the page already loaded by
  Stagehand (not by the AI).
- **Favicon bytes are stored in the database** (BLOB) and served by the backend.
- **Store identity = normalized domain** (hostname, lower-case, without
  `www.`). `amazon.es` and `amazon.com` are different stores.
- **Store name is read-only** in the UI. No store management page.

### Out of scope

- Store info in Telegram notifications.
- Store management (rename, merge, delete) and re-fetching missing favicons.
- Filtering/grouping the dashboard by store.

## 2. Backend

### 2.1 Data model (`backend/src/models/database_models.py`)

```python
class Store(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    domain: str = Field(unique=True, index=True)  # e.g. "pccomponentes.com"
    name: str                                      # from Gemini, or derived from domain
    favicon: bytes | None = None                   # raw image bytes (BLOB)
    favicon_mime: str | None = None                # e.g. "image/png", "image/x-icon"


class Product(SQLModel, table=True):
    ...
    store_id: int | None = Field(default=None, foreign_key="store.id", index=True)
```

`store_id` is nullable at the column level, but the service layer always sets it
on create/update (see 2.4), so every product created through the API has a store.

### 2.2 Store service (`backend/src/services/store_service.py`, new)

- `normalize_domain(url: str) -> str`
  Parses the URL, returns the hostname lower-cased with a leading `www.`
  stripped. Other subdomains are kept (`es.aliexpress.com` stays as is).
  Raises `HTTPException(422)` if the URL has no hostname.
- `derive_name(domain: str) -> str`
  Fallback name: first label of the domain, capitalised
  (`pccomponentes.com` → `Pccomponentes`).
- `get_by_domain(session, domain) -> Store | None`
- `get_or_create(session, url, name=None, favicon=None, favicon_mime=None) -> Store`
  If a store with that domain exists, return it **unchanged** (the first name
  and favicon win, so names stay consistent). Otherwise create it with `name`
  (or `derive_name(domain)` when `name` is empty/blank) and the favicon data.
- `get_favicon(session, store_id) -> tuple[bytes, str]`
  Raises `HTTPException(404)` if the store does not exist or has no favicon.

### 2.3 Extraction (`backend/src/stagehand_utils.py`)

- `ProductInfoExtraction` gains
  `store_name: str = Field(description="Name of the online store/retailer selling the product (e.g. Amazon, Decathlon, PcComponentes)")`,
  and the extraction instruction asks for it explicitly.
- New dataclass/model `FaviconData(content: bytes, mime: str)`.
- New helper `async _fetch_favicon(page) -> FaviconData | None`:
  1. In the page, pick the best `<link rel~="icon">` / `apple-touch-icon`
     `href` (resolved against the document URL); fall back to
     `new URL('/favicon.ico', location.origin)`.
  2. Download it **from inside the page** (`page.evaluate` running `fetch`),
     so it reuses the browser session and passes anti-bot checks; return the
     body as base64 plus the `content-type`.
  3. Accept only `image/*` content types and bodies ≤ 256 KB.
  4. Any exception or rejected result → `None` (never fails the extraction).
- `get_product_info(..., fetch_favicon: bool = True)` now returns a
  `ProductInfoResult` containing the `ProductInfoExtraction` and an optional
  `FaviconData` (only fetched when `fetch_favicon` is true).

### 2.4 Product service (`backend/src/services/product_service.py`)

- `extract_product_info`:
  1. `domain = normalize_domain(request.url)`; look up the existing store.
  2. Call `get_product_info(..., fetch_favicon=existing_store is None)`.
  3. `store = get_or_create(session, url, name=info.store_name, favicon=..., favicon_mime=...)`.
  4. Return `ProductInfoResponse` with the new `store` field.
- `create`: if `payload.store_id` is set and exists, use it; otherwise
  (or if it does not exist) resolve `get_or_create(session, payload.url)`.
  A `store_id` whose domain does not match the URL is ignored and the store is
  resolved from the URL (the URL is the source of truth).
- `update`: when `url` is in the payload and its normalized domain differs from
  the current store's, set `store_id = get_or_create(session, new_url).id`.
- `get_dashboard_summary` / `get_detail`: include the store fields below.

### 2.5 Schemas (`backend/src/schemas/`)

- New `store.py`:
  `StoreResponse { id: int, name: str, domain: str, has_favicon: bool }`.
- `ProductInfoResponse` += `store: StoreResponse`.
- `ProductCreate` += `store_id: int | None = None`.
- `ProductDashboardSummary` and `ProductDetailResponse` +=
  `store_id: int | None`, `store_name: str | None`, `store_domain: str | None`,
  `store_has_favicon: bool`.

### 2.6 API (`backend/src/routers/store_router.py`, new; registered in `api.py`)

- `GET /stores/{store_id}/favicon` → `Response(content=bytes, media_type=mime)`
  with header `Cache-Control: public, max-age=604800`. 404 when the store or
  its favicon is missing.

### 2.7 Test data (`backend/src/setup_backend.py --populate`)

Create 3–4 stores (Amazon, Decathlon, PcComponentes, …) without favicons and
assign them to the sample products, including at least one product duplicated
in two stores at different prices.

## 3. Frontend

### 3.1 API client

- `frontend/src/lib/api/stores.js` (new): `faviconUrl(storeId)` →
  `` `${API_URL}/stores/${storeId}/favicon` ``; exported from `lib/api/index.js`.
- `products.create` sends `store_id` when present.

### 3.2 `StoreBadge` (`frontend/src/components/common/StoreBadge.jsx`, new)

- Props: `name`, `faviconUrl` (nullable), `size` (`'sm' | 'md'`, default `'sm'`).
- Renders the favicon (`<img alt="">`, 16px for `sm`, 20px for `md`, small
  radius) followed by the store name (muted text for `sm`).
- Falls back to the Lucide `LuStore` icon (following the global icon
  convention) when `faviconUrl` is null or the image fails to load (`onError`).
- Renders nothing when `name` is null.
- Also export a `StoreFavicon` sub-component (icon only) for use before the
  product name.

### 3.3 Dashboard

- `ProductTable` row and `ProductCardList` card:
  - `StoreFavicon` placed immediately before the product name.
  - Meta line under the name: `StoreBadge sm` followed by `CategoryTag`.

### 3.4 Detail page (`ProductPage`)

- `StoreBadge size="md"` first in the chip row (store · category · priority).
- The "Open store page" button reads "Open in {store}" when a store name exists.

### 3.5 Product form (`ProductFormDialog`)

- Create mode: after a successful extraction, keep `store` in state and show a
  read-only "Store" row (`StoreBadge`) below the URL field; send
  `store_id` on submit. Changing the URL clears the stored `store`.
- Edit mode: show the product's current store read-only. The backend
  re-resolves the store on save if the URL domain changed.

### 3.6 i18n

New keys in `english.json` and `spanish.json`:
`components.storeBadge.fallbackLabel`, `components.productForm.store`,
`pages.product.actions.openInStore` (with `{{store}}`).

## 4. Error handling

| Case | Behaviour |
| --- | --- |
| Favicon missing / 404 / non-image / > 256 KB / timeout | Store saved without favicon; UI shows `LuStore`. Not retried. |
| Gemini returns an empty store name | Name derived from domain. |
| URL without a valid hostname on create/update/extract | 422. |
| `GET /stores/{id}/favicon` for unknown store or no favicon | 404; `<img onError>` shows the fallback icon. |
| Extraction fails, product entered manually | Store resolved from URL on create (derived name, no favicon). |

## 5. Testing (TDD)

**Backend (pytest)**
- `normalize_domain`: `www.` stripping, other subdomains kept, case, invalid URL.
- `get_or_create`: creates new, reuses existing unchanged, derived name fallback.
- `GET /stores/{id}/favicon`: 200 with the stored mime and `Cache-Control`; 404 cases.
- Product create with valid `store_id`, without `store_id`, with mismatching
  `store_id`; update with same and different domain.
- Dashboard summary and detail include store fields.
- `extract_product_info` with `get_product_info` mocked: new domain requests the
  favicon and creates the store; known domain passes `fetch_favicon=False` and
  reuses the store.

**Frontend (Vitest + Testing Library)**
- `StoreBadge` / `StoreFavicon`: favicon rendering, null favicon fallback,
  `onError` fallback, null name.
- `ProductTable`, `ProductCardList`, `ProductPage` render the store.
- `ProductFormDialog`: store shown after extraction and `store_id` submitted;
  cleared when the URL changes.
- `api/stores.faviconUrl`.

**E2E (Playwright)**
- Add store fields to `e2e/fixtures/products.js`; mock `/stores/*/favicon`.
- Regenerate visual snapshots.

## 6. Documentation

Update the root `README.md` (Key Features, Database Schema, API Reference) and
`backend/README.md` / `frontend/README.md` where they describe the model,
endpoints or components.
