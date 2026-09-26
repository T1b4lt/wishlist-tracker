# Product Offers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split a product (what the user wants to buy) from its offers (the stores it is tracked in), so the same item in N stores counts once on the dashboard, valued by its best offer.

**Architecture:** A new `Offer` table holds `url`, `store_id` and `currency` per store; `OfferHist` (formerly `ProductHist`) and the cronjob work per offer. Pure "best offer" rules live in `backend/src/services/best_offer.py` and `frontend/src/lib/bestOffer.js`, pinned by `contracts/best-offer-cases.json`. The API returns products with nested `offers[]`; new endpoints add, edit, unlink and delete offers and merge products.

**Tech Stack:** FastAPI + SQLModel + SQLite + pytest (backend, `uv`); React 19 + Chakra UI v3 + Zustand + Recharts + react-i18next + Vitest + Playwright (frontend).

**Spec:** `docs/superpowers/specs/2026-09-27-product-offers-design.md`

## Global Constraints

- No backward compatibility and no migration code: the database is recreated (`just db-clean && just db-init`, or `just db-seed`).
- Every product has at least one offer; deleting or unlinking a product's only offer → HTTP 409.
- All offers of a product share one currency; a mismatch on add or merge → HTTP 409. No currency conversion.
- No automatic product matching in the "New product" dialog; no inline row expansion on the dashboard.
- Best offer: among offers with history, rank by (current record in stock first, then lower price, then newer current timestamp, then lower offer id).
- Product `is_in_stock`: `true` if any offer's current record is in stock, `false` if every offer with history is out of stock, `null` if none has history.
- Product `is_at_lowest`: best offer is in stock and its price ≤ the lowest in-stock price of any offer inside the window.
- Product stale: any offer stale (existing 3-day rule, per offer `last_checked_at`).
- Every user-facing string in both `frontend/src/i18n/english.json` and `spanish.json`; code, comments and docs in English (AGENTS.md).
- Commit messages follow Conventional Commits (a pre-commit hook enforces it).
- Backend tests: `cd backend && uv run pytest <path> -v`. Frontend tests: `cd frontend && npx vitest run <path>`. E2E: `cd frontend && npm run test:e2e`.

## Review Focus

1. **Merging two products that share a URL**: 409 instead of creating two offers that scrape the same page twice a day. Test in Task 4.
2. **Removing or unlinking the last offer** from the UI: the menu items are disabled, and the API still refuses with 409 if called directly. Tests in Tasks 4 and 10.
3. **A just-added offer with no history** next to one that has history: the best offer must be the one with history, and the new store row shows "Not checked yet" instead of a price. Contract case in Task 1; test in Task 10.
4. **Adding a store in another currency** from both entry points (AddOfferDialog and "Same product as…"): inline error, save blocked. Tests in Tasks 12 and 14.
5. **The best offer changes when prices move**: dashboard price, sparkline and "Open in store" all follow `best_offer_id`, never `offers[0]`. Tests in Tasks 3 and 9.

---

## File Map

**Backend**
- Create `backend/src/services/best_offer.py`: pure best-offer and product-level stock/lowest rules.
- Create `backend/src/services/offer_service.py`: store resolution, currency/URL guards, add/update/unlink/delete offer.
- Create `backend/src/routers/offer_router.py`: offer endpoints.
- Modify `backend/src/models/database_models.py`: `Product`, new `Offer`, `OfferHist`, `PendingStatusRetry`, `DailyCheckRun`.
- Modify `backend/src/schemas/product.py`: new request/response schemas.
- Modify `backend/src/services/product_service.py`: create, update, delete, merge, dashboard summary, detail.
- Modify `backend/src/routers/product_router.py`, `backend/src/api.py`.
- Modify `backend/src/product_status_cronjob.py`, `backend/src/services/daily_check_service.py`, `backend/src/schemas/daily_check.py`, `backend/src/telegram_utils.py`.
- Modify `backend/src/setup_backend.py` (seed).
- Tests: create `backend/tests/factories.py`, `backend/tests/test_best_offer_contract.py`, `backend/tests/test_offers.py`, `backend/tests/test_merge.py`; update the existing test files.

**Contracts**
- Create `contracts/best-offer-cases.json`; modify `contracts/api-fields.json`, `contracts/README.md`.

**Frontend**
- Create `frontend/src/lib/bestOffer.js`, `frontend/src/lib/offerChart.js`, `frontend/src/lib/api/offers.js`.
- Create components: `dashboard/OfferStores.jsx`, `product/OfferList.jsx`, `product/EditOfferDialog.jsx`, `product/AddOfferDialog.jsx`, `product/MergeProductDialog.jsx`.
- Modify: `lib/staleness.js`, `lib/dashboardSummary.js`, `lib/productFilters.js`, `lib/productHistory.js`, `lib/api/products.js`, `lib/api/index.js`, `stores/productsStore.js`, `components/common/StaleBadge.jsx`, `dashboard/ProductTable.jsx`, `dashboard/ProductCardList.jsx`, `dashboard/ProductRowActions.jsx`, `product/PriceHistoryChart.jsx`, `product/ProductStatsRow.jsx`, `product/StaleProductNotice.jsx`, `products/ProductFormDialog.jsx`, `pages/ProductPage.jsx`, i18n files, `e2e/fixtures/products.js`, `e2e/fixtures/dailyCheck.js`, e2e specs and snapshots.

**Docs**
- `README.md`, `backend/README.md`, `backend/db/README.md`.

---

### Task 1: Best-offer contract and backend rules

**Files:**
- Create: `contracts/best-offer-cases.json`
- Create: `backend/src/services/best_offer.py`
- Test: `backend/tests/test_best_offer_contract.py`
- Modify: `contracts/README.md`

**Interfaces:**
- Produces: `OfferHistory(offer_id: int, history: list)`, `ProductOfferStats(best_offer_id: int | None, is_in_stock: bool | None, is_at_lowest: bool)`, `current_record(history) -> record | None`, `select_best_offer(offers: list[OfferHistory]) -> int | None`, `compute_product_offer_stats(offers, window_days: int | None, now: int) -> ProductOfferStats`. Records are any objects with `price`, `is_in_stock`, `timestamp`.

- [ ] **Step 1: Write the contract file**

`contracts/best-offer-cases.json` (all timestamps are Unix seconds; with `now = 10000000` and a 30-day window the cutoff is `7408000`):

```json
{
  "description": "Best offer and product-level stock / at-lowest rules. See contracts/README.md.",
  "cases": [
    {
      "name": "no offer has history",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 1, "history": [] },
        { "offer_id": 2, "history": [] }
      ],
      "expected": { "best_offer_id": null, "is_in_stock": null, "is_at_lowest": false }
    },
    {
      "name": "an offer without history never wins",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 1, "history": [] },
        { "offer_id": 2, "history": [{ "price": 50, "is_in_stock": true, "timestamp": 9900000 }] }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": true, "is_at_lowest": true }
    },
    {
      "name": "cheapest in-stock beats a cheaper out-of-stock offer",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 1, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9900000 }] },
        { "offer_id": 2, "history": [{ "price": 90, "is_in_stock": false, "timestamp": 9950000 }] }
      ],
      "expected": { "best_offer_id": 1, "is_in_stock": true, "is_at_lowest": true }
    },
    {
      "name": "all out of stock falls back to the cheapest",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 1, "history": [{ "price": 120, "is_in_stock": false, "timestamp": 9900000 }] },
        { "offer_id": 2, "history": [{ "price": 110, "is_in_stock": false, "timestamp": 9900000 }] }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": false, "is_at_lowest": false }
    },
    {
      "name": "price tie resolves to the most recently checked",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 1, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9900000 }] },
        { "offer_id": 2, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9950000 }] }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": true, "is_at_lowest": true }
    },
    {
      "name": "full tie resolves to the lowest offer id",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 3, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9900000 }] },
        { "offer_id": 2, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9900000 }] }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": true, "is_at_lowest": true }
    },
    {
      "name": "another store was cheaper earlier in the window",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        {
          "offer_id": 1,
          "history": [
            { "price": 80, "is_in_stock": true, "timestamp": 9000000 },
            { "price": 120, "is_in_stock": true, "timestamp": 9900000 }
          ]
        },
        { "offer_id": 2, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9900000 }] }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": true, "is_at_lowest": false }
    },
    {
      "name": "a cheaper record outside the window is ignored",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        {
          "offer_id": 1,
          "history": [
            { "price": 80, "is_in_stock": true, "timestamp": 7000000 },
            { "price": 120, "is_in_stock": true, "timestamp": 9900000 }
          ]
        },
        { "offer_id": 2, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9900000 }] }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": true, "is_at_lowest": true }
    },
    {
      "name": "full history window keeps old records",
      "window_days": null,
      "now": 10000000,
      "offers": [
        {
          "offer_id": 1,
          "history": [
            { "price": 80, "is_in_stock": true, "timestamp": 1000 },
            { "price": 120, "is_in_stock": true, "timestamp": 9900000 }
          ]
        },
        { "offer_id": 2, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 9900000 }] }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": true, "is_at_lowest": false }
    },
    {
      "name": "current record older than the window is never at lowest",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 1, "history": [{ "price": 100, "is_in_stock": true, "timestamp": 1000 }] }
      ],
      "expected": { "best_offer_id": 1, "is_in_stock": true, "is_at_lowest": false }
    },
    {
      "name": "one offer in stock is enough for the product",
      "window_days": 30,
      "now": 10000000,
      "offers": [
        { "offer_id": 1, "history": [{ "price": 90, "is_in_stock": false, "timestamp": 9900000 }] },
        {
          "offer_id": 2,
          "history": [
            { "price": 100, "is_in_stock": false, "timestamp": 9800000 },
            { "price": 130, "is_in_stock": true, "timestamp": 9900000 }
          ]
        }
      ],
      "expected": { "best_offer_id": 2, "is_in_stock": true, "is_at_lowest": true }
    }
  ]
}
```

- [ ] **Step 2: Write the failing test**

`backend/tests/test_best_offer_contract.py`:

```python
"""Shared best-offer contract for the backend rules.

The same cases (``contracts/best-offer-cases.json``) run against
``frontend/src/lib/bestOffer.js`` in ``bestOffer.contract.test.js``.
"""

from types import SimpleNamespace

import pytest
from src.services.best_offer import (
    OfferHistory,
    compute_product_offer_stats,
    select_best_offer,
)
from tests.contract_utils import load_contract

CONTRACT = load_contract("best-offer-cases.json")


def _offers(case):
    return [
        OfferHistory(
            offer_id=offer["offer_id"],
            history=[SimpleNamespace(**record) for record in offer["history"]],
        )
        for offer in case["offers"]
    ]


@pytest.mark.parametrize("case", CONTRACT["cases"], ids=lambda case: case["name"])
def test_best_offer_contract(case):
    expected = case["expected"]

    stats = compute_product_offer_stats(_offers(case), case["window_days"], case["now"])

    assert stats.best_offer_id == expected["best_offer_id"]
    assert stats.is_in_stock is expected["is_in_stock"]
    assert stats.is_at_lowest is expected["is_at_lowest"]


def test_select_best_offer_matches_the_stats():
    case = CONTRACT["cases"][2]
    assert select_best_offer(_offers(case)) == case["expected"]["best_offer_id"]
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && uv run pytest tests/test_best_offer_contract.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.services.best_offer'`.

- [ ] **Step 4: Implement the module**

`backend/src/services/best_offer.py`:

```python
"""
Best-offer rules: which offer represents a product tracked in several stores.

Pure functions, no database access. Mirrored by
``frontend/src/lib/bestOffer.js``; both are pinned by
``contracts/best-offer-cases.json`` (see ``contracts/README.md``).

Definitions (per offer, *current* is the newest record of its history):
    * best offer: among offers with history, the one ranked first by
      (current in stock first, lower price, newer current, lower offer id).
    * product in stock: any current record in stock (``None`` without history).
    * product at lowest: the best offer's current record is in stock and not
      above the lowest in-stock price of any offer inside the window.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from src.services.price_stats import filter_window


@dataclass(frozen=True)
class OfferHistory:
    """An offer id with its price-history records (any order)."""

    offer_id: int
    history: list


@dataclass(frozen=True)
class ProductOfferStats:
    """Product-level results of the best-offer rules."""

    best_offer_id: int | None
    is_in_stock: bool | None
    is_at_lowest: bool


def current_record(history: Iterable) -> Any | None:
    """Return the newest record (the last one in input order on ties).

    Args:
        history (Iterable): Price-history records.

    Returns:
        Any | None: The newest record, or ``None`` for an empty history.
    """
    current = None
    for record in history:
        if current is None or record.timestamp >= current.timestamp:
            current = record
    return current


def _rank(offer_id: int, current: Any) -> tuple:
    """Sort key: in stock first, then cheaper, then newer, then lower id."""
    return (0 if current.is_in_stock else 1, current.price, -current.timestamp, offer_id)


def select_best_offer(offers: list[OfferHistory]) -> int | None:
    """Return the id of the offer that represents the product.

    Args:
        offers (list[OfferHistory]): The product's offers.

    Returns:
        int | None: The best offer's id, or ``None`` when no offer has history.
    """
    ranked = [
        _rank(offer.offer_id, current)
        for offer in offers
        if (current := current_record(offer.history)) is not None
    ]
    return min(ranked)[3] if ranked else None


def compute_product_offer_stats(
    offers: list[OfferHistory], window_days: int | None, now: int
) -> ProductOfferStats:
    """Apply the best-offer rules to a product's offers.

    Args:
        offers (list[OfferHistory]): The product's offers. Each history must
            include the offer's newest record even if it is outside the window.
        window_days (int | None): Window length in days; ``None`` keeps
            the full history.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        ProductOfferStats: Best offer id, product stock and at-lowest flag.
    """
    currents = {offer.offer_id: current_record(offer.history) for offer in offers}
    with_history = [current for current in currents.values() if current is not None]
    is_in_stock = (
        any(current.is_in_stock for current in with_history) if with_history else None
    )

    best_offer_id = select_best_offer(offers)
    is_at_lowest = False
    if best_offer_id is not None and currents[best_offer_id].is_in_stock:
        in_stock_prices = [
            record.price
            for offer in offers
            for record in filter_window(offer.history, window_days, now)
            if record.is_in_stock
        ]
        is_at_lowest = bool(in_stock_prices) and (
            currents[best_offer_id].price <= min(in_stock_prices)
        )

    return ProductOfferStats(
        best_offer_id=best_offer_id,
        is_in_stock=is_in_stock,
        is_at_lowest=is_at_lowest,
    )
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_best_offer_contract.py -v`
Expected: 12 passed.

- [ ] **Step 6: Document the contract**

In `contracts/README.md`, add a section next to the `price-stats-cases.json` one:

```markdown
## `best-offer-cases.json`

Which offer represents a product tracked in several stores, and the
product-level `is_in_stock` / `is_at_lowest` flags. Each case lists the
offers (id + full history), the window (`null` = full history) and `now`.

- Backend: `backend/src/services/best_offer.py`, tested by
  `backend/tests/test_best_offer_contract.py`.
- Frontend: `frontend/src/lib/bestOffer.js`, tested by
  `frontend/src/lib/bestOffer.contract.test.js`.
```

- [ ] **Step 7: Commit**

```bash
git add contracts/best-offer-cases.json contracts/README.md backend/src/services/best_offer.py backend/tests/test_best_offer_contract.py
git commit -m "feat(backend): add best-offer rules pinned by a shared contract"
```

---

### Task 2: Offer data model, schemas and product endpoints

This task changes the models, so `test_cronjob.py`, `test_daily_check.py` and `test_daily_report.py` stay red until Task 3. Run only the files listed here.

**Files:**
- Modify: `backend/src/models/database_models.py`
- Modify: `backend/src/schemas/product.py`
- Create: `backend/src/services/offer_service.py` (store resolution and currency helpers only; the endpoints come in Task 4)
- Modify: `backend/src/services/product_service.py`
- Modify: `backend/src/routers/product_router.py`
- Create: `backend/tests/factories.py`
- Test: `backend/tests/test_products.py`, `backend/tests/test_product_store.py`, `backend/tests/test_price_stats_contract.py`, `backend/tests/test_categories.py`, `backend/tests/test_contracts.py`
- Modify: `contracts/api-fields.json`

**Interfaces:**
- Consumes: `best_offer.OfferHistory`, `best_offer.compute_product_offer_stats` (Task 1).
- Produces:
  - Models `Product(id, name, category_id, priority, description)`, `Offer(id, product_id, url, store_id, currency)`, `OfferHist(id, offer_id, price, is_in_stock, timestamp)`, `PendingStatusRetry(offer_id, day_start)`, `DailyCheckRun(..., total_offers, ...)`.
  - Schemas `OfferCreate(url, currency, store_id=None)`, `OfferUpdate(url)`, `ProductCreate(name, category_id, priority, description, offer: OfferCreate)`, `ProductUpdate`, `ProductMergeRequest(source_product_id, keep: Literal["target","source"]="target")`, `OfferResponse`, `ProductResponse`, `OfferSummary`, `OfferHistResponse`, `OfferDetail`, `ProductDashboardSummary`, `ProductDetailResponse`.
  - `offer_service.resolve_store(session, url, store_id=None) -> Store`, `offer_service.product_currency(session, product_id) -> str | None`, `product_service.to_product_response(session, product) -> ProductResponse`.
  - Test helpers `tests/factories.py`: `make_category`, `make_product`, `make_offer`, `add_history`.

- [ ] **Step 1: Update the models**

In `backend/src/models/database_models.py`, replace `Product`, `ProductHist` and the `product_id` column of `PendingStatusRetry`, and rename `DailyCheckRun.total_products`:

```python
class Product(SQLModel, table=True):
    """What the user wants to buy; tracked in one or more stores (offers)."""

    id: int | None = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    priority: str = Field(index=True)  # high, medium, low
    category_id: int | None = Field(default=None, foreign_key="category.id")
    description: str


class Offer(SQLModel, table=True):
    """A product in one store: its URL, store and currency.

    Every product has at least one offer, and all offers of a product share
    its currency. Each offer has its own price history and daily check.
    """

    id: int | None = Field(default=None, primary_key=True)
    product_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("product.id", ondelete="CASCADE"), index=True
        ),
    )
    url: str
    store_id: int | None = Field(default=None, foreign_key="store.id", index=True)
    currency: str


class OfferHist(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    offer_id: int = Field(
        sa_column=Column(
            Integer, ForeignKey("offer.id", ondelete="CASCADE"), index=True
        ),
    )
    price: float
    is_in_stock: bool
    timestamp: int  # Unix timestamp in seconds
```

`PendingStatusRetry`: rename the field to `offer_id` with `ForeignKey("offer.id", ondelete="CASCADE")`, and change its docstring from "A product whose daily status check…" to "An offer whose daily status check…". `DailyCheckRun`: rename `total_products: int` to `total_offers: int`.

- [ ] **Step 2: Replace the product schemas**

Rewrite `backend/src/schemas/product.py` (keep `ProductInfoRequest` and `ProductInfoResponse` as they are):

```python
"""Request and response schemas for products and their offers."""

from typing import Literal

from pydantic import BaseModel
from src.schemas.store import StoreResponse


class OfferCreate(BaseModel):
    """Payload for a new offer (a product in one store)."""

    url: str
    currency: str
    store_id: int | None = None


class OfferUpdate(BaseModel):
    """Payload for changing an offer's URL."""

    url: str


class ProductCreate(BaseModel):
    """Payload for creating a product together with its first offer."""

    name: str
    priority: str
    category_id: int
    description: str
    offer: OfferCreate


class ProductUpdate(BaseModel):
    """Partial update of a product's shared fields."""

    name: str | None = None
    priority: str | None = None
    category_id: int | None = None
    description: str | None = None


class ProductMergeRequest(BaseModel):
    """Merge ``source_product_id`` into the target product.

    ``keep`` picks whose shared fields (name, category, priority,
    description) the merged product keeps.
    """

    source_product_id: int
    keep: Literal["target", "source"] = "target"


class OfferResponse(BaseModel):
    """An offer as stored."""

    id: int
    product_id: int
    url: str
    store_id: int | None
    currency: str


class ProductResponse(BaseModel):
    """A product's shared fields and its offers."""

    id: int
    name: str
    priority: str
    category_id: int | None
    description: str
    offers: list[OfferResponse]


class ProductInfoRequest(BaseModel):
    """Payload for requesting AI-extracted product information."""

    url: str


class ProductInfoResponse(BaseModel):
    """Response with AI-extracted product information."""

    name: str
    category: str
    description: str
    currency: str
    store: StoreResponse


class OfferSummary(BaseModel):
    """An offer's store and latest status. Pinned by ``contracts/api-fields.json``."""

    id: int
    url: str
    store_id: int | None
    store_name: str | None
    store_domain: str | None
    store_has_favicon: bool
    current_price: float | None
    is_in_stock: bool | None
    last_checked_at: int | None


class OfferHistResponse(BaseModel):
    """Single price-history data point."""

    price: float
    is_in_stock: bool
    timestamp: int


class OfferDetail(OfferSummary):
    """An offer with its full price history (chronological)."""

    price_history: list[OfferHistResponse]


class ProductDashboardSummary(BaseModel):
    """A product on the dashboard, valued by its best offer.

    Rules in ``src/services/best_offer.py``; price statistics of the best
    offer follow ``src/services/price_stats.py``. Field names are pinned by
    ``contracts/api-fields.json``.
    """

    id: int
    name: str
    category_id: int
    category_name: str
    category_color: str
    priority: str
    currency: str
    current_price: float | None
    price_change_pct: float | None
    is_in_stock: bool | None
    is_at_lowest: bool
    recent_prices: list[float]
    best_offer_id: int | None
    offers: list[OfferSummary]


class ProductDetailResponse(BaseModel):
    """Full product detail with every offer and its history.

    Range statistics are computed by the frontend. Field names are pinned
    by ``contracts/api-fields.json``.
    """

    id: int
    name: str
    priority: str
    category_id: int
    category_name: str
    category_color: str
    description: str
    currency: str
    offers: list[OfferDetail]
```

- [ ] **Step 3: Update the API field contract**

Replace `ProductDashboardSummary`, `ProductDetailResponse` and `ProductHistResponse` in `contracts/api-fields.json` (keep `DailyCheckStatusResponse` for now; Task 3 renames its field):

```json
  "ProductDashboardSummary": [
    "id", "name", "category_id", "category_name", "category_color", "priority",
    "currency", "current_price", "price_change_pct", "is_in_stock",
    "is_at_lowest", "recent_prices", "best_offer_id", "offers"
  ],
  "OfferSummary": [
    "id", "url", "store_id", "store_name", "store_domain", "store_has_favicon",
    "current_price", "is_in_stock", "last_checked_at"
  ],
  "ProductDetailResponse": [
    "id", "name", "priority", "category_id", "category_name", "category_color",
    "description", "currency", "offers"
  ],
  "OfferDetail": [
    "id", "url", "store_id", "store_name", "store_domain", "store_has_favicon",
    "current_price", "is_in_stock", "last_checked_at", "price_history"
  ],
  "OfferHistResponse": ["price", "is_in_stock", "timestamp"],
```

Prettier formats JSON on commit; one item per line is fine.

In `backend/tests/test_contracts.py`, import `OfferDetail`, `OfferHistResponse`, `OfferSummary` instead of `ProductHistResponse`, and set the parametrize list to `[ProductDashboardSummary, OfferSummary, ProductDetailResponse, OfferDetail, OfferHistResponse, DailyCheckStatusResponse]`.

- [ ] **Step 4: Add shared test factories**

`backend/tests/factories.py`:

```python
"""Helpers that create products, offers and history in the test database."""

from src.models.database_models import Category, Offer, OfferHist, Product


def make_category(session, name="Electronics", color="#FF0000"):
    category = Category(name=name, color=color)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def make_product(session, category_id, name="Widget", priority="medium"):
    """Create a product without offers (add them with ``make_offer``)."""
    product = Product(
        name=name, priority=priority, category_id=category_id, description=name
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def make_offer(
    session, product_id, url="https://example.com/widget", currency="USD", store_id=None
):
    offer = Offer(product_id=product_id, url=url, currency=currency, store_id=store_id)
    session.add(offer)
    session.commit()
    session.refresh(offer)
    return offer


def add_history(session, offer_id, entries):
    """Insert ``OfferHist`` rows from ``(price, is_in_stock, timestamp)`` tuples."""
    for price, is_in_stock, timestamp in entries:
        session.add(
            OfferHist(
                offer_id=offer_id,
                price=price,
                is_in_stock=is_in_stock,
                timestamp=timestamp,
            )
        )
    session.commit()
```

- [ ] **Step 5: Write the failing multi-offer tests**

Append to `backend/tests/test_products.py` (and add `from tests.factories import add_history, make_category, make_offer, make_product` at the top):

```python
# --- Offers: dashboard summary and detail ---

NOW = 10_000_000


def test_dashboard_counts_a_product_with_two_offers_once_at_its_best_price(
    client, session
):
    category = make_category(session)
    product = make_product(session, category.id)
    amazon = make_offer(session, product.id, url="https://amazon.es/w")
    thomann = make_offer(session, product.id, url="https://thomann.es/w")
    add_history(session, amazon.id, [(700.0, True, NOW - DAY), (689.0, True, NOW)])
    add_history(session, thomann.id, [(690.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.best_offer_id == amazon.id
    assert summary.current_price == 689.0
    assert summary.recent_prices == [700.0, 689.0]
    assert [offer.id for offer in summary.offers] == [amazon.id, thomann.id]
    assert summary.offers[1].current_price == 690.0


def test_best_offer_follows_the_prices(session):
    category = make_category(session)
    product = make_product(session, category.id)
    first = make_offer(session, product.id, url="https://a.es/w")
    second = make_offer(session, product.id, url="https://b.es/w")
    add_history(session, first.id, [(100.0, True, NOW - DAY)])
    add_history(session, second.id, [(120.0, True, NOW - DAY), (90.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.best_offer_id == second.id
    assert summary.recent_prices == [120.0, 90.0]


def test_dashboard_product_is_in_stock_if_any_offer_is(session):
    category = make_category(session)
    product = make_product(session, category.id)
    out = make_offer(session, product.id, url="https://a.es/w")
    in_stock = make_offer(session, product.id, url="https://b.es/w")
    add_history(session, out.id, [(80.0, False, NOW)])
    add_history(session, in_stock.id, [(95.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.is_in_stock is True
    assert summary.best_offer_id == in_stock.id


def test_new_offer_without_history_is_listed_but_not_best(session):
    category = make_category(session)
    product = make_product(session, category.id)
    checked = make_offer(session, product.id, url="https://a.es/w")
    new = make_offer(session, product.id, url="https://b.es/w")
    add_history(session, checked.id, [(100.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.best_offer_id == checked.id
    new_summary = next(offer for offer in summary.offers if offer.id == new.id)
    assert new_summary.current_price is None
    assert new_summary.last_checked_at is None


def test_detail_lists_every_offer_with_its_history(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    first = make_offer(session, product.id, url="https://a.es/w", currency="EUR")
    second = make_offer(session, product.id, url="https://b.es/w", currency="EUR")
    add_history(session, first.id, [(100.0, True, NOW - DAY), (90.0, True, NOW)])
    add_history(session, second.id, [(95.0, False, NOW)])

    body = client.get(f"/products/{product.id}").json()

    assert body["currency"] == "EUR"
    assert [offer["id"] for offer in body["offers"]] == [first.id, second.id]
    assert [r["price"] for r in body["offers"][0]["price_history"]] == [100.0, 90.0]
    assert body["offers"][1]["is_in_stock"] is False


def test_create_product_creates_its_first_offer(client, session):
    category = make_category(session)

    response = client.post(
        "/products/",
        json={
            "name": "Drum kit",
            "priority": "high",
            "category_id": category.id,
            "description": "",
            "offer": {"url": "https://www.thomann.es/kit.htm", "currency": "eur"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Drum kit"
    (offer,) = body["offers"]
    assert offer["url"] == "https://www.thomann.es/kit.htm"
    assert offer["currency"] == "EUR"
    assert offer["store_id"] is not None


def test_update_changes_only_shared_fields(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    make_offer(session, product.id)

    response = client.patch(f"/products/{product.id}", json={"name": "Renamed"})

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert response.json()["offers"][0]["url"] == "https://example.com/widget"


def test_delete_product_deletes_offers_and_history(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    offer = make_offer(session, product.id)
    add_history(session, offer.id, [(1.0, True, NOW)])

    assert client.delete(f"/products/{product.id}").status_code == 200

    session.expire_all()
    assert session.get(Offer, offer.id) is None
    assert session.exec(select(OfferHist)).all() == []
```

(Add `Offer`, `OfferHist` to the model imports and `from sqlmodel import select`.)

- [ ] **Step 6: Migrate the existing tests in these files to offers**

Mechanical changes, same assertions:
- `test_products.py`: remove the local `_make_category`, `_make_product` and `_add_history`. Replace `product = _make_product(session, category.id, ...)` with `product = make_product(session, category.id, name=...)` followed by `offer = make_offer(session, product.id, currency=...)`, and `_add_history(session, product.id, ...)` with `add_history(session, offer.id, ...)`. Assertions on `summary.url` / `store_*` / `last_checked_at` move to `summary.offers[0].<field>`; `body["price_history"]` becomes `body["offers"][0]["price_history"]`. Delete the tests of `PATCH /products` with `url` (URL edits move to `PATCH /offers/{id}`, tested in Task 4). The constant-query-count test must keep its current bound plus two (offers and stores are loaded in one query each).
- `test_product_store.py`: store resolution moves to offers. `POST /products/` bodies nest `url`, `currency`, `store_id` under `"offer"`; assertions read `response.json()["offers"][0]["store_id"]`. Delete the "update URL re-resolves the store" tests here (Task 4 adds them for offers).
- `test_price_stats_contract.py`: in `test_dashboard_summary_follows_the_price_stats_contract`, create the product with `make_product` and one `make_offer`, and insert `OfferHist(offer_id=offer.id, **record)`.
- `test_categories.py`: build products with `make_product` (no `url`/`currency`).

- [ ] **Step 7: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_products.py tests/test_product_store.py tests/test_price_stats_contract.py tests/test_categories.py tests/test_contracts.py -v`
Expected: FAIL with import errors (`ProductHist` removed) or attribute errors in `product_service`.

- [ ] **Step 8: Create `offer_service.py` with store resolution**

`backend/src/services/offer_service.py`:

```python
"""
Offer service — a product in one store: store resolution, currency and URL
guards, and the add / edit / unlink / delete operations.
"""

from fastapi import HTTPException
from sqlmodel import Session, select
from src.models.database_models import Offer, Store
from src.services import store_service


def resolve_store(session: Session, url: str, store_id: int | None = None) -> Store:
    """Return the store an offer URL belongs to.

    ``store_id`` is reused only when it exists and matches the URL's
    domain; otherwise the store is looked up (or created) from the URL,
    which is always the source of truth.

    Args:
        session (Session): Active database session.
        url (str): The offer URL.
        store_id (int | None): A candidate store (e.g. from extraction).

    Returns:
        Store: The offer's store.

    Raises:
        HTTPException: 422 if the URL has no hostname.
    """
    domain = store_service.normalize_domain(url)
    if store_id is not None:
        store = session.get(Store, store_id)
        if store and store.domain == domain:
            return store
    return store_service.get_or_create(session, url)


def offers_of(session: Session, product_id: int) -> list[Offer]:
    """Return a product's offers, oldest first."""
    return session.exec(
        select(Offer).where(Offer.product_id == product_id).order_by(Offer.id)
    ).all()


def product_currency(session: Session, product_id: int) -> str | None:
    """Return the currency shared by a product's offers (None without offers)."""
    offers = offers_of(session, product_id)
    return offers[0].currency if offers else None
```

- [ ] **Step 9: Rewrite `product_service.py`**

Keep `_by_id` and `extract_product_info` unchanged. Delete `_resolve_store` and `_store_fields`. Update imports:

```python
from src.models.database_models import Category, Offer, OfferHist, Product, Store
from src.schemas.product import (
    OfferDetail,
    OfferHistResponse,
    OfferResponse,
    OfferSummary,
    ProductCreate,
    ProductDashboardSummary,
    ProductDetailResponse,
    ProductInfoRequest,
    ProductInfoResponse,
    ProductResponse,
    ProductUpdate,
)
from src.services import offer_service, store_service
from src.services.best_offer import OfferHistory, compute_product_offer_stats
from src.services.price_stats import SECONDS_PER_DAY, compute_window_stats
```

CRUD:

```python
def to_product_response(session: Session, product: Product) -> ProductResponse:
    """Return a product with its offers.

    Args:
        session (Session): Active database session.
        product (Product): A stored product.

    Returns:
        ProductResponse: Shared fields and offers.
    """
    return ProductResponse(
        **product.model_dump(),
        offers=[
            OfferResponse(**offer.model_dump())
            for offer in offer_service.offers_of(session, product.id)
        ],
    )


def _get_or_404(session: Session, product_id: int) -> Product:
    """Return a product or raise a 404."""
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


def create(session: Session, payload: ProductCreate) -> ProductResponse:
    """Create a product together with its first offer.

    Args:
        session (Session): Active database session.
        payload (ProductCreate): Shared fields and the first offer.

    Returns:
        ProductResponse: The new product.

    Raises:
        HTTPException: 422 if the offer URL has no hostname.
    """
    store = offer_service.resolve_store(
        session, payload.offer.url, payload.offer.store_id
    )
    product = Product.model_validate(payload.model_dump(exclude={"offer"}))
    session.add(product)
    session.flush()
    session.add(
        Offer(
            product_id=product.id,
            url=payload.offer.url,
            store_id=store.id,
            currency=payload.offer.currency.upper(),
        )
    )
    session.commit()
    session.refresh(product)
    return to_product_response(session, product)


def get_all(session: Session) -> list[ProductResponse]:
    """Return every product with its offers."""
    products = session.exec(select(Product).order_by(Product.id)).all()
    return [to_product_response(session, product) for product in products]


def update(session: Session, product_id: int, payload: ProductUpdate) -> ProductResponse:
    """Partially update a product's shared fields.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = _get_or_404(session, product_id)
    product.sqlmodel_update(payload.model_dump(exclude_unset=True))
    session.add(product)
    session.commit()
    session.refresh(product)
    return to_product_response(session, product)


def delete(session: Session, product_id: int) -> dict:
    """Delete a product; offers and their history are cascade-deleted.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = _get_or_404(session, product_id)
    session.delete(product)
    session.commit()
    return {"ok": True}
```

Aggregation helpers (replace `_window_records` and `_latest_records`; same SQL with `OfferHist.offer_id`):

```python
def _window_records(session: Session, cutoff: int) -> dict[int, list[OfferHist]]:
    """Load every history record at or after ``cutoff``, grouped by offer."""
    rows = session.exec(
        select(OfferHist)
        .where(OfferHist.timestamp >= cutoff)
        .order_by(OfferHist.offer_id, OfferHist.timestamp, OfferHist.id)
    ).all()
    grouped: dict[int, list[OfferHist]] = defaultdict(list)
    for row in rows:
        grouped[row.offer_id].append(row)
    return grouped


def _latest_records(session: Session) -> dict[int, OfferHist]:
    """Load the newest history record of every offer, in one query.

    It may be older than the window, so it is loaded separately from
    ``_window_records``; the highest id wins on timestamp ties.
    """
    newest = (
        select(
            OfferHist.offer_id,
            func.max(OfferHist.timestamp).label("max_timestamp"),
        )
        .group_by(OfferHist.offer_id)
        .subquery()
    )
    rows = session.exec(
        select(OfferHist)
        .join(
            newest,
            and_(
                OfferHist.offer_id == newest.c.offer_id,
                OfferHist.timestamp == newest.c.max_timestamp,
            ),
        )
        .order_by(OfferHist.id)
    ).all()
    return {row.offer_id: row for row in rows}


def _offer_summary_fields(offer: Offer, store: Store | None, current) -> dict:
    """Return the ``OfferSummary`` fields of an offer.

    Args:
        offer (Offer): The offer.
        store (Store | None): Its store, if any.
        current: Its newest ``OfferHist`` record, or None.

    Returns:
        dict: Keyword arguments for ``OfferSummary`` / ``OfferDetail``.
    """
    return {
        "id": offer.id,
        "url": offer.url,
        "store_id": store.id if store else None,
        "store_name": store.name if store else None,
        "store_domain": store.domain if store else None,
        "store_has_favicon": bool(store and store.favicon),
        "current_price": current.price if current else None,
        "is_in_stock": current.is_in_stock if current else None,
        "last_checked_at": current.timestamp if current else None,
    }


def _history_for_rules(window: list, current, cutoff: int) -> list:
    """The window plus the current record when it is older than the window."""
    if current is not None and current.timestamp < cutoff:
        return [*window, current]
    return window
```

Dashboard summary:

```python
def get_dashboard_summary(
    session: Session, now: int | None = None
) -> list[ProductDashboardSummary]:
    """Build the dashboard summary: one entry per product, valued by its best offer.

    Runs a constant number of queries regardless of the number of products
    or offers. The best offer follows ``best_offer``; its price statistics
    follow ``price_stats`` over the configured window (in days).

    Args:
        session (Session): Active database session.
        now (int | None): Reference Unix timestamp; defaults to now.

    Returns:
        list[ProductDashboardSummary]: One summary per product.
    """
    now = int(time.time()) if now is None else now
    window_days = get_hist_window_size(session)
    cutoff = now - window_days * SECONDS_PER_DAY

    products = session.exec(select(Product).order_by(Product.id)).all()
    offers_by_product: dict[int, list[Offer]] = defaultdict(list)
    for offer in session.exec(select(Offer).order_by(Offer.id)).all():
        offers_by_product[offer.product_id].append(offer)
    all_offers = [offer for offers in offers_by_product.values() for offer in offers]
    categories = _by_id(session, Category, {p.category_id for p in products})
    stores = _by_id(session, Store, {offer.store_id for offer in all_offers})
    windows = _window_records(session, cutoff)
    latest = _latest_records(session)

    summary_list: list[ProductDashboardSummary] = []
    for product in products:
        offers = offers_by_product.get(product.id, [])
        offer_stats = compute_product_offer_stats(
            [
                OfferHistory(
                    offer_id=offer.id,
                    history=_history_for_rules(
                        windows.get(offer.id, []), latest.get(offer.id), cutoff
                    ),
                )
                for offer in offers
            ],
            window_days,
            now,
        )
        best_id = offer_stats.best_offer_id
        best_window = windows.get(best_id, []) if best_id is not None else []
        best_current = latest.get(best_id) if best_id is not None else None
        stats = compute_window_stats(best_window, best_current)
        category = categories.get(product.category_id)

        summary_list.append(
            ProductDashboardSummary(
                id=product.id,
                name=product.name,
                category_id=product.category_id,
                category_name=category.name if category else "Unknown",
                category_color=category.color if category else "gray",
                priority=product.priority,
                currency=offers[0].currency if offers else "",
                current_price=best_current.price if best_current else None,
                price_change_pct=stats.price_change_pct,
                is_in_stock=offer_stats.is_in_stock,
                is_at_lowest=offer_stats.is_at_lowest,
                recent_prices=[record.price for record in best_window],
                best_offer_id=best_id,
                offers=[
                    OfferSummary(
                        **_offer_summary_fields(
                            offer, stores.get(offer.store_id), latest.get(offer.id)
                        )
                    )
                    for offer in offers
                ],
            )
        )

    return summary_list
```

Detail:

```python
def get_detail(session: Session, product_id: int) -> ProductDetailResponse:
    """Build the full product detail: every offer with its whole history.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = _get_or_404(session, product_id)
    category = session.get(Category, product.category_id)
    offers = offer_service.offers_of(session, product_id)
    stores = _by_id(session, Store, {offer.store_id for offer in offers})

    histories: dict[int, list[OfferHist]] = defaultdict(list)
    for row in session.exec(
        select(OfferHist)
        .where(col(OfferHist.offer_id).in_([offer.id for offer in offers]))
        .order_by(OfferHist.offer_id, OfferHist.timestamp, OfferHist.id)
    ).all():
        histories[row.offer_id].append(row)

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        priority=product.priority,
        category_id=product.category_id,
        category_name=category.name if category else "Unknown",
        category_color=category.color if category else "gray",
        description=product.description,
        currency=offers[0].currency if offers else "",
        offers=[
            OfferDetail(
                **_offer_summary_fields(
                    offer,
                    stores.get(offer.store_id),
                    histories[offer.id][-1] if histories[offer.id] else None,
                ),
                price_history=[
                    OfferHistResponse(
                        price=record.price,
                        is_in_stock=record.is_in_stock,
                        timestamp=record.timestamp,
                    )
                    for record in histories[offer.id]
                ],
            )
            for offer in offers
        ],
    )
```

- [ ] **Step 10: Update the router return types**

In `backend/src/routers/product_router.py`, replace the `Product` import with `ProductResponse` from the schemas, and set `-> ProductResponse` on `create_product` and `update_product`, and `-> list[ProductResponse]` on `read_products`. Update the delete docstring to "Delete a product (offers and history are cascade-deleted)."

- [ ] **Step 11: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_products.py tests/test_product_store.py tests/test_price_stats_contract.py tests/test_categories.py tests/test_contracts.py tests/test_best_offer_contract.py -v`
Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add backend/src/models backend/src/schemas/product.py backend/src/services/offer_service.py backend/src/services/product_service.py backend/src/routers/product_router.py backend/tests contracts/api-fields.json
git commit -m "feat(backend): split products into offers per store"
```

---

### Task 3: Cronjob, daily check and Telegram per offer

**Files:**
- Modify: `backend/src/product_status_cronjob.py`
- Modify: `backend/src/services/daily_check_service.py`
- Modify: `backend/src/schemas/daily_check.py`
- Modify: `backend/src/telegram_utils.py`
- Modify: `contracts/api-fields.json` (`DailyCheckStatusResponse.total_products` → `total_offers`)
- Test: `backend/tests/test_cronjob.py`, `backend/tests/test_daily_check.py`, `backend/tests/test_daily_report.py`

**Interfaces:**
- Consumes: `Offer`, `OfferHist`, `PendingStatusRetry.offer_id`, `DailyCheckRun.total_offers` (Task 2).
- Produces: `send_price_drop_alert(..., store_name: str | None = None)`, `send_stock_alert(..., store_name: str | None = None)`; `DailyCheckStatusResponse.total_offers`.

- [ ] **Step 1: Migrate the cronjob test fixtures to offers**

In `backend/tests/test_cronjob.py`, the `cron` fixture creates a `Store(domain="example.com", name="Example")`, a `Product` without `url`/`currency`, and an `Offer(product_id=product.id, url="https://example.com/widget", currency="EUR", store_id=store.id)`. It exposes `env.offer_id`, `env.offer_url`, `env.product_id`, `env.category_id`, `env.store_id`. Update the helpers:

```python
def _add(session, offer_id, price, is_in_stock, moment):
    session.add(
        OfferHist(
            offer_id=offer_id,
            price=price,
            is_in_stock=is_in_stock,
            timestamp=_ts(moment),
        )
    )
    session.commit()


def _history(session, offer_id):
    session.expire_all()
    return session.exec(
        select(OfferHist)
        .where(OfferHist.offer_id == offer_id)
        .order_by(OfferHist.timestamp)
    ).all()


def _add_product(session, cron, name):
    """Add a product with one offer; returns the offer's id and URL."""
    product = Product(
        name=name, priority="medium", category_id=cron.category_id, description=name
    )
    session.add(product)
    session.commit()
    offer = Offer(
        product_id=product.id,
        url=f"https://example.com/{name.lower()}",
        currency="EUR",
        store_id=cron.store_id,
    )
    session.add(offer)
    session.commit()
    offer_id, url = offer.id, offer.url
    session.commit()  # Release the connection before the cronjob uses it.
    return SimpleNamespace(id=offer_id, url=url)


def _mark_pending(session, offer_id, day_start):
    session.add(PendingStatusRetry(offer_id=offer_id, day_start=day_start))
    session.commit()


def _pending(session):
    session.expire_all()
    return {
        (p.offer_id, p.day_start)
        for p in session.exec(select(PendingStatusRetry)).all()
    }
```

Across the file, replace `cron.product_id` with `cron.offer_id` and `cron.product_url` with `cron.offer_url` wherever it refers to history, pending rows or scraped URLs, and `total_products` with `total_offers`. `test_deleting_a_product_deletes_its_pending_retry` deletes the `Product` and still expects no pending rows (cascade product → offer → pending).

- [ ] **Step 2: Add the failing per-offer tests**

Append to `backend/tests/test_cronjob.py`:

```python
def test_checks_every_offer_of_a_product(session, cron):
    second = Offer(
        product_id=cron.product_id,
        url="https://other.example/widget",
        currency="EUR",
    )
    session.add(second)
    session.commit()
    second_id = second.id
    session.commit()

    _run()

    assert sorted(cron.scraped) == sorted([cron.offer_url, "https://other.example/widget"])
    assert len(_history(session, cron.offer_id)) == 1
    assert len(_history(session, second_id)) == 1


def test_price_drop_alert_names_the_store_and_links_the_offer(session, cron):
    _add(session, cron.offer_id, 120.0, True, NOW - timedelta(days=1))

    _run()

    (alert,) = cron.price_drop_alerts
    assert alert["store_name"] == "Example"
    assert alert["product_url"] == cron.offer_url
    assert alert["product_name"] == "Widget"


def test_daily_run_counts_offers(session, cron):
    _add_product(session, cron, "Gadget")

    _run()

    session.expire_all()
    (run,) = session.exec(select(DailyCheckRun)).all()
    assert run.total_offers == 2
```

In `backend/tests/test_daily_check.py` and `test_daily_report.py`, apply the same fixture changes (products get one offer, history and pending rows use `offer_id`, `total_products` → `total_offers`). Update the English expected report texts to say "prices" instead of "products", e.g. `"✅ Daily check completed: 2 of 3 prices recorded (1 failed)."`.

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_cronjob.py tests/test_daily_check.py tests/test_daily_report.py -v`
Expected: FAIL (the cronjob still imports `ProductHist`).

- [ ] **Step 4: Add the store name to the Telegram alerts**

In `backend/src/telegram_utils.py`, add a keyword parameter `store_name: str | None = None` to both `send_price_drop_alert` and `send_stock_alert` (document it in the docstring: "The offer's store name, shown under the product when given"). After computing `escaped_product_name`, add:

```python
    store_line = {
        "english": f"Store: {escape_markdown(store_name)}\n" if store_name else "",
        "spanish": f"Tienda: {escape_markdown(store_name)}\n" if store_name else "",
    }
```

and insert `f"{store_line['english']}"` right after the `Product:` line of the English message, and `f"{store_line['spanish']}"` after the `Producto:` line of the Spanish one, in both functions.

Replace `_DAILY_REPORT_TEXTS` with the same texts where "products" becomes "prices" (English) and "productos" becomes "precios" (Spanish):

```python
_DAILY_REPORT_TEXTS = {
    "english": {
        "done": "✅ Daily check completed: {recorded} of {total} prices recorded",
        "failed": " ({failed} failed)",
        "done_limit": (
            "Gemini limit reached at {limit_time} with {pending_at_limit} prices "
            "left; finished by retrying."
        ),
        "unchecked": (
            "⚠️ {pending} of {total} prices could not be checked today: the Gemini "
            "limit was reached at {limit_time} with {pending_at_limit} prices left. "
            "Tomorrow's run will check them first."
        ),
    },
    "spanish": {
        "done": (
            "✅ Revisión diaria completada: {recorded} de {total} precios registrados"
        ),
        "failed": " ({failed} fallidos)",
        "done_limit": (
            "Límite de Gemini alcanzado a las {limit_time} con {pending_at_limit} "
            "precios pendientes; completada con reintentos."
        ),
        "unchecked": (
            "⚠️ {pending} de {total} precios no se han podido revisar hoy: el límite "
            "de Gemini se alcanzó a las {limit_time} con {pending_at_limit} precios "
            "pendientes. Mañana se revisarán primero."
        ),
    },
}
```

Update the `build_daily_*` docstrings from "Products …" to "Offers (prices) …".

- [ ] **Step 5: Move the cronjob to offers**

In `backend/src/product_status_cronjob.py`:

1. Imports: `from src.models.database_models import DailyCheckRun, Offer, OfferHist, PendingStatusRetry, Product, Store`.
2. Module docstring: "fetch prices for every offer (a product in one store) not yet checked today"; and "the offers left" in steps 2–3.
3. `_check_price_drop(product, offer, store_name, product_status, last_in_stock_hist, ...)` and `_check_stock_change(product, offer, store_name, product_status, last_hist, ...)`: pass `product_url=offer.url`, `currency=offer.currency`, `store_name=store_name` to the Telegram senders; log with `product.name`.
4. `_has_record_between(session, offer_id, start, end)` and `_last_record(session, offer_id, in_stock_only=False)` query `OfferHist` by `offer_id`.
5. Rename `_check_product` to `_check_offer(session, offer, google_api_key, tg, now)`. At the top:

```python
    product = session.get(Product, offer.product_id)
    store = session.get(Store, offer.store_id) if offer.store_id is not None else None
    store_name = store.name if store else None
    label = f"{product.name} @ {store_name or offer.url} (offer ID: {offer.id})"
```

   Use `label` in every log line, `offer.url` for `get_product_status`, and store `OfferHist(offer_id=offer.id, ...)`.
6. `_check_products` → `_check_offers(session, offers, google_api_key, now)`, returning pending offer ids.
7. `_products_least_recently_checked_first` → `_offers_least_recently_checked_first`:

```python
def _offers_least_recently_checked_first(session: Session) -> list[Offer]:
    """Return every offer, the ones without a recent record first.

    Offers never checked come first, then by the timestamp of their last
    record (oldest first), then by ID, so coverage rotates when the daily
    quota cannot cover every offer.
    """
    last_checked = (
        select(
            OfferHist.offer_id,
            func.max(OfferHist.timestamp).label("last_timestamp"),
        )
        .group_by(OfferHist.offer_id)
        .subquery()
    )
    return session.exec(
        select(Offer)
        .outerjoin(last_checked, last_checked.c.offer_id == Offer.id)
        .order_by(last_checked.c.last_timestamp.asc().nulls_first(), Offer.id)
    ).all()
```

8. `fetch_and_store_product_status`: use the offers list, `DailyCheckRun(total_offers=len(offers), ...)`, `PendingStatusRetry(offer_id=offer_id, ...)`, "No offers found in database" and "Found N offers to process".
9. `retry_rate_limited_products`: read `PendingStatusRetry.offer_id`, filter offers, and delete with `PendingStatusRetry.offer_id.not_in(still_pending)`.
10. `_build_daily_report`: `run.total_offers` instead of `run.total_products`.

- [ ] **Step 6: Count offers in the daily check service**

In `backend/src/services/daily_check_service.py`, import `Offer, OfferHist` instead of `Product, ProductHist`; `DailyCounts` docstring: "Offers recorded today and offers still pending a quota retry."; in `count_today`:

```python
    recorded = session.exec(
        select(func.count(func.distinct(OfferHist.offer_id)))
        .join(Offer, Offer.id == OfferHist.offer_id)
        .where(OfferHist.timestamp >= day_start, OfferHist.timestamp < day_end)
    ).one()
```

`get_status` sets `total_offers=run.total_offers if run else None`. In `backend/src/schemas/daily_check.py`, rename the field to `total_offers: int | None`. In `contracts/api-fields.json`, rename `total_products` to `total_offers` in `DailyCheckStatusResponse`.

- [ ] **Step 7: Run the whole backend suite**

Run: `cd backend && uv run pytest -v`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend contracts/api-fields.json
git commit -m "feat(backend): check prices per offer and name the store in alerts"
```

---

### Task 4: Offer endpoints and product merge

**Files:**
- Modify: `backend/src/services/offer_service.py`
- Create: `backend/src/routers/offer_router.py`
- Modify: `backend/src/services/product_service.py` (`merge`)
- Modify: `backend/src/routers/product_router.py`, `backend/src/api.py`
- Test: `backend/tests/test_offers.py`, `backend/tests/test_merge.py`

**Interfaces:**
- Consumes: `resolve_store`, `offers_of`, `product_currency` (Task 2); `to_product_response`, `get_detail` (Task 2).
- Produces: `POST /products/{id}/offers -> OfferResponse`, `PATCH /offers/{id} -> OfferResponse`, `POST /offers/{id}/unlink -> ProductResponse`, `DELETE /offers/{id} -> {"ok": true}`, `POST /products/{id}/merge -> ProductDetailResponse`.

- [ ] **Step 1: Write the failing offer tests**

`backend/tests/test_offers.py`:

```python
"""Tests for adding, editing, unlinking and deleting offers."""

from sqlmodel import select
from src.models.database_models import Offer, OfferHist, Product
from tests.factories import add_history, make_category, make_offer, make_product


def _product_with_offer(session, currency="EUR"):
    category = make_category(session)
    product = make_product(session, category.id, name="Drum kit")
    offer = make_offer(
        session, product.id, url="https://www.thomann.es/kit.htm", currency=currency
    )
    return product, offer


def test_add_offer_to_a_product(client, session):
    product, _ = _product_with_offer(session)

    response = client.post(
        f"/products/{product.id}/offers",
        json={"url": "https://www.amazon.es/dp/KIT", "currency": "eur"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["product_id"] == product.id
    assert body["currency"] == "EUR"
    assert body["store_id"] is not None


def test_add_offer_rejects_another_currency(client, session):
    product, _ = _product_with_offer(session, currency="EUR")

    response = client.post(
        f"/products/{product.id}/offers",
        json={"url": "https://www.amazon.com/dp/KIT", "currency": "USD"},
    )

    assert response.status_code == 409


def test_add_offer_rejects_a_duplicate_url(client, session):
    product, offer = _product_with_offer(session)

    response = client.post(
        f"/products/{product.id}/offers",
        json={"url": offer.url, "currency": "EUR"},
    )

    assert response.status_code == 409


def test_add_offer_to_an_unknown_product(client):
    response = client.post(
        "/products/999/offers", json={"url": "https://a.es/x", "currency": "EUR"}
    )

    assert response.status_code == 404


def test_update_offer_url_re_resolves_the_store(client, session):
    product, offer = _product_with_offer(session)
    old_store_id = offer.store_id

    response = client.patch(
        f"/offers/{offer.id}", json={"url": "https://www.amazon.es/dp/KIT"}
    )

    assert response.status_code == 200
    assert response.json()["url"] == "https://www.amazon.es/dp/KIT"
    assert response.json()["store_id"] != old_store_id


def test_update_offer_rejects_a_url_of_a_sibling_offer(client, session):
    product, offer = _product_with_offer(session)
    sibling = make_offer(session, product.id, url="https://www.amazon.es/dp/KIT")

    response = client.patch(f"/offers/{sibling.id}", json={"url": offer.url})

    assert response.status_code == 409


def test_unlink_moves_the_offer_and_its_history_to_a_new_product(client, session):
    product, offer = _product_with_offer(session)
    other = make_offer(session, product.id, url="https://www.amazon.es/dp/KIT")
    add_history(session, other.id, [(600.0, True, 1_000)])

    response = client.post(f"/offers/{other.id}/unlink")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] != product.id
    assert body["name"] == "Drum kit"
    assert [o["id"] for o in body["offers"]] == [other.id]
    session.expire_all()
    assert session.get(Offer, other.id).product_id == body["id"]
    assert len(session.exec(select(OfferHist)).all()) == 1


def test_unlink_the_only_offer_is_rejected(client, session):
    _, offer = _product_with_offer(session)

    assert client.post(f"/offers/{offer.id}/unlink").status_code == 409


def test_delete_offer_deletes_its_history(client, session):
    product, offer = _product_with_offer(session)
    other = make_offer(session, product.id, url="https://www.amazon.es/dp/KIT")
    add_history(session, other.id, [(600.0, True, 1_000)])

    assert client.delete(f"/offers/{other.id}").status_code == 200

    session.expire_all()
    assert session.get(Offer, other.id) is None
    assert session.exec(select(OfferHist)).all() == []
    assert session.get(Product, product.id) is not None


def test_delete_the_only_offer_is_rejected(client, session):
    _, offer = _product_with_offer(session)

    assert client.delete(f"/offers/{offer.id}").status_code == 409


def test_unknown_offer_is_404(client):
    assert client.patch("/offers/999", json={"url": "https://a.es/x"}).status_code == 404
    assert client.post("/offers/999/unlink").status_code == 404
    assert client.delete("/offers/999").status_code == 404
```

- [ ] **Step 2: Write the failing merge tests**

`backend/tests/test_merge.py`:

```python
"""Tests for merging two products into one."""

from sqlmodel import select
from src.models.database_models import Offer, OfferHist, Product
from tests.factories import add_history, make_category, make_offer, make_product


def _two_products(session, source_currency="EUR"):
    category = make_category(session)
    other_category = make_category(session, name="Music", color="#00FF00")
    target = make_product(session, category.id, name="Drum kit", priority="high")
    source = make_product(session, other_category.id, name="E-drums", priority="low")
    target_offer = make_offer(
        session, target.id, url="https://www.thomann.es/kit.htm", currency="EUR"
    )
    source_offer = make_offer(
        session, source.id, url="https://www.amazon.es/dp/KIT", currency=source_currency
    )
    add_history(session, source_offer.id, [(600.0, True, 1_000)])
    return target, source, target_offer, source_offer


def test_merge_moves_offers_keeps_target_fields_and_deletes_source(client, session):
    target, source, target_offer, source_offer = _two_products(session)

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": source.id}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Drum kit"
    assert body["priority"] == "high"
    assert [o["id"] for o in body["offers"]] == [target_offer.id, source_offer.id]
    assert [r["price"] for r in body["offers"][1]["price_history"]] == [600.0]
    session.expire_all()
    assert session.get(Product, source.id) is None
    assert session.get(Offer, source_offer.id).product_id == target.id
    assert len(session.exec(select(OfferHist)).all()) == 1


def test_merge_can_keep_the_source_fields(client, session):
    target, source, _, _ = _two_products(session)

    body = client.post(
        f"/products/{target.id}/merge",
        json={"source_product_id": source.id, "keep": "source"},
    ).json()

    assert body["id"] == target.id
    assert body["name"] == "E-drums"
    assert body["priority"] == "low"
    assert body["category_name"] == "Music"


def test_merge_with_itself_is_400(client, session):
    target, _, _, _ = _two_products(session)

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": target.id}
    )

    assert response.status_code == 400


def test_merge_unknown_product_is_404(client, session):
    target, _, _, _ = _two_products(session)

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": 999}
    )

    assert response.status_code == 404


def test_merge_across_currencies_is_409(client, session):
    target, source, _, _ = _two_products(session, source_currency="USD")

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": source.id}
    )

    assert response.status_code == 409
    session.expire_all()
    assert session.get(Product, source.id) is not None


def test_merge_with_a_shared_url_is_409(client, session):
    target, source, target_offer, source_offer = _two_products(session)
    source_offer.url = target_offer.url
    session.add(source_offer)
    session.commit()

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": source.id}
    )

    assert response.status_code == 409
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd backend && uv run pytest tests/test_offers.py tests/test_merge.py -v`
Expected: FAIL with 404/405 responses (routes missing).

- [ ] **Step 4: Implement the offer operations**

Append to `backend/src/services/offer_service.py` (add `Product` to the model imports and `OfferCreate, OfferUpdate` from `src.schemas.product`):

```python
def _get_offer_or_404(session: Session, offer_id: int) -> Offer:
    """Return an offer or raise a 404."""
    offer = session.get(Offer, offer_id)
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


def ensure_same_currency(session: Session, product_id: int, currency: str) -> None:
    """Raise a 409 if ``currency`` differs from the product's.

    Raises:
        HTTPException: 409 when the product already uses another currency.
    """
    existing = product_currency(session, product_id)
    if existing is not None and existing.upper() != currency.upper():
        raise HTTPException(
            status_code=409,
            detail=f"All stores of a product must use {existing}",
        )


def ensure_unique_url(
    session: Session, product_id: int, url: str, exclude_offer_id: int | None = None
) -> None:
    """Raise a 409 if another offer of the product already has ``url``.

    Raises:
        HTTPException: 409 on a duplicate URL.
    """
    for offer in offers_of(session, product_id):
        if offer.id != exclude_offer_id and offer.url == url:
            raise HTTPException(
                status_code=409, detail="This store URL is already tracked"
            )


def _ensure_not_last(session: Session, offer: Offer) -> None:
    """Raise a 409 if ``offer`` is its product's only offer."""
    if len(offers_of(session, offer.product_id)) == 1:
        raise HTTPException(
            status_code=409,
            detail="A product needs at least one store; delete the product instead",
        )


def add(session: Session, product_id: int, payload: OfferCreate) -> Offer:
    """Add a store to a product.

    Raises:
        HTTPException: 404 for an unknown product, 409 for another currency
            or a duplicate URL, 422 if the URL has no hostname.
    """
    if not session.get(Product, product_id):
        raise HTTPException(status_code=404, detail="Product not found")
    ensure_same_currency(session, product_id, payload.currency)
    ensure_unique_url(session, product_id, payload.url)
    store = resolve_store(session, payload.url, payload.store_id)
    offer = Offer(
        product_id=product_id,
        url=payload.url,
        store_id=store.id,
        currency=payload.currency.upper(),
    )
    session.add(offer)
    session.commit()
    session.refresh(offer)
    return offer


def update(session: Session, offer_id: int, payload: OfferUpdate) -> Offer:
    """Change an offer's URL; the store is re-resolved from it.

    Raises:
        HTTPException: 404 for an unknown offer, 409 for a sibling's URL,
            422 if the URL has no hostname.
    """
    offer = _get_offer_or_404(session, offer_id)
    ensure_unique_url(session, offer.product_id, payload.url, exclude_offer_id=offer.id)
    offer.store_id = resolve_store(session, payload.url, offer.store_id).id
    offer.url = payload.url
    session.add(offer)
    session.commit()
    session.refresh(offer)
    return offer


def unlink(session: Session, offer_id: int) -> Product:
    """Move an offer (with its history) into a new product with the same fields.

    Raises:
        HTTPException: 404 for an unknown offer, 409 for the only offer.
    """
    offer = _get_offer_or_404(session, offer_id)
    _ensure_not_last(session, offer)
    source = session.get(Product, offer.product_id)
    product = Product(
        name=source.name,
        priority=source.priority,
        category_id=source.category_id,
        description=source.description,
    )
    session.add(product)
    session.flush()
    offer.product_id = product.id
    session.add(offer)
    session.commit()
    session.refresh(product)
    return product


def delete(session: Session, offer_id: int) -> dict:
    """Delete an offer and its history.

    Raises:
        HTTPException: 404 for an unknown offer, 409 for the only offer.
    """
    offer = _get_offer_or_404(session, offer_id)
    _ensure_not_last(session, offer)
    session.delete(offer)
    session.commit()
    return {"ok": True}
```

- [ ] **Step 5: Implement the merge**

Append to `backend/src/services/product_service.py` (import `ProductMergeRequest`):

```python
_SHARED_FIELDS = ("name", "priority", "category_id", "description")


def merge(
    session: Session, target_id: int, payload: ProductMergeRequest
) -> ProductDetailResponse:
    """Merge another product into ``target_id``.

    Every source offer (with its history) moves to the target, the target
    takes the source's shared fields when ``keep == "source"``, and the
    source product is deleted.

    Raises:
        HTTPException: 400 when merging a product with itself, 404 for an
            unknown product, 409 for another currency or a shared URL.
    """
    if payload.source_product_id == target_id:
        raise HTTPException(status_code=400, detail="Cannot merge a product with itself")
    target = _get_or_404(session, target_id)
    source = _get_or_404(session, payload.source_product_id)
    source_offers = offer_service.offers_of(session, source.id)
    for offer in source_offers:
        offer_service.ensure_same_currency(session, target.id, offer.currency)
        offer_service.ensure_unique_url(session, target.id, offer.url)

    for offer in source_offers:
        offer.product_id = target.id
        session.add(offer)
    if payload.keep == "source":
        for field in _SHARED_FIELDS:
            setattr(target, field, getattr(source, field))
        session.add(target)
    # Move the offers before deleting the source, or the cascade takes them.
    session.flush()
    session.delete(source)
    session.commit()
    return get_detail(session, target.id)
```

- [ ] **Step 6: Add the routes**

`backend/src/routers/offer_router.py`:

```python
"""
Offer router — a product in one store: add, edit URL, unlink and delete.
"""

from fastapi import APIRouter
from src.core.database import SessionDep
from src.schemas.product import OfferCreate, OfferResponse, OfferUpdate, ProductResponse
from src.services import offer_service, product_service

router = APIRouter(tags=["offers"])


@router.post("/products/{product_id}/offers")
def add_offer(
    product_id: int, payload: OfferCreate, session: SessionDep
) -> OfferResponse:
    """Add a store to a product."""
    return OfferResponse(**offer_service.add(session, product_id, payload).model_dump())


@router.patch("/offers/{offer_id}")
def update_offer(offer_id: int, payload: OfferUpdate, session: SessionDep) -> OfferResponse:
    """Change an offer's URL."""
    return OfferResponse(
        **offer_service.update(session, offer_id, payload).model_dump()
    )


@router.post("/offers/{offer_id}/unlink")
def unlink_offer(offer_id: int, session: SessionDep) -> ProductResponse:
    """Move an offer into a new standalone product."""
    product = offer_service.unlink(session, offer_id)
    return product_service.to_product_response(session, product)


@router.delete("/offers/{offer_id}")
def delete_offer(offer_id: int, session: SessionDep) -> dict:
    """Delete an offer and its history."""
    return offer_service.delete(session, offer_id)
```

In `backend/src/routers/product_router.py`, add (importing `ProductMergeRequest`):

```python
@router.post("/products/{product_id}/merge")
def merge_products(
    product_id: int, payload: ProductMergeRequest, session: SessionDep
) -> ProductDetailResponse:
    """Merge another product (and its stores) into this one."""
    return product_service.merge(session, product_id, payload)
```

In `backend/src/api.py`, add `offer_router` to the router imports and `app.include_router(offer_router.router)` after the product router.

- [ ] **Step 7: Run the whole backend suite**

Run: `cd backend && uv run pytest -v`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add backend
git commit -m "feat(backend): add offer endpoints and product merge"
```

---

### Task 5: Seed data and backend docs

**Files:**
- Modify: `backend/src/setup_backend.py`
- Modify: `backend/README.md`, `backend/db/README.md`

- [ ] **Step 1: Seed one product with two offers**

In `backend/src/setup_backend.py`, import `Offer, OfferHist` instead of `ProductHist`. Replace the two products with one product and two offers:

```python
        # Create product, tracked in two stores
        print("Creating product...")
        producto = Product(
            name="Millenium MPS-850 E-Drum Set Bundle",
            category_id=electronica.id,
            priority="high",
            description="Set de batería electrónica Millenium MPS-850 con todo lo necesario para empezar a tocar.",
        )
        session.add(producto)
        session.commit()
        session.refresh(producto)

        offer_thomann = Offer(
            product_id=producto.id,
            url="https://www.thomann.es/millenium_mps_850_e_drum_set_bundle.htm",
            store_id=thomann.id,
            currency="EUR",
        )
        offer_amazon = Offer(
            product_id=producto.id,
            url="https://www.amazon.es/dp/B07MPS850",
            store_id=amazon.id,
            currency="EUR",
        )
        session.add(offer_thomann)
        session.add(offer_amazon)
        session.commit()
        session.refresh(offer_thomann)
        session.refresh(offer_amazon)
        print(f"  ✓ Created product: {producto.name} (ID: {producto.id})")
        print(f"    Stores: {thomann.name}, {amazon.name}")
```

In the history loop, iterate `((offer_thomann, 599.99), (offer_amazon, 629.99))` and create `OfferHist(offer_id=offer.id, ...)`. Final message: "✓ Created 60 price history records per store".

- [ ] **Step 2: Check the seed**

Run: `cd /home/guille/wishlist-tracker && rm -f backend/db/database.db && just db-seed && sqlite3 backend/db/database.db "select count(*) from product; select count(*) from offer; select count(*) from offerhist;"`
Expected: `1`, `2`, `120`.

- [ ] **Step 3: Update the backend docs**

- `backend/db/README.md`: replace the `Product`/`ProductHist` table descriptions with `Product` (shared fields), `Offer` (product in one store: url, store, currency; at least one per product; same currency), `OfferHist`, and mention `PendingStatusRetry.offer_id` and `DailyCheckRun.total_offers`. Add: "The schema has no migrations; recreate the database after pulling this change."
- `backend/README.md`: list the new endpoints (`POST /products/{id}/offers`, `PATCH /offers/{id}`, `POST /offers/{id}/unlink`, `DELETE /offers/{id}`, `POST /products/{id}/merge`) and the new `POST /products/` body shape.

- [ ] **Step 4: Commit**

```bash
git add backend/src/setup_backend.py backend/README.md backend/db/README.md
git commit -m "chore(backend): seed a product tracked in two stores and document offers"
```

---

### Task 6: Frontend best-offer rules and product staleness

**Files:**
- Create: `frontend/src/lib/bestOffer.js`
- Test: `frontend/src/lib/bestOffer.contract.test.js`, `frontend/src/lib/bestOffer.test.js`
- Modify: `frontend/src/lib/staleness.js`, `frontend/src/lib/staleness.test.js`
- Modify: `frontend/src/lib/dashboardSummary.js`, `frontend/src/lib/dashboardSummary.test.js`

**Interfaces:**
- Consumes: `getCurrentRecord`, `filterPriceHistoryByRange`, `RANGE_ALL` from `lib/productHistory.js`.
- Produces:
  - `selectBestOffer(offers: {id, price_history}[]) -> number|null`
  - `computeProductOfferStats(offers, range: string, now: number) -> {bestOfferId, isInStock, isAtLowest}`
  - `computeLowestAcrossOffers(offers, range, now) -> {price, timestamp, offerId}|null`
  - `findBestOfferSummary(product: {best_offer_id, offers}) -> offer|null`
  - `staleOffers(product: {offers}, now) -> offer[]`, `isProductStale(product, now) -> boolean`, `oldestCheckedAt(offers) -> number|null`

- [ ] **Step 1: Write the failing contract test**

`frontend/src/lib/bestOffer.contract.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import { RANGE_ALL } from './productHistory';
import { computeProductOfferStats, selectBestOffer } from './bestOffer';

// Frontend side of `contracts/best-offer-cases.json`; the backend side is
// `backend/tests/test_best_offer_contract.py`.
const CONTRACT = readContract('best-offer-cases.json');

const toOffers = (testCase) =>
  testCase.offers.map((offer) => ({
    id: offer.offer_id,
    price_history: offer.history
  }));

const toRange = (windowDays) =>
  windowDays === null ? RANGE_ALL : String(windowDays);

describe('best-offer contract', () => {
  it.each(CONTRACT.cases.map((testCase) => [testCase.name, testCase]))(
    '%s',
    (_name, testCase) => {
      const stats = computeProductOfferStats(
        toOffers(testCase),
        toRange(testCase.window_days),
        testCase.now
      );

      expect(stats).toEqual({
        bestOfferId: testCase.expected.best_offer_id,
        isInStock: testCase.expected.is_in_stock,
        isAtLowest: testCase.expected.is_at_lowest
      });
      expect(selectBestOffer(toOffers(testCase))).toBe(
        testCase.expected.best_offer_id
      );
    }
  );
});
```

- [ ] **Step 2: Write the failing unit tests**

`frontend/src/lib/bestOffer.test.js`:

```js
import { describe, expect, it } from 'vitest';
import {
  computeLowestAcrossOffers,
  findBestOfferSummary
} from './bestOffer';

const NOW = 10_000_000;

describe('computeLowestAcrossOffers', () => {
  it('returns the cheapest in-stock record of any offer in the range', () => {
    const offers = [
      {
        id: 1,
        price_history: [{ price: 80, is_in_stock: true, timestamp: 9_000_000 }]
      },
      {
        id: 2,
        price_history: [
          { price: 70, is_in_stock: false, timestamp: 9_500_000 },
          { price: 90, is_in_stock: true, timestamp: 9_900_000 }
        ]
      }
    ];

    expect(computeLowestAcrossOffers(offers, '30', NOW)).toEqual({
      price: 80,
      timestamp: 9_000_000,
      offerId: 1
    });
  });

  it('keeps the most recent record on price ties', () => {
    const offers = [
      { id: 1, price_history: [{ price: 80, is_in_stock: true, timestamp: 9_000_000 }] },
      { id: 2, price_history: [{ price: 80, is_in_stock: true, timestamp: 9_100_000 }] }
    ];

    expect(computeLowestAcrossOffers(offers, '30', NOW).offerId).toBe(2);
  });

  it('is null without in-stock records in the range', () => {
    expect(computeLowestAcrossOffers([{ id: 1, price_history: [] }], '30', NOW)).toBeNull();
  });
});

describe('findBestOfferSummary', () => {
  it('returns the offer named by best_offer_id', () => {
    const product = { best_offer_id: 2, offers: [{ id: 1 }, { id: 2 }] };
    expect(findBestOfferSummary(product)).toEqual({ id: 2 });
  });

  it('falls back to the first offer without a best offer', () => {
    const product = { best_offer_id: null, offers: [{ id: 1 }, { id: 2 }] };
    expect(findBestOfferSummary(product)).toEqual({ id: 1 });
  });

  it('is null without offers', () => {
    expect(findBestOfferSummary({ best_offer_id: null, offers: [] })).toBeNull();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/lib/bestOffer.contract.test.js src/lib/bestOffer.test.js`
Expected: FAIL with "Failed to resolve import './bestOffer'".

- [ ] **Step 4: Implement `bestOffer.js`**

`frontend/src/lib/bestOffer.js`:

```js
/**
 * Best-offer rules for a product tracked in several stores. Mirrors the
 * backend's `best_offer.py`; both are pinned by
 * `contracts/best-offer-cases.json` (see `contracts/README.md`).
 *
 * @typedef {import('./productHistory').PriceHistoryRecord} PriceHistoryRecord
 * @typedef {{ id: number, price_history: PriceHistoryRecord[] }} OfferWithHistory
 */

import { filterPriceHistoryByRange, getCurrentRecord } from './productHistory';

/**
 * Sort key of an offer with history: in stock first, then cheaper, then
 * newer, then lower id.
 */
const rankOf = (id, current) => [
  current.is_in_stock === true ? 0 : 1,
  current.price,
  -current.timestamp,
  id
];

const compareRanks = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

/**
 * @param {OfferWithHistory[]} offers
 * @returns {number|null} The id of the offer that represents the product,
 *   or `null` when no offer has history.
 */
export function selectBestOffer(offers) {
  let best = null;
  for (const offer of offers ?? []) {
    const current = getCurrentRecord(offer.price_history);
    if (!current) continue;
    const rank = rankOf(offer.id, current);
    if (best === null || compareRanks(rank, best) < 0) best = rank;
  }
  return best === null ? null : best[3];
}

/**
 * Product-level results of the best-offer rules.
 *
 * @param {OfferWithHistory[]} offers
 * @param {string} range - A `RANGE_OPTIONS` value or `RANGE_ALL`.
 * @param {number} [now] - Seconds since epoch.
 * @returns {{ bestOfferId: number|null, isInStock: boolean|null, isAtLowest: boolean }}
 */
export function computeProductOfferStats(offers, range, now = Date.now() / 1000) {
  const currents = new Map(
    (offers ?? []).map((offer) => [offer.id, getCurrentRecord(offer.price_history)])
  );
  const withHistory = [...currents.values()].filter(Boolean);
  const isInStock =
    withHistory.length === 0
      ? null
      : withHistory.some((current) => current.is_in_stock === true);

  const bestOfferId = selectBestOffer(offers);
  let isAtLowest = false;
  const best = bestOfferId === null ? null : currents.get(bestOfferId);
  if (best && best.is_in_stock === true) {
    const lowest = computeLowestAcrossOffers(offers, range, now);
    isAtLowest = lowest !== null && best.price <= lowest.price;
  }

  return { bestOfferId, isInStock, isAtLowest };
}

/**
 * The cheapest in-stock record of any offer inside the range (the most
 * recent one on ties).
 *
 * @param {OfferWithHistory[]} offers
 * @param {string} range
 * @param {number} [now] - Seconds since epoch.
 * @returns {{ price: number, timestamp: number, offerId: number }|null}
 */
export function computeLowestAcrossOffers(offers, range, now = Date.now() / 1000) {
  let lowest = null;
  for (const offer of offers ?? []) {
    for (const record of filterPriceHistoryByRange(offer.price_history, range, now)) {
      if (record.is_in_stock !== true) continue;
      if (
        lowest === null ||
        record.price < lowest.price ||
        (record.price === lowest.price && record.timestamp >= lowest.timestamp)
      ) {
        lowest = { price: record.price, timestamp: record.timestamp, offerId: offer.id };
      }
    }
  }
  return lowest;
}

/**
 * The dashboard row's best offer summary (the first offer when the product
 * has no best offer yet, so "Open in store" always has a URL).
 *
 * @param {{ best_offer_id: number|null, offers: object[] }} product
 * @returns {object|null}
 */
export function findBestOfferSummary(product) {
  const offers = product?.offers ?? [];
  return (
    offers.find((offer) => offer.id === product.best_offer_id) ??
    offers[0] ??
    null
  );
}
```

- [ ] **Step 5: Add product staleness helpers**

Append to `frontend/src/lib/staleness.js`:

```js
/**
 * The offers (stores) of a product whose price is stale.
 *
 * @param {{ offers?: Array<{ last_checked_at?: number|null }> }} product
 * @param {number} [now] - Reference Unix time in seconds; defaults to now.
 * @returns {object[]}
 */
export const staleOffers = (product, now = nowInSeconds()) =>
  (product?.offers ?? []).filter((offer) => isStale(offer, now));

/**
 * A product is stale when any of its offers is stale.
 *
 * @param {{ offers?: object[] }} product
 * @param {number} [now]
 * @returns {boolean}
 */
export const isProductStale = (product, now = nowInSeconds()) =>
  staleOffers(product, now).length > 0;

/**
 * @param {Array<{ last_checked_at?: number|null }>} offers
 * @returns {number|null} The oldest `last_checked_at` among the offers that
 *   were checked, or `null` when none was.
 */
export const oldestCheckedAt = (offers) => {
  const checks = (offers ?? [])
    .map((offer) => offer.last_checked_at)
    .filter((value) => typeof value === 'number');
  return checks.length === 0 ? null : Math.min(...checks);
};
```

Add tests to `frontend/src/lib/staleness.test.js`:

```js
describe('product staleness', () => {
  const NOW = 100 * 86400;
  const fresh = { id: 1, last_checked_at: NOW - 3600 };
  const stale = { id: 2, last_checked_at: NOW - 4 * 86400 };
  const unchecked = { id: 3, last_checked_at: null };

  it('is stale when any offer is stale', () => {
    expect(isProductStale({ offers: [fresh, stale] }, NOW)).toBe(true);
    expect(staleOffers({ offers: [fresh, stale] }, NOW)).toEqual([stale]);
  });

  it('is not stale when every offer is fresh or unchecked', () => {
    expect(isProductStale({ offers: [fresh, unchecked] }, NOW)).toBe(false);
  });

  it('finds the oldest check', () => {
    expect(oldestCheckedAt([fresh, stale, unchecked])).toBe(stale.last_checked_at);
    expect(oldestCheckedAt([unchecked])).toBeNull();
  });
});
```

(Import `isProductStale`, `staleOffers`, `oldestCheckedAt`.)

- [ ] **Step 6: Count stale products by offers in the summary strip**

In `frontend/src/lib/dashboardSummary.js`, import `isProductStale` instead of `isStale`, replace the typedef's `last_checked_at` property with `@property {Array<{last_checked_at?: number|null}>} offers`, and set `staleCount: products.filter((product) => isProductStale(product, now)).length`. In `dashboardSummary.test.js`, change every product fixture's `last_checked_at: X` to `offers: [{ last_checked_at: X }]`, and add:

```js
it('counts a product once when two of its stores are stale', () => {
  const now = 100 * 86400;
  const old = now - 5 * 86400;
  const { staleCount, itemCount } = computeDashboardSummary(
    [{ current_price: 10, currency: 'EUR', offers: [{ last_checked_at: old }, { last_checked_at: old }] }],
    now
  );
  expect(itemCount).toBe(1);
  expect(staleCount).toBe(1);
});
```

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npx vitest run src/lib/bestOffer.contract.test.js src/lib/bestOffer.test.js src/lib/staleness.test.js src/lib/dashboardSummary.test.js`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib
git commit -m "feat(frontend): add best-offer rules and per-store staleness"
```

---

### Task 7: API layer, products store and e2e fixtures

**Files:**
- Create: `frontend/src/lib/api/offers.js`, `frontend/src/lib/api/offers.test.js`
- Modify: `frontend/src/lib/api/products.js`, `frontend/src/lib/api/products.test.js`, `frontend/src/lib/api/index.js`
- Modify: `frontend/src/stores/productsStore.js`, `frontend/src/stores/productsStore.test.js`
- Modify: `frontend/e2e/fixtures/products.js`, `frontend/e2e/fixtures/dailyCheck.js`, `frontend/src/lib/contracts.test.js`

**Interfaces:**
- Produces:
  - `offers.add(productId, data, signal)`, `offers.update(offerId, data, signal)`, `offers.unlink(offerId, signal)`, `offers.remove(offerId, signal)`; `products.merge(id, data, signal)`.
  - Store actions: `addOffer(productId, data) -> offer`, `updateOffer(productId, offerId, data) -> offer`, `unlinkOffer(productId, offerId) -> product`, `removeOffer(productId, offerId)`, `merge(targetId, { source_product_id, keep }) -> detail`.
  - Fixtures: `buildOfferSummary(overrides)`, `buildOfferDetail(overrides)`, `buildDashboardProduct(overrides)` (with `offers`), `buildProductDetail(overrides)` (with `offers`), `buildMultiStoreProduct()`, `buildMultiStoreDetail()`.

- [ ] **Step 1: Write the failing API tests**

`frontend/src/lib/api/offers.test.js` (follow the fetch-mock pattern of `products.test.js`; read that file first and reuse its `mockFetch` helper the same way):

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { add, remove, unlink, update } from './offers';
import { API_URL } from './client';

const okJson = (body) =>
  Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));

describe('offers api', () => {
  afterEach(() => vi.restoreAllMocks());

  it('adds an offer to a product', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockReturnValue(okJson({ id: 5 }));

    await add(1, { url: 'https://a.es/x', currency: 'EUR' });

    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/products/1/offers`,
      expect.objectContaining({ method: 'POST' })
    );
  });

  it('updates, unlinks and removes an offer', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() => okJson({}));

    await update(5, { url: 'https://b.es/x' });
    await unlink(5);
    await remove(5);

    expect(fetchSpy.mock.calls.map(([url, init]) => [url, init.method])).toEqual([
      [`${API_URL}/offers/5`, 'PATCH'],
      [`${API_URL}/offers/5/unlink`, 'POST'],
      [`${API_URL}/offers/5`, 'DELETE']
    ]);
  });
});
```

Add to `products.test.js`:

```js
it('merges a product into another', async () => {
  const fetchSpy = vi
    .spyOn(globalThis, 'fetch')
    .mockReturnValue(Promise.resolve(new Response('{}', { status: 200 })));

  await merge(1, { source_product_id: 2, keep: 'target' });

  expect(fetchSpy).toHaveBeenCalledWith(
    `${API_URL}/products/1/merge`,
    expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ source_product_id: 2, keep: 'target' })
    })
  );
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/lib/api`
Expected: FAIL (`./offers` missing, `merge` not exported).

- [ ] **Step 3: Implement the API functions**

`frontend/src/lib/api/offers.js`:

```js
import { request } from './client';

/**
 * Add a store (offer) to a product.
 * @param {number|string} productId
 * @param {{ url: string, currency: string, store_id?: number }} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The created offer.
 */
export const add = (productId, data, signal) =>
  request(`/products/${productId}/offers`, { method: 'POST', body: data, signal });

/**
 * Change an offer's URL (its store is re-resolved by the backend).
 * @param {number|string} offerId
 * @param {{ url: string }} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The updated offer.
 */
export const update = (offerId, data, signal) =>
  request(`/offers/${offerId}`, { method: 'PATCH', body: data, signal });

/**
 * Move an offer into a new standalone product.
 * @param {number|string} offerId
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The new product.
 */
export const unlink = (offerId, signal) =>
  request(`/offers/${offerId}/unlink`, { method: 'POST', signal });

/**
 * Delete an offer and its price history.
 * @param {number|string} offerId
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const remove = (offerId, signal) =>
  request(`/offers/${offerId}`, { method: 'DELETE', signal });
```

Append to `frontend/src/lib/api/products.js`:

```js
/**
 * Merge another product (and its stores) into product `id`.
 * @param {number|string} id - The product that remains.
 * @param {{ source_product_id: number, keep: 'target'|'source' }} data
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>} The merged product's detail.
 */
export const merge = (id, data, signal) =>
  request(`/products/${id}/merge`, { method: 'POST', body: data, signal });
```

Update the `create` JSDoc: `@param {{ name, priority, category_id, description, offer: { url, currency, store_id? } }} data`. Add `export * as offers from './offers';` to `lib/api/index.js`.

- [ ] **Step 4: Write the failing store tests**

Add to `frontend/src/stores/productsStore.test.js` (it mocks `@/lib/api`; add an `offers` mock object next to the `products` one, following the existing `vi.mock` block):

```js
describe('offer actions', () => {
  it('addOffer refreshes the summary and the product detail', async () => {
    offersApi.add.mockResolvedValue({ id: 9 });
    productsApi.dashboardSummary.mockResolvedValue([]);
    productsApi.get.mockResolvedValue({ id: 1, offers: [] });

    const offer = await useProductsStore
      .getState()
      .addOffer(1, { url: 'https://a.es/x', currency: 'EUR' });

    expect(offer).toEqual({ id: 9 });
    expect(offersApi.add).toHaveBeenCalledWith(1, { url: 'https://a.es/x', currency: 'EUR' });
    expect(productsApi.dashboardSummary).toHaveBeenCalled();
    expect(useProductsStore.getState().details[1].data).toEqual({ id: 1, offers: [] });
  });

  it('merge drops the source detail from the cache', async () => {
    useProductsStore.setState({
      details: { 2: { status: 'success', error: null, data: { id: 2 } } }
    });
    productsApi.merge.mockResolvedValue({ id: 1, offers: [] });
    productsApi.dashboardSummary.mockResolvedValue([]);

    await useProductsStore.getState().merge(1, { source_product_id: 2, keep: 'target' });

    const { details } = useProductsStore.getState();
    expect(details[2]).toBeUndefined();
    expect(details[1].data).toEqual({ id: 1, offers: [] });
  });

  it('unlinkOffer returns the new product', async () => {
    offersApi.unlink.mockResolvedValue({ id: 7 });
    productsApi.dashboardSummary.mockResolvedValue([]);
    productsApi.get.mockResolvedValue({ id: 1, offers: [] });

    await expect(useProductsStore.getState().unlinkOffer(1, 3)).resolves.toEqual({ id: 7 });
  });
});
```

- [ ] **Step 5: Implement the store actions**

In `frontend/src/stores/productsStore.js`, import `offers as offersApi` from `@/lib/api` and add:

```js
  /**
   * Add a store to a product, then refresh the summary and its detail.
   * @param {number|string} productId
   * @param {{ url: string, currency: string, store_id?: number }} data
   * @returns {Promise<object>} The created offer.
   */
  async addOffer(productId, data) {
    const offer = await offersApi.add(productId, data);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
    return offer;
  },

  /**
   * Change an offer's URL, then refresh the summary and the product detail.
   * @param {number|string} productId
   * @param {number|string} offerId
   * @param {{ url: string }} data
   * @returns {Promise<object>} The updated offer.
   */
  async updateOffer(productId, offerId, data) {
    const offer = await offersApi.update(offerId, data);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
    return offer;
  },

  /**
   * Move an offer into a new product, then refresh.
   * @param {number|string} productId - The product the offer leaves.
   * @param {number|string} offerId
   * @returns {Promise<object>} The new product.
   */
  async unlinkOffer(productId, offerId) {
    const product = await offersApi.unlink(offerId);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
    return product;
  },

  /**
   * Delete an offer, then refresh.
   * @param {number|string} productId
   * @param {number|string} offerId
   */
  async removeOffer(productId, offerId) {
    await offersApi.remove(offerId);
    await get().fetchSummary();
    await get()._refreshDetailSilently(productId);
  },

  /**
   * Merge another product into `targetId`. The response is the merged
   * detail, cached directly; the source product's cached detail is dropped.
   * @param {number|string} targetId
   * @param {{ source_product_id: number, keep: 'target'|'source' }} data
   * @returns {Promise<object>} The merged product's detail.
   */
  async merge(targetId, data) {
    const detail = await productsApi.merge(targetId, data);
    set((state) => {
      const details = { ...state.details };
      delete details[data.source_product_id];
      details[targetId] = { status: 'success', error: null, data: detail };
      return { details };
    });
    await get().fetchSummary();
    return detail;
  },
```

- [ ] **Step 6: Update the e2e fixtures and the contract test**

In `frontend/e2e/fixtures/products.js`, add the offer builders and rewrite the product builders:

```js
/**
 * A dashboard offer summary (`OfferSummary`).
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildOfferSummary(overrides = {}) {
  return {
    id: 1,
    url: 'https://example.com/headphones',
    store_id: 1,
    store_name: 'Amazon',
    store_domain: 'amazon.com',
    store_has_favicon: true,
    current_price: 199.99,
    is_in_stock: true,
    last_checked_at: nowSeconds() - 3600,
    ...overrides
  };
}

/**
 * A product-detail offer (`OfferDetail`), with its price history.
 * @param {object} [overrides]
 * @returns {object}
 */
export function buildOfferDetail(overrides = {}) {
  return {
    ...buildOfferSummary(),
    price_history: [
      buildHistoryPoint({ price: 219.99, timestamp: nowSeconds() - 5 * DAY_SECONDS }),
      buildHistoryPoint({ price: 199.99, timestamp: nowSeconds() - 3600 })
    ],
    ...overrides
  };
}

export function buildDashboardProduct(overrides = {}) {
  return {
    id: 1,
    name: 'Wireless Headphones',
    category_id: 1,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    priority: 'High',
    currency: 'USD',
    current_price: 199.99,
    price_change_pct: -5.2,
    is_in_stock: true,
    is_at_lowest: true,
    recent_prices: [219.99, 209.99, 199.99],
    best_offer_id: 1,
    offers: [buildOfferSummary()],
    ...overrides
  };
}

export function buildProductDetail(overrides = {}) {
  return {
    id: 1,
    name: 'Wireless Headphones',
    priority: 'High',
    category_id: 1,
    category_name: 'Electronics',
    category_color: '#3B82F6',
    description: 'Over-ear headphones with active noise cancellation.',
    currency: 'USD',
    offers: [buildOfferDetail()],
    ...overrides
  };
}

/** The same headphones in two stores: Amazon (best, 199.99) and Thomann (209.99). */
export function buildMultiStoreProduct(overrides = {}) {
  return buildDashboardProduct({
    id: 3,
    best_offer_id: 1,
    offers: [
      buildOfferSummary(),
      buildOfferSummary({
        id: 2,
        url: 'https://thomann.de/headphones',
        store_id: 2,
        store_name: 'Thomann',
        store_domain: 'thomann.de',
        current_price: 209.99
      })
    ],
    ...overrides
  });
}

/** Detail of `buildMultiStoreProduct`. */
export function buildMultiStoreDetail(overrides = {}) {
  return buildProductDetail({
    id: 3,
    offers: [
      buildOfferDetail(),
      buildOfferDetail({
        id: 2,
        url: 'https://thomann.de/headphones',
        store_id: 2,
        store_name: 'Thomann',
        store_domain: 'thomann.de',
        current_price: 209.99,
        price_history: [
          buildHistoryPoint({ price: 214.99, timestamp: nowSeconds() - 5 * DAY_SECONDS }),
          buildHistoryPoint({ price: 209.99, timestamp: nowSeconds() - 3600 })
        ]
      })
    ],
    ...overrides
  });
}
```

Then update the rest of the file:
- `buildSinglePointDetail`: `offers: [buildOfferDetail({ current_price: 49.99, last_checked_at: ts, price_history: [buildHistoryPoint({ price: 49.99, timestamp: ts })] })]` instead of the top-level fields.
- Every builder that sets `url`, `store_*`, `last_checked_at` or `price_history` on a product (`buildManyProducts`, `buildLongHistoryDetail` and any other in the file) moves those values into a single `offers: [buildOfferSummary({...})]` (summary) or `offers: [buildOfferDetail({...})]` (detail) with `id` equal to the product id, and sets `best_offer_id` to that id when the product has a price, `null` otherwise.

In `frontend/e2e/fixtures/dailyCheck.js`, rename `total_products` to `total_offers`.

In `frontend/src/lib/contracts.test.js`, import `buildOfferSummary`, `buildOfferDetail` and add:

```js
  it('matches the offer summary fields', () => {
    expect(sortedKeys(buildOfferSummary())).toEqual(
      [...API_FIELDS.OfferSummary].sort()
    );
  });

  it('matches the offer detail fields', () => {
    expect(sortedKeys(buildOfferDetail())).toEqual(
      [...API_FIELDS.OfferDetail].sort()
    );
  });
```

and change the history record test to use `API_FIELDS.OfferHistResponse`.

- [ ] **Step 7: Run the tests**

Run: `cd frontend && npx vitest run src/lib/api src/stores/productsStore.test.js src/lib/contracts.test.js`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api frontend/src/stores frontend/e2e/fixtures frontend/src/lib/contracts.test.js
git commit -m "feat(frontend): add offer API calls, store actions and fixtures"
```

---

### Task 8: Dashboard filters over offers

**Files:**
- Modify: `frontend/src/lib/productFilters.js`
- Test: `frontend/src/lib/productFilters.test.js`

**Interfaces:**
- Consumes: `isProductStale`, `oldestCheckedAt` (Task 6).
- Produces: `filterProducts`, `sortProducts`, `getFilterOptions` accept rows with `offers[]`.

- [ ] **Step 1: Migrate the existing fixtures and write the failing tests**

In `productFilters.test.js`, every product fixture with `store_id`, `store_name` or `last_checked_at` moves them into `offers: [{ id, store_id, store_name, last_checked_at }]`. Add:

```js
describe('multi-store products', () => {
  const now = 100 * 86400;
  const product = {
    id: 1,
    name: 'Drum kit',
    category_id: 1,
    priority: 'High',
    current_price: 600,
    offers: [
      { id: 1, store_id: 10, store_name: 'Thomann', last_checked_at: now - 3600 },
      { id: 2, store_id: 20, store_name: 'Amazon', last_checked_at: now - 5 * 86400 }
    ]
  };

  it('matches the store filter on any offer', () => {
    const filters = { ...DEFAULT_FILTERS, stores: [20] };
    expect(filterProducts([product], filters, now)).toEqual([product]);
  });

  it('matches the search on any store name', () => {
    const filters = { ...DEFAULT_FILTERS, query: 'amazon' };
    expect(filterProducts([product], filters, now)).toEqual([product]);
  });

  it('is outdated when any store is outdated', () => {
    const filters = { ...DEFAULT_FILTERS, stale: true };
    expect(filterProducts([product], filters, now)).toEqual([product]);
  });

  it('sorts by the oldest check among stores', () => {
    const recent = {
      ...product,
      id: 2,
      name: 'Amp',
      offers: [{ id: 3, store_id: 10, store_name: 'Thomann', last_checked_at: now - 60 }]
    };
    expect(sortProducts([product, recent], 'checked_desc').map((p) => p.id)).toEqual([2, 1]);
  });

  it('offers every store of every product as a filter option', () => {
    expect(getFilterOptions([product]).stores).toEqual([
      { id: 20, name: 'Amazon' },
      { id: 10, name: 'Thomann' }
    ]);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/lib/productFilters.test.js`
Expected: FAIL (the filters still read `product.store_id`).

- [ ] **Step 3: Update the filters**

In `frontend/src/lib/productFilters.js`:
- Import `isProductStale, nowInSeconds, oldestCheckedAt` from `./staleness`.
- Typedef: `query` searches "product and store names"; `stores` matches "any of the product's stores".
- In `filterProducts`:

```js
    const offers = product.offers ?? [];
    if (
      query &&
      !normalizeText(product.name).includes(query) &&
      !offers.some((offer) => normalizeText(offer.store_name).includes(query))
    ) {
      return false;
    }
    if (
      filters.stores.length > 0 &&
      !offers.some((offer) => filters.stores.includes(offer.store_id))
    ) {
      return false;
    }
```

  and `if (filters.stale && !isProductStale(product, now)) return false;`.
- In `COMPARATORS`: `checked_desc: (a, b) => compareNullable(oldestCheckedAt(a.offers), oldestCheckedAt(b.offers), -1)`.
- `sortProducts` JSDoc: drop "so the same product tracked in several stores stays grouped together" (ties are broken by name).
- In `getFilterOptions`, loop `for (const offer of product.offers ?? [])` and read `offer.store_id` / `offer.store_name`.

- [ ] **Step 4: Run the tests**

Run: `cd frontend && npx vitest run src/lib/productFilters.test.js src/hooks/useDashboardFilters.test.jsx`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/productFilters.js frontend/src/lib/productFilters.test.js
git commit -m "feat(frontend): filter and sort dashboard products across their stores"
```

---

### Task 9: Dashboard rows show the best store, the extra stores and stale stores

**Files:**
- Create: `frontend/src/components/dashboard/OfferStores.jsx`, `frontend/src/components/dashboard/OfferStores.test.jsx`
- Modify: `frontend/src/components/dashboard/index.js`, `ProductTable.jsx`, `ProductCardList.jsx`, `ProductRowActions.jsx` and their tests
- Modify: `frontend/src/components/common/StaleBadge.jsx`, `StaleBadge.test.jsx`
- Modify: `frontend/src/i18n/english.json`, `frontend/src/i18n/spanish.json`

**Interfaces:**
- Consumes: `findBestOfferSummary`, `staleOffers`, `oldestCheckedAt`.
- Produces: `<OfferStores product locale />`; `<StaleBadge lastCheckedAt storeNames? />`.

- [ ] **Step 1: Add the strings**

`english.json`, under `pages.dashboard`:

```json
"offers": {
  "moreStores_one": "+{{count}} store",
  "moreStores_other": "+{{count}} stores",
  "moreStoresShort": "+{{count}}",
  "bestPrice": "Best price",
  "notChecked": "Not checked yet"
}
```

and under `common.status`: `"staleStores": "Not updated in: {{stores}}."`.

`spanish.json`, same keys:

```json
"offers": {
  "moreStores_one": "+{{count}} tienda",
  "moreStores_other": "+{{count}} tiendas",
  "moreStoresShort": "+{{count}}",
  "bestPrice": "Mejor precio",
  "notChecked": "Sin revisar todavía"
}
```

and `"staleStores": "Sin actualizar en: {{stores}}."`.

Update `pages.dashboard.dailyCheck` in English to say "prices" instead of "products" (`"Gemini limit reached at {{time}} with {{count}} price left to check today."` / `..._other` "prices", `"allChecked": "Gemini limit reached at {{time}}; all prices were checked by retrying."`) and the Spanish equivalents with "precio(s)". Update `DailyCheckNotice.test.jsx` expectations to match.

- [ ] **Step 2: Write the failing component tests**

`frontend/src/components/dashboard/OfferStores.test.jsx` (use `renderWithProviders` from `@/test/renderWithProviders`, as the other component tests do):

```jsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import {
  buildDashboardProduct,
  buildMultiStoreProduct
} from '../../../e2e/fixtures/products';
import { OfferStores } from './OfferStores';

describe('OfferStores', () => {
  it('shows only the store for a single-store product', () => {
    renderWithProviders(<OfferStores product={buildDashboardProduct()} locale="en-US" />);

    expect(screen.getByText('Amazon')).toBeInTheDocument();
    expect(screen.queryByText('+1')).not.toBeInTheDocument();
  });

  it('shows the best store and a chip listing every store', async () => {
    renderWithProviders(
      <OfferStores
        product={buildMultiStoreProduct({ best_offer_id: 2 })}
        locale="en-US"
      />
    );

    expect(screen.getByText('Thomann')).toBeInTheDocument();
    const chip = screen.getByRole('button', { name: '+1 store' });
    await userEvent.hover(chip);

    const tooltip = await screen.findByRole('tooltip');
    expect(tooltip).toHaveTextContent('Amazon');
    expect(tooltip).toHaveTextContent('$199.99');
    expect(tooltip).toHaveTextContent('Best price');
  });
});
```

In `ProductRowActions.test.jsx`, add a test that "Open store page" opens the best offer's URL:

```jsx
it('opens the best offer in the store', async () => {
  const open = vi.spyOn(window, 'open').mockReturnValue(null);
  renderWithProviders(
    <ProductRowActions
      product={buildMultiStoreProduct({ best_offer_id: 2 })}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
    />
  );

  await userEvent.click(screen.getByRole('button', { name: /actions/i }));
  await userEvent.click(await screen.findByRole('menuitem', { name: /store page/i }));

  expect(open).toHaveBeenCalledWith('https://thomann.de/headphones', '_blank', 'noopener,noreferrer');
});
```

In `StaleBadge.test.jsx`, add:

```jsx
it('names the stale stores in the tooltip', async () => {
  const now = 100 * 86400;
  renderWithProviders(
    <StaleBadge lastCheckedAt={now - 4 * 86400} storeNames={['Amazon']} now={now} />
  );

  await userEvent.hover(screen.getByText(/4/));

  expect(await screen.findByRole('tooltip')).toHaveTextContent('Not updated in: Amazon.');
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard src/components/common/StaleBadge.test.jsx`
Expected: FAIL (`./OfferStores` missing, the badge has no `storeNames`, the actions still open `product.url`).

- [ ] **Step 4: Implement `OfferStores`**

`frontend/src/components/dashboard/OfferStores.jsx`:

```jsx
import { Badge, HStack, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { StoreBadge } from '@/components/common';
import { Tooltip } from '@/components/ui/tooltip';
import { findBestOfferSummary } from '@/lib/bestOffer';
import { formatPrice } from '@/lib/format';

/**
 * A dashboard product's stores: the best offer's store badge and, when the
 * product is tracked in more stores, a "+N" chip whose tooltip lists every
 * store with its price and stock (the best one marked). The chip is
 * focusable, so the list is reachable from the keyboard too.
 *
 * @param {object} props
 * @param {{ best_offer_id: number|null, currency: string, offers: object[] }} props.product
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 */
export const OfferStores = ({ product, locale }) => {
  const { t } = useTranslation();
  const best = findBestOfferSummary(product);
  const extraCount = product.offers.length - 1;

  if (!best) return null;

  return (
    <HStack gap={1.5} minW={0}>
      <StoreBadge
        storeId={best.store_id}
        name={best.store_name}
        hasFavicon={best.store_has_favicon}
      />
      {extraCount > 0 && (
        <Tooltip
          showArrow
          content={
            <VStack align="stretch" gap={1}>
              {product.offers.map((offer) => (
                <HStack key={offer.id} justify="space-between" gap={4}>
                  <Text>{offer.store_name}</Text>
                  <Text textStyle="numeric">
                    {offer.current_price === null
                      ? t('pages.dashboard.offers.notChecked')
                      : formatPrice(offer.current_price, product.currency, locale)}
                    {offer.is_in_stock === false &&
                      ` · ${t('common.status.outOfStock')}`}
                    {offer.id === product.best_offer_id &&
                      ` · ${t('pages.dashboard.offers.bestPrice')}`}
                  </Text>
                </HStack>
              ))}
            </VStack>
          }
        >
          <Badge
            as="button"
            type="button"
            variant="subtle"
            size="sm"
            aria-label={t('pages.dashboard.offers.moreStores', { count: extraCount })}
            onClick={(event) => event.stopPropagation()}
          >
            {t('pages.dashboard.offers.moreStoresShort', { count: extraCount })}
          </Badge>
        </Tooltip>
      )}
    </HStack>
  );
};
```

Export it from `components/dashboard/index.js`.

- [ ] **Step 5: Let `StaleBadge` name the stores**

In `StaleBadge.jsx`, add a `storeNames` prop (`@param {string[]} [props.storeNames] - Stale stores, listed in the tooltip for multi-store products.`) and build the tooltip content:

```jsx
  const hint = t('common.status.staleHint');
  const content =
    storeNames && storeNames.length > 0
      ? `${t('common.status.staleStores', { stores: storeNames.join(', ') })} ${hint}`
      : hint;
```

and pass `content={content}` to the `Tooltip`.

- [ ] **Step 6: Wire the rows**

In `ProductTable.jsx` and `ProductCardList.jsx`:
- Import `OfferStores` and `findBestOfferSummary`, `staleOffers`, `oldestCheckedAt`.
- Inside the row component: `const best = findBestOfferSummary(product); const stale = staleOffers(product);`.
- The favicon next to the name uses `best?.store_id` / `best?.store_has_favicon`.
- Replace the `product.store_name` text with `<OfferStores product={product} locale={locale} />`.
- Replace the `StaleBadge` with:

```jsx
<StaleBadge
  lastCheckedAt={oldestCheckedAt(stale)}
  storeNames={product.offers.length > 1 ? stale.map((offer) => offer.store_name) : undefined}
/>
```

`ProductCardList` must receive `locale` if it does not already.

In `ProductRowActions.jsx`, import `findBestOfferSummary`, compute `const bestUrl = findBestOfferSummary(product)?.url;`, render the "storePage" item only when `bestUrl` is set, and open `bestUrl`. Update the JSDoc `product` shape to `{ id, name, best_offer_id, offers }`.

Update the existing `ProductTable.test.jsx`, `ProductCardList.test.jsx`, `ProductRowActions*.test.jsx`, `DashboardPage.*.test.jsx` and `idleStatus.test.jsx` fixtures to use `buildDashboardProduct` (already offer-shaped) or `offers: [...]`.

- [ ] **Step 7: Run the frontend suite**

Run: `cd frontend && npm test`
Expected: all pass except `src/pages/ProductPage*.test.jsx` and `src/components/product/*` (Tasks 10–11) and `ProductFormDialog.test.jsx` (Task 14). Every other file passes.

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): show the best store and the other stores on the dashboard"
```

---

### Task 10: Product page stores list, stats and stale notices

**Files:**
- Create: `frontend/src/components/product/OfferList.jsx`, `OfferList.test.jsx`
- Create: `frontend/src/components/product/EditOfferDialog.jsx`, `EditOfferDialog.test.jsx`
- Modify: `frontend/src/components/product/index.js`, `ProductStatsRow.jsx`, `ProductStatsRow.test.jsx`, `StaleProductNotice.jsx`, `StaleProductNotice.test.jsx`
- Modify: `frontend/src/pages/ProductPage.jsx`, `ProductPage.test.jsx`, `ProductPage.delete.test.jsx`, `ProductPage.edit.test.jsx`
- Modify: i18n files

**Interfaces:**
- Consumes: `selectBestOffer`, `computeProductOfferStats`, `computeLowestAcrossOffers` (Task 6); store actions `updateOffer`, `unlinkOffer`, `removeOffer` (Task 7).
- Produces: `<OfferList offers currency bestOfferId locale onEdit(offer, triggerEl) onUnlink(offer) onRemove(offer, triggerEl) />`; `<EditOfferDialog open onClose productId offer />`; `ProductStatsRow` props `currentStoreName?`, `lowestStoreName?`; `StaleProductNotice` prop `storeName?`.

- [ ] **Step 1: Add the strings**

English, under `pages.product`:

```json
"offers": {
  "title": "Stores",
  "addStore": "Add store",
  "bestPrice": "Best price",
  "notChecked": "Not checked yet",
  "lastChecked": "Checked {{time}}",
  "rowActions": "Actions for {{store}}",
  "open": "Open in store",
  "editUrl": "Edit URL",
  "unlink": "Unlink as a separate product",
  "remove": "Remove store",
  "onlyStoreHint": "A product needs at least one store."
},
"stats": {
  "atStore": "at {{store}}"
},
"stale": {
  "titleStore_one": "{{store}}: price not updated for {{count}} day",
  "titleStore_other": "{{store}}: price not updated for {{count}} days"
}
```

(Merge `stats.atStore` and `stale.titleStore_*` into the existing `stats` and `stale` objects.) Under `components`:

```json
"editOfferDialog": {
  "title": "Edit store URL",
  "urlLabel": "Store URL",
  "urlInvalid": "Enter a valid http(s) URL.",
  "submit": "Save"
},
"removeOfferDialog": {
  "title": "Remove store",
  "description": "Remove <strong>{{store}}</strong> and its price history from this product?"
}
```

Under `toasts`:

```json
"offers": {
  "updateSuccess": "Store URL updated",
  "unlinkSuccess": "{{store}} is now a separate product",
  "unlinkAction": "Open",
  "removeSuccess": "{{store}} removed",
  "error": "Something went wrong. Please try again.",
  "duplicateUrl": "This store URL is already tracked for this product."
}
```

Spanish equivalents: "Tiendas", "Añadir tienda", "Mejor precio", "Sin revisar todavía", "Revisado {{time}}", "Acciones de {{store}}", "Abrir en la tienda", "Editar URL", "Separar como otro producto", "Quitar tienda", "Un producto necesita al menos una tienda.", "en {{store}}", "{{store}}: precio sin actualizar desde hace {{count}} día"/"días", "Editar URL de la tienda", "URL de la tienda", "Introduce una URL http(s) válida.", "Guardar", "Quitar tienda", "¿Quitar <strong>{{store}}</strong> y su historial de precios de este producto?", "URL de la tienda actualizada", "{{store}} ahora es un producto aparte", "Abrir", "{{store}} quitada", "Algo ha ido mal. Inténtalo de nuevo.", "Esta URL ya se sigue en este producto.".

- [ ] **Step 2: Write the failing `OfferList` tests**

`frontend/src/components/product/OfferList.test.jsx`:

```jsx
import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { buildMultiStoreDetail, buildOfferDetail } from '../../../e2e/fixtures/products';
import { OfferList } from './OfferList';

const renderList = (props = {}) => {
  const detail = buildMultiStoreDetail();
  const handlers = { onEdit: vi.fn(), onUnlink: vi.fn(), onRemove: vi.fn() };
  renderWithProviders(
    <OfferList
      offers={detail.offers}
      currency="USD"
      bestOfferId={1}
      locale="en-US"
      {...handlers}
      {...props}
    />
  );
  return handlers;
};

describe('OfferList', () => {
  it('lists every store with its price and marks the best one', () => {
    renderList();

    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText('Amazon')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Best price')).toBeInTheDocument();
    expect(within(rows[1]).getByText('$209.99')).toBeInTheDocument();
  });

  it('shows "Not checked yet" for a store without history', () => {
    renderList({
      offers: [
        buildOfferDetail(),
        buildOfferDetail({ id: 2, store_name: 'Thomann', current_price: null, is_in_stock: null, last_checked_at: null, price_history: [] })
      ]
    });

    expect(screen.getByText('Not checked yet')).toBeInTheDocument();
  });

  it('calls the handlers from the row menu', async () => {
    const { onUnlink } = renderList();

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Thomann' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Unlink/ }));

    expect(onUnlink).toHaveBeenCalledWith(expect.objectContaining({ id: 2 }));
  });

  it('disables unlink and remove on the only store', async () => {
    renderList({ offers: [buildOfferDetail()] });

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Amazon' }));

    expect(await screen.findByRole('menuitem', { name: /Unlink/ })).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByRole('menuitem', { name: /Remove store/ })).toHaveAttribute('aria-disabled', 'true');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/product/OfferList.test.jsx`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement `OfferList`**

`frontend/src/components/product/OfferList.jsx`:

```jsx
import { useRef } from 'react';
import {
  Badge,
  Box,
  Card,
  Heading,
  HStack,
  Icon,
  IconButton,
  List,
  Menu,
  Portal,
  Text,
  VStack
} from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { LuEllipsis, LuExternalLink, LuPencil, LuSplit, LuTrash2 } from 'react-icons/lu';
import { StockStatus, StoreBadge } from '@/components/common';
import { formatPrice, formatRelative } from '@/lib/format';

const OfferRow = ({ offer, currency, isBest, isOnly, locale, onEdit, onUnlink, onRemove }) => {
  const { t } = useTranslation();
  const triggerRef = useRef(null);

  return (
    <List.Item
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      gap={4}
      py={3}
      borderBottomWidth="1px"
      _last={{ borderBottomWidth: 0 }}
    >
      <VStack align="flex-start" gap={1} minW={0}>
        <HStack gap={2} wrap="wrap">
          <StoreBadge
            storeId={offer.store_id}
            name={offer.store_name}
            hasFavicon={offer.store_has_favicon}
            size="md"
          />
          {isBest && (
            <Badge colorPalette="green" variant="subtle">
              {t('pages.product.offers.bestPrice')}
            </Badge>
          )}
        </HStack>
        <Text textStyle="caption" color="fg.muted">
          {offer.last_checked_at
            ? t('pages.product.offers.lastChecked', {
                time: formatRelative(offer.last_checked_at, locale)
              })
            : t('pages.product.offers.notChecked')}
        </Text>
      </VStack>
      <HStack gap={4}>
        <VStack align="flex-end" gap={0.5}>
          <Text textStyle="numeric" fontWeight="semibold">
            {offer.current_price === null
              ? '-'
              : formatPrice(offer.current_price, currency, locale)}
          </Text>
          {offer.is_in_stock !== null && <StockStatus inStock={offer.is_in_stock} />}
        </VStack>
        <Menu.Root positioning={{ placement: 'bottom-end' }}>
          <Menu.Trigger asChild>
            <IconButton
              ref={triggerRef}
              variant="ghost"
              size="sm"
              aria-label={t('pages.product.offers.rowActions', { store: offer.store_name })}
            >
              <Icon as={LuEllipsis} />
            </IconButton>
          </Menu.Trigger>
          <Portal>
            <Menu.Positioner>
              <Menu.Content>
                <Menu.Item
                  value="open"
                  onSelect={() => window.open(offer.url, '_blank', 'noopener,noreferrer')}
                >
                  <Icon as={LuExternalLink} />
                  {t('pages.product.offers.open')}
                </Menu.Item>
                <Menu.Item value="edit" onSelect={() => onEdit(offer, triggerRef.current)}>
                  <Icon as={LuPencil} />
                  {t('pages.product.offers.editUrl')}
                </Menu.Item>
                <Menu.Item value="unlink" disabled={isOnly} onSelect={() => onUnlink(offer)}>
                  <Icon as={LuSplit} />
                  {t('pages.product.offers.unlink')}
                </Menu.Item>
                <Menu.Separator />
                <Menu.Item
                  value="remove"
                  disabled={isOnly}
                  onSelect={() => onRemove(offer, triggerRef.current)}
                >
                  <Icon as={LuTrash2} />
                  {t('pages.product.offers.remove')}
                </Menu.Item>
                {isOnly && (
                  <Box px={2} py={1}>
                    <Text textStyle="caption" color="fg.muted">
                      {t('pages.product.offers.onlyStoreHint')}
                    </Text>
                  </Box>
                )}
              </Menu.Content>
            </Menu.Positioner>
          </Portal>
        </Menu.Root>
      </HStack>
    </List.Item>
  );
};

/**
 * The product page's "Stores" card: one row per offer with its store,
 * price, stock, last check and a "Best price" marker, plus a menu to open
 * the store page, edit the URL, unlink the store into its own product or
 * remove it. Unlink and remove are disabled on a product's only store.
 *
 * @param {object} props
 * @param {object[]} props.offers - `OfferDetail` records.
 * @param {string} props.currency
 * @param {number|null} props.bestOfferId
 * @param {string} props.locale
 * @param {(offer: object, triggerEl: HTMLElement|null) => void} props.onEdit
 * @param {(offer: object) => void} props.onUnlink
 * @param {(offer: object, triggerEl: HTMLElement|null) => void} props.onRemove
 * @param {import('react').ReactNode} [props.actions] - Rendered in the card header (e.g. "Add store").
 */
export const OfferList = ({
  offers,
  currency,
  bestOfferId,
  locale,
  onEdit,
  onUnlink,
  onRemove,
  actions
}) => {
  const { t } = useTranslation();

  return (
    <Card.Root>
      <Card.Body>
        <HStack justify="space-between" mb={2}>
          <Heading textStyle="heading.sm">{t('pages.product.offers.title')}</Heading>
          {actions}
        </HStack>
        <List.Root variant="plain">
          {offers.map((offer) => (
            <OfferRow
              key={offer.id}
              offer={offer}
              currency={currency}
              isBest={offer.id === bestOfferId}
              isOnly={offers.length === 1}
              locale={locale}
              onEdit={onEdit}
              onUnlink={onUnlink}
              onRemove={onRemove}
            />
          ))}
        </List.Root>
      </Card.Body>
    </Card.Root>
  );
};
```

If `LuSplit` is not exported by the installed `react-icons` version (check with `grep -c "LuSplit\b" frontend/node_modules/react-icons/lu/index.d.ts`), use `LuUnlink` instead.

- [ ] **Step 5: Implement `EditOfferDialog` with a test**

`frontend/src/components/product/EditOfferDialog.test.jsx`:

```jsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useProductsStore } from '@/stores/productsStore';
import { buildOfferDetail } from '../../../e2e/fixtures/products';
import { EditOfferDialog } from './EditOfferDialog';

describe('EditOfferDialog', () => {
  beforeEach(() => {
    useProductsStore.setState({ updateOffer: vi.fn().mockResolvedValue({}) });
  });

  it('saves the new URL', async () => {
    const onClose = vi.fn();
    renderWithProviders(
      <EditOfferDialog open onClose={onClose} productId={1} offer={buildOfferDetail()} />
    );

    const input = screen.getByLabelText(/Store URL/);
    await userEvent.clear(input);
    await userEvent.type(input, 'https://example.com/new');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(useProductsStore.getState().updateOffer).toHaveBeenCalledWith(1, 1, {
      url: 'https://example.com/new'
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('rejects an invalid URL', async () => {
    renderWithProviders(
      <EditOfferDialog open onClose={vi.fn()} productId={1} offer={buildOfferDetail()} />
    );

    const input = screen.getByLabelText(/Store URL/);
    await userEvent.clear(input);
    await userEvent.type(input, 'not a url');
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(screen.getByText('Enter a valid http(s) URL.')).toBeInTheDocument();
    expect(useProductsStore.getState().updateOffer).not.toHaveBeenCalled();
  });
});
```

`frontend/src/components/product/EditOfferDialog.jsx`:

```jsx
import { useState } from 'react';
import { Button, Flex, Input } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { toaster } from '@/components/ui/toaster';
import { isValidProductUrl } from '@/lib/web_utils';
import { useProductsStore } from '@/stores/productsStore';

/**
 * Small dialog to change one offer's URL (the backend re-resolves its store).
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {number|string} props.productId
 * @param {{ id: number, url: string }|null} props.offer
 * @param {() => (HTMLElement|null|undefined)} [props.finalFocusEl]
 */
export const EditOfferDialog = ({ open, onClose, productId, offer, finalFocusEl }) => {
  const { t } = useTranslation();
  const updateOffer = useProductsStore((state) => state.updateOffer);
  const [url, setUrl] = useState(offer?.url ?? '');
  const [error, setError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [syncedOfferId, setSyncedOfferId] = useState(offer?.id ?? null);

  // Reset when another offer is edited (render-time sync, as in ProductFormDialog).
  if (offer && offer.id !== syncedOfferId) {
    setSyncedOfferId(offer.id);
    setUrl(offer.url);
    setError(null);
  }

  const handleSubmit = async () => {
    const trimmed = url.trim();
    if (!isValidProductUrl(trimmed)) {
      setError(t('components.editOfferDialog.urlInvalid'));
      return;
    }
    setIsSubmitting(true);
    try {
      await updateOffer(productId, offer.id, { url: trimmed });
      toaster.create({ title: t('toasts.offers.updateSuccess'), type: 'success' });
      onClose();
    } catch (err) {
      toaster.create({
        title: t(err?.status === 409 ? 'toasts.offers.duplicateUrl' : 'toasts.offers.error'),
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      finalFocusEl={finalFocusEl}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('components.editOfferDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <Field
            label={t('components.editOfferDialog.urlLabel')}
            errorText={error}
            invalid={Boolean(error)}
            required
          >
            <Input
              value={url}
              onChange={(e) => {
                setUrl(e.target.value);
                setError(null);
              }}
              disabled={isSubmitting}
              autoComplete="off"
            />
          </Field>
        </DialogBody>
        <DialogFooter>
          <Flex gap={2} justify="flex-end" width="full">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} loading={isSubmitting}>
              {t('components.editOfferDialog.submit')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
```

Move `isValidProductUrl` from `ProductFormDialog.jsx` into `frontend/src/lib/web_utils.js` as a named export (same body, with a JSDoc line "Whether `value` parses as an absolute `http(s)` URL."), add a test for it in `web_utils.test.js` (`'https://a.es/x'` → true, `'ftp://a.es'` → false, `''` → false), and import it in `ProductFormDialog.jsx`.

Export `OfferList` and `EditOfferDialog` from `components/product/index.js`.

- [ ] **Step 6: Store names in the stats row and the stale notice**

`ProductStatsRow.jsx`: add props `currentStoreName` and `lowestStoreName` (both optional strings). Under the current price value render `{currentStoreName && <Text textStyle="caption" color="fg.subtle">{t('pages.product.stats.atStore', { store: currentStoreName })}</Text>}`; in the lowest stat, when `lowestStoreName` is set, render the caption as `` `${t('pages.product.stats.atStore', { store: lowestStoreName })} · ${t('pages.product.stats.lowestReachedOn', {...})}` ``. Add a test that both captions appear when the props are given and are absent otherwise.

`StaleProductNotice.jsx`: add an optional `storeName` prop; the title becomes `storeName ? t('pages.product.stale.titleStore', { store: storeName, count: days }) : t('pages.product.stale.title', { count: days })`. Add a test for the store title.

- [ ] **Step 7: Rewrite the product page around offers**

In `frontend/src/pages/ProductPage.jsx`:

1. Imports: `OfferList`, `EditOfferDialog` from `@/components/product`; `computeLowestAcrossOffers`, `computeProductOfferStats`, `selectBestOffer` from `@/lib/bestOffer`; `staleOffers` from `@/lib/staleness`.
2. Store actions: `unlinkOffer`, `removeOffer`.
3. Replace the single-history memos with:

```jsx
  const offers = useMemo(() => product?.offers ?? [], [product]);
  const bestOfferId = useMemo(() => selectBestOffer(offers), [offers]);
  const bestOffer = offers.find((offer) => offer.id === bestOfferId) ?? offers[0] ?? null;
  const productStock = useMemo(
    () => computeProductOfferStats(offers, range).isInStock,
    [offers, range]
  );
  const rawHistory = useMemo(() => bestOffer?.price_history ?? [], [bestOffer]);
  const filteredHistory = useMemo(
    () => filterPriceHistoryByRange(rawHistory, range),
    [rawHistory, range]
  );
  const currentRecord = useMemo(() => getCurrentRecord(rawHistory), [rawHistory]);
  const { average, currentVsAverage } = useMemo(
    () => computeRangeStats(filteredHistory, currentRecord),
    [filteredHistory, currentRecord]
  );
  const lowest = useMemo(
    () => computeLowestAcrossOffers(offers, range),
    [offers, range]
  );
  const isMultiStore = offers.length > 1;
  const storeNameOf = (offerId) =>
    offers.find((offer) => offer.id === offerId)?.store_name ?? null;
```

   The chart memos (`chartPoints`, `yDomain`, `outOfStockBands`, `hasEnoughHistory`, `trackingStartDate`) stay on `bestOffer` in this task; Task 11 switches them to all offers.
4. Header "Open in store" button: `href={bestOffer?.url}` and `store: bestOffer?.store_name`; render it only when `bestOffer` exists.
5. Metadata row: remove the `StoreBadge` and the last-checked text; `StockStatus inStock={productStock}`.
6. Stale notices: replace the single notice with

```jsx
          {staleOffers(product).map((offer) => (
            <StaleProductNotice
              key={offer.id}
              lastCheckedAt={offer.last_checked_at}
              url={offer.url}
              storeName={isMultiStore ? offer.store_name : undefined}
              locale={locale}
            />
          ))}
```

7. `ProductStatsRow`: `currentPrice={currentRecord?.price ?? null}`, `currentStoreName={isMultiStore ? bestOffer?.store_name : undefined}`, `lowestStoreName={isMultiStore && lowest ? storeNameOf(lowest.offerId) : undefined}`.
8. After the stats `VStack` (before the chart), render:

```jsx
        <OfferList
          offers={offers}
          currency={product.currency}
          bestOfferId={bestOfferId}
          locale={locale}
          onEdit={(offer, triggerEl) => {
            offerMenuTriggerRef.current = triggerEl;
            setEditingOffer(offer);
          }}
          onUnlink={handleUnlink}
          onRemove={(offer, triggerEl) => {
            offerMenuTriggerRef.current = triggerEl;
            setRemovingOffer(offer);
          }}
        />
```

   with state `const [editingOffer, setEditingOffer] = useState(null); const [removingOffer, setRemovingOffer] = useState(null); const [isRemovingOffer, setIsRemovingOffer] = useState(false); const offerMenuTriggerRef = useRef(null);` and handlers:

```jsx
  const handleUnlink = async (offer) => {
    try {
      const created = await unlinkOffer(product.id, offer.id);
      toaster.create({
        title: t('toasts.offers.unlinkSuccess', { store: offer.store_name }),
        type: 'success',
        action: {
          label: t('toasts.offers.unlinkAction'),
          onClick: () => navigate(`/product/${created.id}`)
        }
      });
    } catch {
      toaster.create({ title: t('toasts.offers.error'), type: 'error' });
    }
  };

  const handleRemoveOfferConfirm = async () => {
    setIsRemovingOffer(true);
    try {
      await removeOffer(product.id, removingOffer.id);
      toaster.create({
        title: t('toasts.offers.removeSuccess', { store: removingOffer.store_name }),
        type: 'success'
      });
      setRemovingOffer(null);
    } catch {
      toaster.create({ title: t('toasts.offers.error'), type: 'error' });
    } finally {
      setIsRemovingOffer(false);
    }
  };
```

   Render `<EditOfferDialog open={editingOffer !== null} onClose={() => setEditingOffer(null)} productId={product.id} offer={editingOffer} finalFocusEl={() => offerMenuTriggerRef.current} />` and a second `ConfirmDialog` for `removingOffer` (title `components.removeOfferDialog.title`, body via `Trans` with `components.removeOfferDialog.description` and `values={{ store: removingOffer?.store_name }}`, `destructive`, `isLoading={isRemovingOffer}`, `finalFocusEl={() => offerMenuTriggerRef.current}`).

Update `ProductPage.test.jsx`, `ProductPage.delete.test.jsx` and `ProductPage.edit.test.jsx` to use `buildProductDetail` (offer-shaped). Add to `ProductPage.test.jsx`:

```jsx
it('lists both stores and values the product by the best one', async () => {
  mockDetail(buildMultiStoreDetail());   // use the file's existing helper that seeds productsApi.get
  renderProductPage(3);                   // the file's existing render helper

  expect(await screen.findByRole('heading', { name: 'Stores' })).toBeInTheDocument();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByText('at Amazon')).toBeInTheDocument();
});
```

(Replace `mockDetail`/`renderProductPage` with the helpers the file already defines for loading a detail and rendering the page at `/product/:id`.)

- [ ] **Step 8: Run the tests**

Run: `cd frontend && npx vitest run src/components/product src/pages/ProductPage.test.jsx src/pages/ProductPage.delete.test.jsx src/pages/ProductPage.edit.test.jsx src/lib/web_utils.test.js`
Expected: all pass (the chart still plots the best offer only).

- [ ] **Step 9: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): list a product's stores on its page"
```

---

### Task 11: One chart line per store

**Files:**
- Create: `frontend/src/lib/offerChart.js`, `frontend/src/lib/offerChart.test.js`
- Modify: `frontend/src/lib/productHistory.js`, `productHistory.test.js` (remove `computeOutOfStockBands`)
- Modify: `frontend/src/components/product/PriceHistoryChart.jsx`, `PriceHistoryChart.test.jsx`
- Modify: `frontend/src/pages/ProductPage.jsx`
- Modify: i18n files

**Interfaces:**
- Consumes: `filterPriceHistoryByRange`, `buildChartPoints`, `computeYDomain`, `hasEnoughHistory` from `productHistory.js`.
- Produces: `SERIES_COLORS: string[]`, `buildOfferSeries(offers, range, now?) -> Series[]` with `Series = { offerId, storeName, storeId, hasFavicon, color, points: Array<{timestamp, price, isInStock, changePercent, inStockPrice, outOfStockPrice}> }`; `seriesYDomain(series)`; `PriceHistoryChart` prop `series` replaces `chartPoints` and `outOfStockBands`.

- [ ] **Step 1: Write the failing series tests**

`frontend/src/lib/offerChart.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { buildOfferSeries, SERIES_COLORS, seriesYDomain } from './offerChart';
import { RANGE_ALL } from './productHistory';

const record = (price, isInStock, timestamp) => ({ price, is_in_stock: isInStock, timestamp });

describe('buildOfferSeries', () => {
  it('builds one colored series per offer', () => {
    const series = buildOfferSeries(
      [
        { id: 1, store_name: 'Amazon', store_id: 1, store_has_favicon: true, price_history: [record(10, true, 1)] },
        { id: 2, store_name: 'Thomann', store_id: 2, store_has_favicon: false, price_history: [record(12, true, 1)] }
      ],
      RANGE_ALL
    );

    expect(series.map((s) => [s.offerId, s.storeName, s.color])).toEqual([
      [1, 'Amazon', SERIES_COLORS[0]],
      [2, 'Thomann', SERIES_COLORS[1]]
    ]);
  });

  it('splits in-stock and out-of-stock steps so both segments connect', () => {
    const [series] = buildOfferSeries(
      [
        {
          id: 1,
          store_name: 'Amazon',
          price_history: [record(10, true, 1), record(11, false, 2), record(12, true, 3)]
        }
      ],
      RANGE_ALL
    );

    expect(series.points.map((p) => [p.inStockPrice, p.outOfStockPrice])).toEqual([
      [10, null],
      [11, 11],
      [12, 12]
    ]);
  });

  it('computes one Y domain over every series', () => {
    const series = buildOfferSeries(
      [
        { id: 1, price_history: [record(100, true, 1)] },
        { id: 2, price_history: [record(200, true, 1)] }
      ],
      RANGE_ALL
    );

    expect(seriesYDomain(series)).toEqual([90, 210]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/lib/offerChart.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `offerChart.js`**

```js
/**
 * Chart data for a product tracked in several stores: one stepped series
 * per offer. Out-of-stock periods are drawn as a dashed stretch of the same
 * line, so each point carries `inStockPrice` (solid line) and
 * `outOfStockPrice` (dashed line). A step (`stepAfter`) from point i to i+1
 * shows point i's state, so a point also carries the value of the line the
 * previous point belongs to; that way both lines reach every transition.
 */

import { buildChartPoints, computeYDomain, filterPriceHistoryByRange } from './productHistory';

/** Line colors, in offer order (Chakra color tokens as CSS variables). */
export const SERIES_COLORS = [
  'var(--chakra-colors-fg)',
  'var(--chakra-colors-blue-500)',
  'var(--chakra-colors-orange-500)',
  'var(--chakra-colors-green-500)',
  'var(--chakra-colors-purple-500)',
  'var(--chakra-colors-pink-500)'
];

/**
 * @param {Array<{ id: number, store_name?: string|null, store_id?: number|null, store_has_favicon?: boolean, price_history: object[] }>} offers
 * @param {string} range - A `RANGE_OPTIONS` value or `RANGE_ALL`.
 * @param {number} [now] - Seconds since epoch.
 * @returns {Array<object>} One series per offer, in offer order.
 */
export function buildOfferSeries(offers, range, now = Date.now() / 1000) {
  return (offers ?? []).map((offer, index) => {
    const points = buildChartPoints(
      filterPriceHistoryByRange(offer.price_history, range, now)
    );
    return {
      offerId: offer.id,
      storeName: offer.store_name ?? null,
      storeId: offer.store_id ?? null,
      hasFavicon: Boolean(offer.store_has_favicon),
      color: SERIES_COLORS[index % SERIES_COLORS.length],
      points: points.map((point, i) => {
        const previous = points[i - 1];
        const inStock = point.isInStock === true || previous?.isInStock === true;
        const outOfStock = point.isInStock === false || previous?.isInStock === false;
        return {
          ...point,
          inStockPrice: inStock ? point.price : null,
          outOfStockPrice: outOfStock ? point.price : null
        };
      })
    };
  });
}

/**
 * A padded Y domain covering every series (see `computeYDomain`).
 * @param {Array<{ points: Array<{ price: number }> }>} series
 * @returns {[number, number]|['auto', 'auto']}
 */
export function seriesYDomain(series) {
  return computeYDomain(series.flatMap((s) => s.points));
}
```

- [ ] **Step 4: Remove the out-of-stock bands**

Delete `computeOutOfStockBands` from `productHistory.js` and its `describe` block from `productHistory.test.js` (bands are replaced by the dashed segments). Update the module docstring's "domain/band math" to "domain math".

- [ ] **Step 5: Draw the series**

Add i18n keys under `pages.product.chart`: English `"tooltip": { ..., "store": "Store" }`, `"legendLabel": "Stores"`; Spanish `"store": "Tienda"`, `"legendLabel": "Tiendas"`.

In `PriceHistoryChart.jsx`:
- Replace the `chartPoints` and `outOfStockBands` props with `series` (JSDoc: "One entry per offer, see `buildOfferSeries`"). Remove `ReferenceArea` from the imports.
- `ChartTooltip` receives `showStore`; it reads `const entry = payload[0]; const point = entry.payload;` and, when `showStore`, renders `<Text>{t('pages.product.chart.tooltip.store')}: {entry.name}</Text>` first.
- The `LineChart` has no `data` prop; the `XAxis` gets `allowDuplicatedCategory={false}`; `<Tooltip shared={false} content={<ChartTooltip currency={currency} locale={locale} t={t} showStore={series.length > 1} />} />`.
- Replace the single `Line` with:

```jsx
                {series.flatMap((s) => [
                  <Line
                    key={`${s.offerId}-in`}
                    data={s.points}
                    name={s.storeName ?? ''}
                    type="stepAfter"
                    dataKey="inStockPrice"
                    stroke={s.color}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={!shouldReduceMotion}
                    animationDuration={durationSeconds.normal * 1000}
                  />,
                  <Line
                    key={`${s.offerId}-out`}
                    data={s.points}
                    name={s.storeName ?? ''}
                    type="stepAfter"
                    dataKey="outOfStockPrice"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    strokeOpacity={0.6}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={!shouldReduceMotion}
                    animationDuration={durationSeconds.normal * 1000}
                  />
                ])}
```

- Below the chart `Box`, when `series.length > 1`, render the legend:

```jsx
          <HStack as="ul" aria-label={t('pages.product.chart.legendLabel')} gap={4} wrap="wrap" mt={3} listStyleType="none">
            {series.map((s) => (
              <HStack as="li" key={s.offerId} gap={1.5}>
                <Box w="12px" h="2px" bg={s.color} aria-hidden="true" />
                <StoreBadge storeId={s.storeId} name={s.storeName} hasFavicon={s.hasFavicon} />
              </HStack>
            ))}
          </HStack>
```

  (import `HStack` and `StoreBadge`).
- Update the component docstring: one stepped line per store, dashed while out of stock, legend with more than one store.

In `ProductPage.jsx`, replace `chartPoints`, `yDomain`, `outOfStockBands`, `hasEnoughHistory`, `hasEnoughTotalHistory` and `trackingStartDate` with:

```jsx
  const series = useMemo(() => buildOfferSeries(offers, range), [offers, range]);
  const yDomain = useMemo(() => seriesYDomain(series), [series]);
  const hasEnoughHistory = series.some((s) => hasEnoughHistoryPoints(s.points));
  const hasEnoughTotalHistory = offers.some((offer) =>
    hasEnoughHistoryPoints(offer.price_history)
  );
  const trackingStartDate = useMemo(() => {
    const starts = offers
      .map((offer) => getTrackingStartTimestamp(offer.price_history))
      .filter((value) => value !== null);
    return starts.length === 0 ? null : Math.min(...starts);
  }, [offers]);
```

and pass `series={series}` to `PriceHistoryChart`. Remove the now-unused imports.

- [ ] **Step 6: Update the chart tests**

In `PriceHistoryChart.test.jsx`, build the props with `buildOfferSeries([...], RANGE_ALL)` instead of `chartPoints`/`outOfStockBands`, and add:

```jsx
it('shows a legend with every store when there is more than one', () => {
  const series = buildOfferSeries(buildMultiStoreDetail().offers, RANGE_ALL);
  renderChart({ series });   // the file's existing render helper, with `series` override

  const legend = screen.getByRole('list', { name: 'Stores' });
  expect(within(legend).getByText('Amazon')).toBeInTheDocument();
  expect(within(legend).getByText('Thomann')).toBeInTheDocument();
});

it('has no legend for a single store', () => {
  const series = buildOfferSeries(buildProductDetail().offers, RANGE_ALL);
  renderChart({ series });

  expect(screen.queryByRole('list', { name: 'Stores' })).not.toBeInTheDocument();
});
```

- [ ] **Step 7: Run the frontend suite**

Run: `cd frontend && npm test`
Expected: all pass except `ProductFormDialog.test.jsx` (Task 14).

- [ ] **Step 8: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): draw one price line per store"
```

---

### Task 12: "Add store" dialog

**Files:**
- Create: `frontend/src/components/product/AddOfferDialog.jsx`, `AddOfferDialog.test.jsx`
- Modify: `frontend/src/components/product/index.js`, `frontend/src/pages/ProductPage.jsx`, i18n files

**Interfaces:**
- Consumes: `products.extractInfo` (existing), `useProductsStore.addOffer` (Task 7), `isValidProductUrl` (Task 10), `OfferList` `actions` prop (Task 10).
- Produces: `<AddOfferDialog open onClose product />` where `product = { id, name, currency }`.

- [ ] **Step 1: Add the strings**

English, `components.addOfferDialog`:

```json
"addOfferDialog": {
  "title": "Add store",
  "description": "Track {{name}} in another store.",
  "urlLabel": "Store URL",
  "fetch": "Fetch store details",
  "store": "Store",
  "currency": "Currency",
  "currencyMismatch": "This store uses {{found}}, but {{name}} is tracked in {{expected}}.",
  "firstPriceHint": "Its first price arrives with the next daily check.",
  "extractionError": "We couldn't read this page. Check the URL and try again.",
  "submit": "Add store"
}
```

and `toasts.offers.addSuccess`: `"{{store}} added"`. Spanish: "Añadir tienda", "Sigue {{name}} en otra tienda.", "URL de la tienda", "Obtener datos de la tienda", "Tienda", "Moneda", "Esta tienda usa {{found}}, pero {{name}} se sigue en {{expected}}.", "Su primer precio llegará con la próxima revisión diaria.", "No hemos podido leer esta página. Revisa la URL e inténtalo de nuevo.", "Añadir tienda", "{{store}} añadida".

- [ ] **Step 2: Write the failing tests**

`frontend/src/components/product/AddOfferDialog.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { products as productsApi } from '@/lib/api';
import { useProductsStore } from '@/stores/productsStore';
import { AddOfferDialog } from './AddOfferDialog';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, products: { ...actual.products, extractInfo: vi.fn() } };
});

const product = { id: 1, name: 'Drum kit', currency: 'EUR' };
const store = { id: 2, name: 'Amazon', domain: 'amazon.es', has_favicon: false };

const fetchDetails = async (url) => {
  await userEvent.type(screen.getByLabelText(/Store URL/), url);
  await userEvent.click(screen.getByRole('button', { name: 'Fetch store details' }));
};

describe('AddOfferDialog', () => {
  beforeEach(() => {
    useProductsStore.setState({ addOffer: vi.fn().mockResolvedValue({ id: 9 }) });
  });

  it('adds the store after extracting it', async () => {
    productsApi.extractInfo.mockResolvedValue({ currency: 'EUR', store });
    const onClose = vi.fn();
    renderWithProviders(<AddOfferDialog open onClose={onClose} product={product} />);

    await fetchDetails('https://www.amazon.es/dp/KIT');
    expect(await screen.findByText('Amazon')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Add store' }));

    expect(useProductsStore.getState().addOffer).toHaveBeenCalledWith(1, {
      url: 'https://www.amazon.es/dp/KIT',
      currency: 'EUR',
      store_id: 2
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('blocks a store in another currency', async () => {
    productsApi.extractInfo.mockResolvedValue({ currency: 'USD', store });
    renderWithProviders(<AddOfferDialog open onClose={vi.fn()} product={product} />);

    await fetchDetails('https://www.amazon.com/dp/KIT');

    expect(
      await screen.findByText('This store uses USD, but Drum kit is tracked in EUR.')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add store' })).toBeDisabled();
  });

  it('shows an error when extraction fails', async () => {
    productsApi.extractInfo.mockRejectedValue(new Error('boom'));
    renderWithProviders(<AddOfferDialog open onClose={vi.fn()} product={product} />);

    await fetchDetails('https://broken.example/x');

    expect(await screen.findByText(/couldn't read this page/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/product/AddOfferDialog.test.jsx`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement the dialog**

`frontend/src/components/product/AddOfferDialog.jsx`:

```jsx
import { useState } from 'react';
import { Button, Flex, HStack, Input, Spinner, Text, VStack } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle
} from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { toaster } from '@/components/ui/toaster';
import { StoreBadge } from '@/components/common';
import { products as productsApi } from '@/lib/api';
import { isValidProductUrl } from '@/lib/web_utils';
import { useProductsStore } from '@/stores/productsStore';

/**
 * Adds another store (offer) to a product: paste the URL, extract the
 * store and currency with the AI, check the currency matches the product's
 * and confirm. Extraction returns no price; the first one arrives with the
 * next daily check.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ id: number, name: string, currency: string }} props.product
 */
export const AddOfferDialog = ({ open, onClose, product }) => {
  const { t } = useTranslation();
  const addOffer = useProductsStore((state) => state.addOffer);
  const [url, setUrl] = useState('');
  const [extracted, setExtracted] = useState(null);
  const [error, setError] = useState(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  // Start clean every time the dialog opens (render-time sync).
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUrl('');
      setExtracted(null);
      setError(null);
    }
  }

  const trimmedUrl = url.trim();
  const currency = extracted?.currency?.trim().toUpperCase() ?? null;
  const currencyMismatch = currency !== null && currency !== product.currency;

  const handleFetch = async () => {
    setIsExtracting(true);
    setError(null);
    setExtracted(null);
    try {
      setExtracted(await productsApi.extractInfo(trimmedUrl));
    } catch {
      setError(t('components.addOfferDialog.extractionError'));
    } finally {
      setIsExtracting(false);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await addOffer(product.id, {
        url: trimmedUrl,
        currency,
        store_id: extracted.store?.id
      });
      toaster.create({
        title: t('toasts.offers.addSuccess', { store: extracted.store?.name ?? '' }),
        type: 'success'
      });
      onClose();
    } catch (err) {
      toaster.create({
        title: t(err?.status === 409 ? 'toasts.offers.duplicateUrl' : 'toasts.offers.error'),
        type: 'error'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogRoot open={open} onOpenChange={(e) => !e.open && onClose()} placement="center">
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('components.addOfferDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack align="stretch" gap={4}>
            <Text color="fg.muted">
              {t('components.addOfferDialog.description', { name: product.name })}
            </Text>
            <Field label={t('components.addOfferDialog.urlLabel')} required>
              <Input
                value={url}
                onChange={(e) => {
                  setUrl(e.target.value);
                  setExtracted(null);
                }}
                placeholder={t('common.placeholders.productUrl')}
                disabled={isExtracting || isSubmitting}
                autoComplete="off"
              />
            </Field>
            <Button
              variant="outline"
              onClick={handleFetch}
              disabled={!isValidProductUrl(trimmedUrl) || isExtracting || isSubmitting}
            >
              {isExtracting && <Spinner size="sm" />}
              {t('components.addOfferDialog.fetch')}
            </Button>
            {error && (
              <Text color="fg.error" fontSize="sm">
                {error}
              </Text>
            )}
            {extracted && (
              <VStack align="stretch" gap={2}>
                <HStack gap={2}>
                  <Text textStyle="sm" color="fg.muted">
                    {t('components.addOfferDialog.store')}
                  </Text>
                  <StoreBadge
                    storeId={extracted.store?.id}
                    name={extracted.store?.name}
                    hasFavicon={extracted.store?.has_favicon}
                    size="md"
                  />
                </HStack>
                <Text textStyle="sm">
                  {t('components.addOfferDialog.currency')}: {currency}
                </Text>
                {currencyMismatch ? (
                  <Text color="fg.error" fontSize="sm">
                    {t('components.addOfferDialog.currencyMismatch', {
                      found: currency,
                      name: product.name,
                      expected: product.currency
                    })}
                  </Text>
                ) : (
                  <Text textStyle="caption" color="fg.muted">
                    {t('components.addOfferDialog.firstPriceHint')}
                  </Text>
                )}
              </VStack>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Flex gap={2} justify="flex-end" width="full">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              loading={isSubmitting}
              disabled={!extracted || currencyMismatch}
            >
              {t('components.addOfferDialog.submit')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
```

Export it from `components/product/index.js`. In `ProductPage.jsx`, add `const [isAddOfferOpen, setIsAddOfferOpen] = useState(false);`, pass `actions={<Button size="sm" variant="outline" onClick={() => setIsAddOfferOpen(true)}><Icon as={LuPlus} />{t('pages.product.offers.addStore')}</Button>}` to `OfferList`, and render `<AddOfferDialog open={isAddOfferOpen} onClose={() => setIsAddOfferOpen(false)} product={product} />`.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/components/product src/pages/ProductPage.test.jsx`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add another store to a product"
```

---

### Task 13: "Merge with…" dialog

**Files:**
- Create: `frontend/src/components/product/MergeProductDialog.jsx`, `MergeProductDialog.test.jsx`
- Modify: `frontend/src/components/product/index.js`, `frontend/src/pages/ProductPage.jsx`, i18n files

**Interfaces:**
- Consumes: `useProductsStore.items`, `fetchSummary`, `merge` (Task 7).
- Produces: `<MergeProductDialog open onClose product finalFocusEl? />` where `product` is the detail record (id, name, currency, offers).

- [ ] **Step 1: Add the strings**

English:

```json
"mergeProductDialog": {
  "title": "Merge with another product",
  "description": "Use this when {{name}} and another product are the same item in different stores. Their stores and price histories are combined into one product.",
  "productLabel": "Other product",
  "productPlaceholder": "Search your products",
  "empty": "No other product uses {{currency}}.",
  "keepLabel": "Keep name, category, priority and description from",
  "keepTarget": "This product",
  "keepSource": "The other product",
  "preview_one": "Result: {{name}}, tracked in {{count}} store.",
  "preview_other": "Result: {{name}}, tracked in {{count}} stores.",
  "submit": "Merge"
}
```

under `components`; `pages.product.actions.merge`: `"Merge with…"`; `toasts.products.mergeSuccess`: `"Products merged"`, `toasts.products.mergeError`: `"The products could not be merged."`. Spanish: "Fusionar con otro producto", "Úsalo cuando {{name}} y otro producto sean el mismo artículo en tiendas distintas. Sus tiendas e historiales de precios se combinan en un único producto.", "Otro producto", "Busca en tus productos", "Ningún otro producto usa {{currency}}.", "Conservar nombre, categoría, prioridad y descripción de", "Este producto", "El otro producto", "Resultado: {{name}}, seguido en {{count}} tienda." / "tiendas.", "Fusionar", "Fusionar con…", "Productos fusionados", "No se han podido fusionar los productos.".

- [ ] **Step 2: Write the failing tests**

`frontend/src/components/product/MergeProductDialog.test.jsx`:

```jsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { useProductsStore } from '@/stores/productsStore';
import {
  buildDashboardProduct,
  buildOfferSummary,
  buildProductDetail
} from '../../../e2e/fixtures/products';
import { MergeProductDialog } from './MergeProductDialog';

const target = buildProductDetail({ id: 1, name: 'Wireless Headphones', currency: 'USD' });
const same = buildDashboardProduct({
  id: 2,
  name: 'WH-1000 Headphones',
  currency: 'USD',
  offers: [buildOfferSummary({ id: 5, store_name: 'Thomann' })]
});
const euro = buildDashboardProduct({ id: 3, name: 'Euro gadget', currency: 'EUR' });

describe('MergeProductDialog', () => {
  beforeEach(() => {
    useProductsStore.setState({
      items: [buildDashboardProduct({ id: 1 }), same, euro],
      status: 'success',
      merge: vi.fn().mockResolvedValue({})
    });
  });

  it('only offers other products in the same currency', async () => {
    renderWithProviders(<MergeProductDialog open onClose={vi.fn()} product={target} />);

    await userEvent.click(screen.getByRole('combobox', { name: /Other product/ }));

    expect(await screen.findByRole('option', { name: 'WH-1000 Headphones' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Euro gadget' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Wireless Headphones' })).not.toBeInTheDocument();
  });

  it('merges keeping the chosen fields and previews the result', async () => {
    const onClose = vi.fn();
    renderWithProviders(<MergeProductDialog open onClose={onClose} product={target} />);

    await userEvent.click(screen.getByRole('combobox', { name: /Other product/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'WH-1000 Headphones' }));
    await userEvent.click(screen.getByText('The other product'));

    expect(screen.getByText('Result: WH-1000 Headphones, tracked in 2 stores.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Merge' }));

    expect(useProductsStore.getState().merge).toHaveBeenCalledWith(1, {
      source_product_id: 2,
      keep: 'source'
    });
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/product/MergeProductDialog.test.jsx`
Expected: FAIL (module missing).

- [ ] **Step 4: Implement the dialog**

`frontend/src/components/product/MergeProductDialog.jsx`:

```jsx
import { useEffect, useMemo, useState } from 'react';
import { Button, Flex, Text, VStack, createListCollection } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import {
  DialogBackdrop,
  DialogBody,
  DialogCloseTrigger,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogRoot,
  DialogTitle
} from '@/components/ui/dialog';
import {
  ComboboxContent,
  ComboboxControl,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxRoot
} from '@/components/ui/combobox';
import { Field } from '@/components/ui/field';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { toaster } from '@/components/ui/toaster';
import { useProductsStore } from '@/stores/productsStore';

/**
 * Merges another product (the same item tracked in other stores) into this
 * one: pick the other product (same currency only), choose whose shared
 * fields to keep, check the preview and confirm. This product's id is kept,
 * so the page stays where it is.
 *
 * @param {object} props
 * @param {boolean} props.open
 * @param {() => void} props.onClose
 * @param {{ id: number, name: string, currency: string, offers: object[] }} props.product
 * @param {() => (HTMLElement|null|undefined)} [props.finalFocusEl]
 */
export const MergeProductDialog = ({ open, onClose, product, finalFocusEl }) => {
  const { t } = useTranslation();
  const items = useProductsStore((state) => state.items);
  const status = useProductsStore((state) => state.status);
  const fetchSummary = useProductsStore((state) => state.fetchSummary);
  const merge = useProductsStore((state) => state.merge);
  const [sourceId, setSourceId] = useState(null);
  const [keep, setKeep] = useState('target');
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);

  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSourceId(null);
      setKeep('target');
      setQuery('');
    }
  }

  useEffect(() => {
    if (open && status === 'idle') fetchSummary();
  }, [open, status, fetchSummary]);

  const candidates = useMemo(
    () =>
      items.filter(
        (item) => item.id !== product.id && item.currency === product.currency
      ),
    [items, product.id, product.currency]
  );
  const collection = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return createListCollection({
      items: candidates
        .filter((item) => item.name.toLowerCase().includes(needle))
        .map((item) => ({ value: String(item.id), label: item.name }))
    });
  }, [candidates, query]);
  const source = candidates.find((item) => item.id === sourceId) ?? null;

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      await merge(product.id, { source_product_id: source.id, keep });
      toaster.create({ title: t('toasts.products.mergeSuccess'), type: 'success' });
      onClose();
    } catch {
      toaster.create({ title: t('toasts.products.mergeError'), type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <DialogRoot
      open={open}
      onOpenChange={(e) => !e.open && onClose()}
      placement="center"
      finalFocusEl={finalFocusEl}
    >
      <DialogBackdrop />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('components.mergeProductDialog.title')}</DialogTitle>
        </DialogHeader>
        <DialogCloseTrigger />
        <DialogBody>
          <VStack align="stretch" gap={4}>
            <Text color="fg.muted">
              {t('components.mergeProductDialog.description', { name: product.name })}
            </Text>
            <Field label={t('components.mergeProductDialog.productLabel')} required>
              <ComboboxRoot
                collection={collection}
                value={sourceId === null ? [] : [String(sourceId)]}
                onValueChange={(details) =>
                  setSourceId(details.value[0] ? Number(details.value[0]) : null)
                }
                onInputValueChange={(details) => setQuery(details.inputValue)}
                disabled={isSubmitting}
                openOnClick
              >
                <ComboboxControl>
                  <ComboboxInput
                    placeholder={t('components.mergeProductDialog.productPlaceholder')}
                  />
                </ComboboxControl>
                <ComboboxContent portalled={false}>
                  <ComboboxEmpty>
                    {t('components.mergeProductDialog.empty', { currency: product.currency })}
                  </ComboboxEmpty>
                  {collection.items.map((item) => (
                    <ComboboxItem key={item.value} item={item}>
                      {item.label}
                    </ComboboxItem>
                  ))}
                </ComboboxContent>
              </ComboboxRoot>
            </Field>
            <Field label={t('components.mergeProductDialog.keepLabel')}>
              <SegmentedControl
                items={[
                  { value: 'target', label: t('components.mergeProductDialog.keepTarget') },
                  { value: 'source', label: t('components.mergeProductDialog.keepSource') }
                ]}
                value={keep}
                onValueChange={(e) => setKeep(e.value)}
                disabled={isSubmitting}
              />
            </Field>
            {source && (
              <Text fontWeight="medium">
                {t('components.mergeProductDialog.preview', {
                  name: keep === 'target' ? product.name : source.name,
                  count: product.offers.length + source.offers.length
                })}
              </Text>
            )}
          </VStack>
        </DialogBody>
        <DialogFooter>
          <Flex gap={2} justify="flex-end" width="full">
            <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
              {t('common.actions.cancel')}
            </Button>
            <Button onClick={handleSubmit} loading={isSubmitting} disabled={!source}>
              {t('components.mergeProductDialog.submit')}
            </Button>
          </Flex>
        </DialogFooter>
      </DialogContent>
    </DialogRoot>
  );
};
```

If the combobox wrapper in `components/ui/combobox.jsx` does not wire the `Field` label to the input (the test's `getByRole('combobox', { name: /Other product/ })` fails), pass `aria-label={t('components.mergeProductDialog.productLabel')}` to `ComboboxInput`.

Export it from `components/product/index.js`. In `ProductPage.jsx`, add a "Merge with…" `Menu.Item` (value `merge`, icon `LuMerge`, or `LuCombine` if `LuMerge` is not exported) before the delete item, with state `isMergeOpen`, and render `<MergeProductDialog open={isMergeOpen} onClose={() => setIsMergeOpen(false)} product={product} finalFocusEl={() => deleteMenuTriggerRef.current} />`.

- [ ] **Step 5: Run the tests**

Run: `cd frontend && npx vitest run src/components/product src/pages`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): merge two products into one"
```

---

### Task 14: "Same product as…" in the new product dialog; shared-only edit

**Files:**
- Modify: `frontend/src/components/products/ProductFormDialog.jsx`, `ProductFormDialog.test.jsx`, i18n files

**Interfaces:**
- Consumes: `useProductsStore.items`, `create`, `addOffer`, `update` (Task 7).
- Produces: create payload `{ name, priority, category_id, description, offer: { url, currency, store_id? } }`; edit payload `{ name, priority, category_id, description }`.

- [ ] **Step 1: Add the strings**

English under `components.productFormDialog`:

```json
"sameAs": {
  "label": "Same product as…",
  "helper": "Optional. Pick a product you already track to add this URL as another store.",
  "placeholder": "Search your products",
  "empty": "No products found.",
  "note": "It will be added as another store of {{name}}.",
  "clear": "Track as a new product"
}
```

`errors.currencyMismatch`: `"{{name}} is tracked in {{expected}}; this store uses {{found}}."`; `toasts.offers.addSuccess` already exists (Task 12). Spanish: "Mismo producto que…", "Opcional. Elige un producto que ya sigues para añadir esta URL como otra tienda.", "Busca en tus productos", "No se han encontrado productos.", "Se añadirá como otra tienda de {{name}}.", "Seguir como producto nuevo", "{{name}} se sigue en {{expected}}; esta tienda usa {{found}}.".

- [ ] **Step 2: Write the failing tests**

Update the existing create-flow tests in `ProductFormDialog.test.jsx`: the expected create payload now nests `url`, `currency` and `store_id` under `offer`; edit tests no longer expect a URL or currency field or payload keys. Add:

```jsx
describe('same product as…', () => {
  beforeEach(() => {
    useProductsStore.setState({
      items: [buildDashboardProduct({ id: 7, name: 'Drum kit', currency: 'EUR' })],
      status: 'success',
      addOffer: vi.fn().mockResolvedValue({ id: 9 }),
      create: vi.fn()
    });
  });

  it('adds the URL as another store of the chosen product', async () => {
    productsApi.extractInfo.mockResolvedValue({
      name: 'Drum kit (Amazon)',
      category: 'Electronics',
      description: '',
      currency: 'EUR',
      store: { id: 2, name: 'Amazon', domain: 'amazon.es', has_favicon: false }
    });
    renderCreateDialog();   // the file's existing helper for mode="create"

    await typeUrlAndExtract('https://www.amazon.es/dp/KIT');   // existing helper
    await userEvent.click(screen.getByRole('combobox', { name: /Same product as/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Drum kit' }));

    expect(screen.getByText('It will be added as another store of Drum kit.')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Name/)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Add product/ }));

    expect(useProductsStore.getState().addOffer).toHaveBeenCalledWith(7, {
      url: 'https://www.amazon.es/dp/KIT',
      currency: 'EUR',
      store_id: 2
    });
    expect(useProductsStore.getState().create).not.toHaveBeenCalled();
  });

  it('blocks a store in another currency', async () => {
    productsApi.extractInfo.mockResolvedValue({
      name: 'Drum kit',
      category: '',
      description: '',
      currency: 'USD',
      store: { id: 3, name: 'Amazon US', domain: 'amazon.com', has_favicon: false }
    });
    renderCreateDialog();

    await typeUrlAndExtract('https://www.amazon.com/dp/KIT');
    await userEvent.click(screen.getByRole('combobox', { name: /Same product as/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Drum kit' }));
    await userEvent.click(screen.getByRole('button', { name: /Add product/ }));

    expect(
      await screen.findByText('Drum kit is tracked in EUR; this store uses USD.')
    ).toBeInTheDocument();
    expect(useProductsStore.getState().addOffer).not.toHaveBeenCalled();
  });
});
```

(Use the submit button name the file already uses for create mode, and the file's existing helpers for rendering and extraction; if they do not exist, write them at the top of the file as small functions around the existing render/type/click steps.)

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend && npx vitest run src/components/products/ProductFormDialog.test.jsx`
Expected: FAIL.

- [ ] **Step 4: Implement the changes**

In `ProductFormDialog.jsx`:

1. State: `const [sameAsId, setSameAsId] = useState(null); const [sameAsQuery, setSameAsQuery] = useState('');`, reset both in the create branch of the render-time sync. Read `const summaryItems = useProductsStore((state) => state.items); const summaryStatus = useProductsStore((state) => state.status); const fetchSummary = useProductsStore((state) => state.fetchSummary); const addOffer = useProductsStore((state) => state.addOffer);` and add an effect: `useEffect(() => { if (open && mode === 'create' && summaryStatus === 'idle') fetchSummary(); }, [open, mode, summaryStatus, fetchSummary]);`.
2. `const sameAsProduct = summaryItems.find((item) => item.id === sameAsId) ?? null;` and the combobox collection (filtered by `sameAsQuery`, value `String(item.id)`, label `item.name`), built like the currency collection.
3. Edit mode: remove the URL `Field` and the currency `Field` (`mode === 'create' &&` around both); remove `url` and `currency` from the edit sync branch and from the edit payload.
4. Inside the revealed fields in create mode, first render the "Same product as…" field:

```jsx
                        {mode === 'create' && (
                          <Field
                            label={t('components.productFormDialog.sameAs.label')}
                            helperText={
                              sameAsProduct
                                ? t('components.productFormDialog.sameAs.note', {
                                    name: sameAsProduct.name
                                  })
                                : t('components.productFormDialog.sameAs.helper')
                            }
                          >
                            <ComboboxRoot
                              collection={sameAsCollection}
                              value={sameAsId === null ? [] : [String(sameAsId)]}
                              onValueChange={(details) => {
                                setSameAsId(details.value[0] ? Number(details.value[0]) : null);
                                clearFieldError('currency');
                              }}
                              onInputValueChange={(details) => setSameAsQuery(details.inputValue)}
                              disabled={isSubmitting}
                              openOnClick
                            >
                              <ComboboxControl>
                                <ComboboxInput
                                  aria-label={t('components.productFormDialog.sameAs.label')}
                                  placeholder={t('components.productFormDialog.sameAs.placeholder')}
                                />
                              </ComboboxControl>
                              <ComboboxContent portalled={false}>
                                <ComboboxEmpty>
                                  {t('components.productFormDialog.sameAs.empty')}
                                </ComboboxEmpty>
                                {sameAsCollection.items.map((item) => (
                                  <ComboboxItem key={item.value} item={item}>
                                    {item.label}
                                  </ComboboxItem>
                                ))}
                              </ComboboxContent>
                            </ComboboxRoot>
                            {sameAsProduct && (
                              <Button
                                variant="plain"
                                size="xs"
                                alignSelf="flex-start"
                                onClick={() => setSameAsId(null)}
                              >
                                {t('components.productFormDialog.sameAs.clear')}
                              </Button>
                            )}
                          </Field>
                        )}
```

   (The note is carried by `helperText`, so the test finds "It will be added as another store of Drum kit.")
5. Wrap the priority `Field` and the name, description and category `Field`s in `{!sameAsProduct && (...)}`; keep the currency field visible.
6. `validate()`: skip the name and category checks when `sameAsProduct`; add, after the currency format check:

```js
    const normalizedCurrency = currency.trim().toUpperCase();
    if (
      sameAsProduct &&
      !nextErrors.currency &&
      normalizedCurrency !== sameAsProduct.currency
    ) {
      nextErrors.currency = t('components.productFormDialog.errors.currencyMismatch', {
        name: sameAsProduct.name,
        expected: sameAsProduct.currency,
        found: normalizedCurrency
      });
    }
```

7. `handleSubmit`: build

```js
    const offer = {
      url: url.trim(),
      currency: currency.trim().toUpperCase(),
      ...(store ? { store_id: store.id } : {})
    };
    const shared = {
      name: name.trim(),
      priority,
      category_id: Number(categoryId),
      description: description.trim()
    };
```

   and branch: `if (mode === 'create' && sameAsProduct)` → `await addOffer(sameAsProduct.id, offer)`, toast `t('toasts.offers.addSuccess', { store: store?.name ?? '' })` with the existing "open product" action pointing at `/product/${sameAsProduct.id}`; `else if (mode === 'create')` → `createProduct({ ...shared, offer })` (existing toast); `else` → `updateProduct(product.id, shared)` (existing toast). Map a 409 from `addOffer` to the `toasts.offers.duplicateUrl` toast.
8. Update the component docstring: describe the optional "Same product as…" choice and that edit mode only changes shared fields (URLs are edited per store on the product page).

- [ ] **Step 5: Run the whole frontend suite**

Run: `cd frontend && npm test`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src
git commit -m "feat(frontend): add a URL as another store of an existing product"
```

---

### Task 15: E2E, visual snapshots and project docs

**Files:**
- Modify: `frontend/e2e/*.spec.js`, `frontend/e2e/visual.spec.js-snapshots/*`
- Modify: `README.md`

- [ ] **Step 1: Run the e2e suite and fix the specs**

Run: `cd frontend && npm run test:e2e`
Fix every spec that reads product-level `url`, `store_*` or `last_checked_at` or posts the old create payload (the fixtures from Task 7 are already offer-shaped). In `product-form.spec.js`, the mocked `POST /products/` handler must accept the body with `offer: {...}`.

- [ ] **Step 2: Add a multi-store smoke test**

In `frontend/e2e/dashboard.spec.js`, using the file's existing route-mocking helper, serve `[buildMultiStoreProduct()]` from `/products/dashboard-summary` and add:

```js
test('counts a product tracked in two stores once', async ({ page }) => {
  await mockDashboard(page, { products: [buildMultiStoreProduct()] });   // existing helper
  await page.goto('/');

  await expect(page.getByTestId('summary-items')).toHaveText('1');
  await expect(page.getByRole('button', { name: '+1 store' })).toBeVisible();
});
```

If the summary strip has no `data-testid` on the item count, add `data-testid="summary-items"` to that `Text` in `DashboardSummary.jsx`.

In `frontend/e2e/product-detail.spec.js`, serve `buildMultiStoreDetail()` for `/products/3` and assert that the "Stores" heading, both store rows and the chart legend with "Amazon" and "Thomann" are visible.

- [ ] **Step 3: Regenerate the visual snapshots**

Run: `cd frontend && npx playwright test visual.spec.js --update-snapshots`, then `npm run test:e2e`.
Expected: all pass. Open two regenerated PNGs (dashboard and product detail) with the Read tool and check the store chip, the stores card and the chart legend look right.

- [ ] **Step 4: Update the README**

In `README.md`:
- Key Features: add a row `| **Multiple Stores per Product** | Track the same product in several stores. It counts once on the dashboard, valued by its best offer (the cheapest store in stock). Add stores from the product page or the "New product" dialog, merge two products into one, or unlink a store back into its own product. |`, and update "Store Detection" ("each store of a product records its name and favicon") and "Price Tracking" ("one price check per store per day").
- Database Schema: `Product` (shared fields), `Offer`, `OfferHist`, `PendingStatusRetry.offer_id`, `DailyCheckRun.total_offers`.
- API Reference: the new endpoints and body shapes from Task 4 and the nested `offers` in the product responses.
- Usage Guide: a short "Tracking a product in several stores" paragraph.
- Add a note under Installation: "After pulling the product-offers change, recreate the database (`just db-clean && just db-init`); there are no migrations."

- [ ] **Step 5: Run everything**

Run: `cd /home/guille/wishlist-tracker && just test && just lint && just test-e2e`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add README.md frontend/e2e frontend/src
git commit -m "docs: document products tracked in several stores"
```
