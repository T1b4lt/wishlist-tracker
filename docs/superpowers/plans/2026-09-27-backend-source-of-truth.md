# Backend as the Single Source of Truth Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every business rule (staleness, range statistics, best offer, lowest across stores, config options and fallbacks) to the backend, make the frontend only present backend data, and delete `contracts/`.

**Architecture:** The backend adds computed fields to the existing responses: stale flags on offers and products, precomputed statistics for every chart range on the product detail, and the config options in `GET /config/`. The frontend reads them instead of recomputing, keeping only formatting, filtering/sorting, chart geometry and display aggregates. Contract JSON cases that still test backend rules move to `backend/tests/cases/`.

**Tech Stack:** FastAPI + SQLModel + Pydantic v2 (Python 3.12, pytest, `uv`), React + Chakra UI v3 + Zustand (Vitest, Testing Library, Playwright).

**Spec:** `docs/superpowers/specs/2026-09-27-backend-source-of-truth-design.md`

## Global Constraints

- No backward compatibility and no migrations: the database may be recreated.
- `STALE_AFTER_DAYS = 3`; products never checked are not stale.
- Range keys are exactly `"30"`, `"60"`, `"90"`, `"180"`, `"all"`, in that order, derived from `HIST_WINDOW_OPTIONS`.
- `window_start = now - days * 86400`; `None` for `"all"`.
- The dashboard summary strip (`src/lib/dashboardSummary.js`) stays in the frontend.
- The UI must show the same numbers as before; Playwright visual snapshots must not change (never run `--update-snapshots`).
- Everything (code, comments, docs, commit messages) in English; Conventional Commits (a commit-msg hook enforces it).
- Backend commands run from `backend/` (`uv run pytest ...`); frontend commands from `frontend/` (`npx vitest run ...`, `npm run test:e2e`).
- Pre-commit hooks run ruff, prettier and eslint on commit. If a hook reformats files and aborts the commit, `git add` the reformatted files and commit again.

## Review Focus

- A store checked "in the future" (clock skew, `last_checked_at > now`) counts as 0 days and is not stale — pinned in Task 1.
- The best offer is out of stock while another store has cheaper in-stock history: `price_change_pct` is `None` and `lowest` comes from the other store — pinned in Task 4.
- A stored `hist_window_size` outside the options (e.g. `"45"`) must not make `GET /products/{id}` fail `default_range` validation; it falls back to `"60"` — pinned in Tasks 3 and 4.
- A range the user picked must survive a background refetch of the product (e.g. after adding a store), instead of snapping back to `default_range` — pinned in Task 7.
- A just-added store without history among stores with history is never the best offer, is not stale, and is ignored by `lowest` — pinned in Task 4.

Known trade-off (accepted in the spec): deleting `api-fields.json` removes the check that e2e fixtures have exactly the backend's fields. The e2e fixture helper added in Task 5 is test-only; application code never imports it.

---

### Task 1: Backend staleness

**Files:**
- Create: `backend/src/services/staleness.py`
- Modify: `backend/src/schemas/product.py` (`OfferSummary`, `ProductDashboardSummary`, `ProductDetailResponse`)
- Modify: `backend/src/services/product_service.py` (`_offer_summary_fields`, `get_dashboard_summary`, `get_detail`)
- Test: `backend/tests/test_staleness.py` (new), `backend/tests/test_products.py`

**Interfaces:**
- Produces: `STALE_AFTER_DAYS: int`, `days_since_check(last_checked_at: int | None, now: int) -> int | None`, `is_stale(last_checked_at: int | None, now: int) -> bool`, `product_stale_days(offers_last_checked: list[int | None], now: int) -> int | None`.
- Produces: `get_detail(session, product_id, now: int | None = None)`.
- Produces (API): offers gain `days_since_check`, `is_stale`; dashboard rows and detail gain `is_stale`, `stale_days`.

- [ ] **Step 1: Write the failing unit tests**

`backend/tests/test_staleness.py`:

```python
"""Tests for the staleness rules (``src/services/staleness.py``)."""

from src.services.staleness import (
    STALE_AFTER_DAYS,
    days_since_check,
    is_stale,
    product_stale_days,
)

DAY = 86400
NOW = 1_000 * DAY


def test_threshold_is_three_days():
    assert STALE_AFTER_DAYS == 3


def test_never_checked_is_not_stale():
    assert days_since_check(None, NOW) is None
    assert is_stale(None, NOW) is False


def test_just_under_three_days_is_not_stale():
    checked = NOW - (3 * DAY - 1)

    assert days_since_check(checked, NOW) == 2
    assert is_stale(checked, NOW) is False


def test_exactly_three_days_is_stale():
    checked = NOW - 3 * DAY

    assert days_since_check(checked, NOW) == 3
    assert is_stale(checked, NOW) is True


def test_a_check_in_the_future_counts_as_zero_days():
    checked = NOW + 3600

    assert days_since_check(checked, NOW) == 0
    assert is_stale(checked, NOW) is False


def test_product_stale_days_is_the_stalest_stale_offer():
    checks = [NOW - DAY, NOW - 4 * DAY, NOW - 6 * DAY, None]

    assert product_stale_days(checks, NOW) == 6


def test_product_without_stale_offers_has_no_stale_days():
    assert product_stale_days([NOW - DAY, None], NOW) is None
    assert product_stale_days([], NOW) is None
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest tests/test_staleness.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.services.staleness'`

- [ ] **Step 3: Implement the staleness service**

`backend/src/services/staleness.py`:

```python
"""
Staleness: offers whose price has not been updated for a while.

The daily check stores one price record per offer per day. When no new
record shows up for several days, the AI agent is probably failing to read
the store page (the site is down, the product was removed, the agent is
blocked...), so the UI warns the user.

Offers that were never checked are not stale: there is nothing to measure
the delay against. Pure functions, no database access.
"""

from src.services.price_stats import SECONDS_PER_DAY

# Days without a new price record after which an offer is stale.
STALE_AFTER_DAYS = 3


def days_since_check(last_checked_at: int | None, now: int) -> int | None:
    """Return the whole days elapsed since the last price check.

    Args:
        last_checked_at (int | None): Unix seconds of the newest record.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        int | None: Whole days, never negative; ``None`` if never checked.
    """
    if last_checked_at is None:
        return None
    return max(0, (now - last_checked_at) // SECONDS_PER_DAY)


def is_stale(last_checked_at: int | None, now: int) -> bool:
    """Return whether the price was not updated for ``STALE_AFTER_DAYS`` days or more."""
    days = days_since_check(last_checked_at, now)
    return days is not None and days >= STALE_AFTER_DAYS


def product_stale_days(offers_last_checked: list[int | None], now: int) -> int | None:
    """Return the days of a product's stalest stale offer.

    Args:
        offers_last_checked (list[int | None]): ``last_checked_at`` of each offer.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        int | None: The largest ``days_since_check`` among stale offers, or
            ``None`` when no offer is stale.
    """
    stale_days = [
        days_since_check(checked, now)
        for checked in offers_last_checked
        if is_stale(checked, now)
    ]
    return max(stale_days) if stale_days else None
```

- [ ] **Step 4: Run the unit tests**

Run: `uv run pytest tests/test_staleness.py -v`
Expected: 7 passed

- [ ] **Step 5: Write the failing endpoint test**

Append to `backend/tests/test_products.py` (add `import time` and the `add_history`, `make_category`, `make_offer`, `make_product` factory imports at the top if they are missing):

```python
STALE_DAY = 86400


def test_dashboard_and_detail_flag_stale_offers(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    fresh = make_offer(session, product.id, url="https://a.es/x")
    stale = make_offer(session, product.id, url="https://b.es/x")
    now = int(time.time())
    add_history(session, fresh.id, [(10.0, True, now - 3600)])
    add_history(session, stale.id, [(12.0, True, now - 5 * STALE_DAY - 60)])

    summary = client.get("/products/dashboard-summary").json()[0]
    detail = client.get(f"/products/{product.id}").json()

    for data in (summary, detail):
        assert data["is_stale"] is True
        assert data["stale_days"] == 5
        offers = {offer["id"]: offer for offer in data["offers"]}
        assert offers[fresh.id]["is_stale"] is False
        assert offers[fresh.id]["days_since_check"] == 0
        assert offers[stale.id]["is_stale"] is True
        assert offers[stale.id]["days_since_check"] == 5


def test_never_checked_product_is_not_stale(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    make_offer(session, product.id)

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["is_stale"] is False
    assert data["stale_days"] is None
    assert data["offers"][0]["days_since_check"] is None
    assert data["offers"][0]["is_stale"] is False
```

- [ ] **Step 6: Run it to verify it fails**

Run: `uv run pytest tests/test_products.py -k "stale" -v`
Expected: FAIL with `KeyError: 'is_stale'`

- [ ] **Step 7: Add the schema fields**

In `backend/src/schemas/product.py`:

- `OfferSummary`: after `last_checked_at: int | None` add
  ```python
      days_since_check: int | None
      is_stale: bool
  ```
- `ProductDashboardSummary` and `ProductDetailResponse`: after their last field add
  ```python
      is_stale: bool
      stale_days: int | None
  ```

- [ ] **Step 8: Fill the fields in the service**

In `backend/src/services/product_service.py`:

1. Import: `from src.services.staleness import days_since_check, is_stale, product_stale_days`.
2. Replace `_offer_summary_fields` with a version that takes `now`:

```python
def _offer_summary_fields(
    offer: Offer, store: Store | None, current, now: int
) -> dict:
    """Return the ``OfferSummary`` fields of an offer.

    Args:
        offer (Offer): The offer.
        store (Store | None): Its store, if any.
        current: Its newest ``OfferHist`` record, or None.
        now (int): Reference Unix timestamp for the staleness fields.

    Returns:
        dict: Keyword arguments for ``OfferSummary`` / ``OfferDetail``.
    """
    last_checked_at = current.timestamp if current else None
    return {
        "id": offer.id,
        "url": offer.url,
        "store_id": store.id if store else None,
        "store_name": store.name if store else None,
        "store_domain": store.domain if store else None,
        "store_has_favicon": bool(store and store.favicon),
        "current_price": current.price if current else None,
        "is_in_stock": current.is_in_stock if current else None,
        "last_checked_at": last_checked_at,
        "days_since_check": days_since_check(last_checked_at, now),
        "is_stale": is_stale(last_checked_at, now),
    }
```

3. In `get_dashboard_summary`, pass `now` to `_offer_summary_fields(...)`, and before `summary_list.append(...)` compute:

```python
        stale_days = product_stale_days(
            [
                latest[offer.id].timestamp if offer.id in latest else None
                for offer in offers
            ],
            now,
        )
```

   then add `is_stale=stale_days is not None, stale_days=stale_days,` to the `ProductDashboardSummary(...)` call.

4. Change `get_detail`'s signature to `def get_detail(session: Session, product_id: int, now: int | None = None) -> ProductDetailResponse:`, start its body (after `_get_or_404`) with `now = int(time.time()) if now is None else now`, pass `now` to `_offer_summary_fields(...)`, and add to `ProductDetailResponse(...)`:

```python
    stale_days = product_stale_days(
        [
            histories[offer.id][-1].timestamp if histories[offer.id] else None
            for offer in offers
        ],
        now,
    )
```

   with `is_stale=stale_days is not None, stale_days=stale_days,`. Update the `get_detail` docstring's `Args` with `now`.

5. Check nothing else builds these schemas: `grep -rn "_offer_summary_fields\|OfferSummary(\|OfferDetail(\|ProductDetailResponse(" src`. Every hit must pass `now` / the new fields.

- [ ] **Step 9: Run the backend suite**

Run: `uv run pytest -q`
Expected: all pass, except `tests/test_contracts.py::test_schema_fields_match_contract` for `OfferSummary`, `OfferDetail`, `ProductDashboardSummary` and `ProductDetailResponse`. That file is deleted in Task 9. Until then, add the new field names to `contracts/api-fields.json` so the suite stays green (`days_since_check` and `is_stale` in `OfferSummary` and `OfferDetail`; `is_stale` and `stale_days` in `ProductDashboardSummary` and `ProductDetailResponse`). Also add them to the e2e fixtures only in Task 5; for now `frontend/src/lib/contracts.test.js` fails on the same four entries, so skip those four `it`s by changing `it(` to `it.skip(` for `matches the dashboard summary fields`, `matches the product detail fields`, `matches the offer summary fields`, `matches the offer detail fields` (that file is deleted in Task 9).

- [ ] **Step 10: Commit**

```bash
git add backend/src/services/staleness.py backend/src/schemas/product.py backend/src/services/product_service.py backend/tests/test_staleness.py backend/tests/test_products.py contracts/api-fields.json frontend/src/lib/contracts.test.js
git commit -m "feat(backend): compute offer and product staleness"
```

---

### Task 2: Lowest price across stores in the backend

**Files:**
- Modify: `backend/src/services/best_offer.py`
- Test: `backend/tests/test_lowest_across_offers.py` (new)

**Interfaces:**
- Produces: `@dataclass(frozen=True) class LowestRecord: price: float; timestamp: int; offer_id: int`.
- Produces: `lowest_across_offers(offers: list[OfferHistory], window_days: int | None, now: int) -> LowestRecord | None`.
- Also: `current_record(history)` (already exists) is used by Task 4.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_lowest_across_offers.py`:

```python
"""Tests for ``best_offer.lowest_across_offers``."""

from types import SimpleNamespace

from src.services.best_offer import (
    LowestRecord,
    OfferHistory,
    compute_product_offer_stats,
    lowest_across_offers,
)

DAY = 86400
NOW = 100 * DAY


def rec(price, is_in_stock, timestamp):
    return SimpleNamespace(price=price, is_in_stock=is_in_stock, timestamp=timestamp)


def test_ignores_out_of_stock_records():
    offers = [OfferHistory(1, [rec(50, False, NOW - DAY), rec(80, True, NOW - 2 * DAY)])]

    assert lowest_across_offers(offers, 30, NOW) == LowestRecord(80, NOW - 2 * DAY, 1)


def test_looks_at_every_offer():
    offers = [
        OfferHistory(1, [rec(90, True, NOW - DAY)]),
        OfferHistory(2, [rec(70, True, NOW - 3 * DAY)]),
    ]

    assert lowest_across_offers(offers, 30, NOW) == LowestRecord(70, NOW - 3 * DAY, 2)


def test_price_tie_keeps_the_most_recent_record():
    offers = [
        OfferHistory(1, [rec(70, True, NOW - 5 * DAY)]),
        OfferHistory(2, [rec(70, True, NOW - 2 * DAY)]),
    ]

    assert lowest_across_offers(offers, 30, NOW) == LowestRecord(70, NOW - 2 * DAY, 2)


def test_respects_the_window():
    offers = [OfferHistory(1, [rec(60, True, NOW - 40 * DAY), rec(90, True, NOW - DAY)])]

    assert lowest_across_offers(offers, 30, NOW).price == 90
    assert lowest_across_offers(offers, None, NOW).price == 60


def test_window_start_is_inclusive():
    offers = [OfferHistory(1, [rec(60, True, NOW - 30 * DAY), rec(90, True, NOW - DAY)])]

    assert lowest_across_offers(offers, 30, NOW).price == 60


def test_none_without_in_stock_records():
    assert lowest_across_offers([], 30, NOW) is None
    assert lowest_across_offers([OfferHistory(1, [rec(10, False, NOW)])], 30, NOW) is None


def test_at_lowest_uses_the_lowest_across_offers():
    offers = [
        OfferHistory(1, [rec(80, True, NOW - DAY)]),
        OfferHistory(2, [rec(70, True, NOW - 5 * DAY), rec(90, True, NOW - DAY)]),
    ]

    stats = compute_product_offer_stats(offers, 30, NOW)

    assert stats.best_offer_id == 1
    assert stats.is_at_lowest is False
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest tests/test_lowest_across_offers.py -v`
Expected: FAIL with `ImportError: cannot import name 'LowestRecord'`

- [ ] **Step 3: Implement**

In `backend/src/services/best_offer.py`:

1. Add after `ProductOfferStats`:

```python
@dataclass(frozen=True)
class LowestRecord:
    """The cheapest in-stock record of any offer inside a window."""

    price: float
    timestamp: int
    offer_id: int


def lowest_across_offers(
    offers: list[OfferHistory], window_days: int | None, now: int
) -> LowestRecord | None:
    """Return the cheapest in-stock record of any offer inside the window.

    The most recent record wins on price ties.

    Args:
        offers (list[OfferHistory]): The product's offers.
        window_days (int | None): Window length in days; ``None`` keeps
            the full history.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        LowestRecord | None: The lowest record, or ``None`` when no offer has
            an in-stock record inside the window.
    """
    lowest = None
    for offer in offers:
        for record in filter_window(offer.history, window_days, now):
            if not record.is_in_stock:
                continue
            if (
                lowest is None
                or record.price < lowest.price
                or (
                    record.price == lowest.price
                    and record.timestamp >= lowest.timestamp
                )
            ):
                lowest = LowestRecord(record.price, record.timestamp, offer.offer_id)
    return lowest
```

2. In `compute_product_offer_stats`, replace the `in_stock_prices` block with:

```python
    if best_offer_id is not None and currents[best_offer_id].is_in_stock:
        lowest = lowest_across_offers(offers, window_days, now)
        is_at_lowest = (
            lowest is not None and currents[best_offer_id].price <= lowest.price
        )
```

3. Add to the module docstring's definitions:
   `* lowest across offers: cheapest in-stock record of any offer inside the window (most recent on ties).`

- [ ] **Step 4: Run the tests**

Run: `uv run pytest tests/test_lowest_across_offers.py tests/test_best_offer_contract.py -v`
Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/best_offer.py backend/tests/test_lowest_across_offers.py
git commit -m "feat(backend): find the lowest price across a product's stores"
```

---

### Task 3: Config options and strict fallbacks

**Files:**
- Modify: `backend/src/core/config.py` (`get_hist_window_size`)
- Modify: `backend/src/schemas/config.py` (`ConfigResponse`)
- Modify: `backend/src/services/config_service.py` (`get_all_config`)
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Produces (API): `GET /config/` and `PATCH /config/` responses gain `hist_window_options: list[int]`, `daily_check_report_options: list[str]`, `stale_after_days: int`; `hist_window_size` is always one of the options.

- [ ] **Step 1: Update and add the tests**

In `backend/tests/test_config.py`, replace `test_off_list_stored_hist_window_size_is_used_as_is` with:

```python
def test_off_list_stored_hist_window_size_falls_back_to_default(client, session):
    _store_hist_window_size(session, "45")

    assert get_hist_window_size(session) == 60
    assert client.get("/config/").json()["hist_window_size"] == 60


def test_config_exposes_the_options_and_the_stale_threshold(client):
    data = client.get("/config/").json()

    assert data["hist_window_options"] == [30, 60, 90, 180]
    assert data["daily_check_report_options"] == ["off", "limit_days", "every_day"]
    assert data["stale_after_days"] == 3
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest tests/test_config.py -v`
Expected: the two tests above FAIL (`assert 45 == 60`, `KeyError: 'hist_window_options'`)

- [ ] **Step 3: Implement**

1. In `backend/src/core/config.py`, replace `get_hist_window_size` with:

```python
def get_hist_window_size(session: Session) -> int:
    """Return the configured historical window size, in days.

    A stored value that is not one of ``HIST_WINDOW_OPTIONS`` (e.g. a
    corrupted row) falls back to ``DEFAULT_HIST_WINDOW``.

    Args:
        session (Session): The database session.

    Returns:
        int: One of ``HIST_WINDOW_OPTIONS``.
    """
    raw = get_config_value(session, "hist_window_size", str(DEFAULT_HIST_WINDOW))
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_HIST_WINDOW
    return value if value in HIST_WINDOW_OPTIONS else DEFAULT_HIST_WINDOW
```

2. In `backend/src/schemas/config.py`, change `ConfigResponse`:

```python
class ConfigResponse(BaseModel):
    """Full configuration snapshot returned to the client.

    The ``*_options`` fields and ``stale_after_days`` are read-only: they
    tell the client which values it can offer and how the backend decides
    staleness, so the client never hard-codes them.
    """

    analysis_hour: int
    hist_window_size: HistWindowSize
    is_price_drop_alert: bool
    is_stock_change_alert: bool
    daily_check_report: DailyCheckReport
    telegram_bot_token: str | None
    telegram_bot_chat_id: str | None
    selected_language: str
    google_api_key: str | None
    telegram_status: str
    hist_window_options: list[int]
    daily_check_report_options: list[str]
    stale_after_days: int
```

3. In `backend/src/services/config_service.py`, import `DAILY_CHECK_REPORT_OPTIONS, HIST_WINDOW_OPTIONS` from `src.core.config` and `STALE_AFTER_DAYS` from `src.services.staleness`, and add to the `ConfigResponse(...)` call in `get_all_config`:

```python
        hist_window_options=list(HIST_WINDOW_OPTIONS),
        daily_check_report_options=list(DAILY_CHECK_REPORT_OPTIONS),
        stale_after_days=STALE_AFTER_DAYS,
```

- [ ] **Step 4: Run the backend suite**

Run: `uv run pytest -q`
Expected: all pass (`get_hist_window_size` is also used by the daily check and Telegram code; an off-list value now behaves like the default there too, which is intended)

- [ ] **Step 5: Commit**

```bash
git add backend/src/core/config.py backend/src/schemas/config.py backend/src/services/config_service.py backend/tests/test_config.py
git commit -m "feat(backend): expose the config options and fall back on off-list windows"
```

---

### Task 4: Precomputed ranges in the product detail

**Files:**
- Modify: `backend/src/core/config.py` (range keys)
- Modify: `backend/src/schemas/product.py` (`LowestPrice`, `RangeStats`, `ProductDetailResponse`)
- Modify: `backend/src/services/product_service.py` (`get_detail`, new `_range_stats`)
- Test: `backend/tests/test_product_detail_ranges.py` (new)

**Interfaces:**
- Consumes: `lowest_across_offers`, `LowestRecord`, `OfferHistory`, `current_record`, `compute_product_offer_stats` (Task 2); `get_detail(..., now)` (Task 1); strict `get_hist_window_size` (Task 3).
- Produces: `RANGE_ALL = "all"`, `RANGE_KEYS: tuple[str, ...]`, `RangeKey`, `range_window_days(key: str) -> int | None` in `src.core.config`.
- Produces (API): `ProductDetailResponse` gains `best_offer_id: int | None`, `is_in_stock: bool | None`, `default_range: RangeKey`, `ranges: list[RangeStats]` where `RangeStats = {key, window_start, average, price_change_pct, lowest: {price, timestamp, offer_id} | None}`.

- [ ] **Step 1: Write the failing tests**

`backend/tests/test_product_detail_ranges.py`:

```python
"""Tests for the precomputed range statistics of the product detail."""

import pytest
from src.models.database_models import Config
from src.services import product_service
from tests.factories import add_history, make_category, make_offer, make_product

DAY = 86400
NOW = 1_000 * DAY


@pytest.fixture
def two_store_product(session):
    """Store A is the best offer (95 now); store B has the oldest low (85)."""
    category = make_category(session)
    product = make_product(session, category.id)
    a = make_offer(session, product.id, url="https://a.es/x")
    b = make_offer(session, product.id, url="https://b.es/x")
    add_history(
        session,
        a.id,
        [(100.0, True, NOW - 40 * DAY), (90.0, True, NOW - 10 * DAY), (95.0, True, NOW - DAY)],
    )
    add_history(session, b.id, [(85.0, True, NOW - 50 * DAY), (99.0, True, NOW - 2 * DAY)])
    return product, a, b


def _by_key(detail):
    return {stats.key: stats for stats in detail.ranges}


def _set_window(session, value):
    session.add(Config(key="hist_window_size", value=value))
    session.commit()


def test_detail_has_every_range_in_order(session, two_store_product):
    product, _, _ = two_store_product

    detail = product_service.get_detail(session, product.id, now=NOW)

    assert [stats.key for stats in detail.ranges] == ["30", "60", "90", "180", "all"]
    assert [stats.window_start for stats in detail.ranges] == [
        NOW - 30 * DAY,
        NOW - 60 * DAY,
        NOW - 90 * DAY,
        NOW - 180 * DAY,
        None,
    ]


def test_detail_values_the_product_by_its_best_offer(session, two_store_product):
    product, a, _ = two_store_product

    detail = product_service.get_detail(session, product.id, now=NOW)
    ranges = _by_key(detail)

    assert detail.best_offer_id == a.id
    assert detail.is_in_stock is True
    assert ranges["30"].average == pytest.approx(90.0)
    assert ranges["30"].price_change_pct == pytest.approx(5.5556, abs=1e-3)
    assert ranges["60"].average == pytest.approx(95.0)
    assert ranges["60"].price_change_pct == pytest.approx(0.0)


def test_detail_lowest_looks_at_every_store(session, two_store_product):
    product, a, b = two_store_product

    ranges = _by_key(product_service.get_detail(session, product.id, now=NOW))

    lowest_30 = ranges["30"].lowest
    lowest_60 = ranges["60"].lowest
    assert (lowest_30.price, lowest_30.timestamp, lowest_30.offer_id) == (90.0, NOW - 10 * DAY, a.id)
    assert (lowest_60.price, lowest_60.timestamp, lowest_60.offer_id) == (85.0, NOW - 50 * DAY, b.id)
    assert ranges["all"].lowest.offer_id == b.id


def test_default_range_follows_the_configured_window(session, two_store_product):
    product, _, _ = two_store_product
    _set_window(session, "90")

    assert product_service.get_detail(session, product.id, now=NOW).default_range == "90"


def test_default_range_falls_back_for_an_off_list_window(session, two_store_product):
    product, _, _ = two_store_product
    _set_window(session, "45")

    assert product_service.get_detail(session, product.id, now=NOW).default_range == "60"


def test_product_without_history(session):
    category = make_category(session)
    product = make_product(session, category.id)
    make_offer(session, product.id)

    detail = product_service.get_detail(session, product.id, now=NOW)

    assert detail.best_offer_id is None
    assert detail.is_in_stock is None
    assert detail.is_stale is False
    assert detail.stale_days is None
    for stats in detail.ranges:
        assert (stats.average, stats.price_change_pct, stats.lowest) == (None, None, None)
    assert detail.ranges[0].window_start == NOW - 30 * DAY


def test_a_new_store_without_history_is_ignored(session, two_store_product):
    product, a, b = two_store_product
    new = make_offer(session, product.id, url="https://c.es/x")

    detail = product_service.get_detail(session, product.id, now=NOW)
    offers = {offer.id: offer for offer in detail.offers}

    assert detail.best_offer_id == a.id
    assert _by_key(detail)["60"].lowest.offer_id == b.id
    assert offers[new.id].is_stale is False
    assert offers[new.id].days_since_check is None


def test_out_of_stock_best_offer_has_no_change_and_lowest_comes_from_another_store(session):
    category = make_category(session)
    product = make_product(session, category.id)
    a = make_offer(session, product.id, url="https://a.es/x")
    b = make_offer(session, product.id, url="https://b.es/x")
    add_history(session, a.id, [(70.0, True, NOW - 5 * DAY), (60.0, False, NOW - DAY)])
    add_history(session, b.id, [(65.0, True, NOW - 3 * DAY), (80.0, False, NOW - DAY)])

    detail = product_service.get_detail(session, product.id, now=NOW)
    ranges = _by_key(detail)

    assert detail.best_offer_id == a.id
    assert detail.is_in_stock is False
    assert ranges["30"].price_change_pct is None
    assert (ranges["30"].lowest.price, ranges["30"].lowest.offer_id) == (65.0, b.id)


def test_detail_endpoint_serializes_the_ranges(client, session, two_store_product):
    product, _, _ = two_store_product

    data = client.get(f"/products/{product.id}").json()

    assert data["default_range"] == "60"
    assert [stats["key"] for stats in data["ranges"]] == ["30", "60", "90", "180", "all"]
    assert set(data["ranges"][0]) == {
        "key",
        "window_start",
        "average",
        "price_change_pct",
        "lowest",
    }
```

- [ ] **Step 2: Run them to verify they fail**

Run: `uv run pytest tests/test_product_detail_ranges.py -v`
Expected: FAIL with `AttributeError: 'ProductDetailResponse' object has no attribute 'ranges'`

- [ ] **Step 3: Add the range keys to the config module**

In `backend/src/core/config.py`, below `HistWindowSize`:

```python
# Ranges of the product detail's chart and stats: every historical window
# option plus the full history. Derived from ``HIST_WINDOW_OPTIONS`` so a new
# option adds a range.
RANGE_ALL = "all"
RANGE_KEYS = (*(str(days) for days in HIST_WINDOW_OPTIONS), RANGE_ALL)
RangeKey = Literal[RANGE_KEYS]


def range_window_days(key: str) -> int | None:
    """Return the window length of a range key (``None`` for the full history)."""
    return None if key == RANGE_ALL else int(key)
```

Also remove the "Mirrored by the frontend ... pinned for both sides by `contracts/...`" sentences from the two comments above `HIST_WINDOW_OPTIONS` and `DAILY_CHECK_REPORT_OPTIONS`.

- [ ] **Step 4: Add the schemas**

In `backend/src/schemas/product.py` (import `RangeKey` from `src.core.config`), add before `ProductDetailResponse`:

```python
class LowestPrice(BaseModel):
    """The cheapest in-stock price of any store inside a range."""

    price: float
    timestamp: int
    offer_id: int


class RangeStats(BaseModel):
    """Statistics of one range of the product detail's chart.

    ``average`` and ``price_change_pct`` follow ``src/services/price_stats.py``
    over the best offer's history; ``lowest`` looks at every store
    (``best_offer.lowest_across_offers``).
    """

    key: RangeKey
    window_start: int | None
    average: float | None
    price_change_pct: float | None
    lowest: LowestPrice | None
```

and add to `ProductDetailResponse` (and replace its docstring with "Full product detail with every offer and its history, plus the precomputed statistics of every chart range."):

```python
    best_offer_id: int | None
    is_in_stock: bool | None
    default_range: RangeKey
    ranges: list[RangeStats]
```

- [ ] **Step 5: Compute them in the service**

In `backend/src/services/product_service.py`:

1. Imports: `from src.core.config import RANGE_KEYS, get_config_value, get_hist_window_size, range_window_days`; `from src.services.best_offer import OfferHistory, compute_product_offer_stats, current_record, lowest_across_offers`; `from src.services.price_stats import SECONDS_PER_DAY, compute_window_stats, filter_window`; add `LowestPrice, RangeStats` to the `src.schemas.product` import.

2. Add above `get_detail`:

```python
def _range_stats(
    offers: list[OfferHistory], best_offer_id: int | None, now: int
) -> list[RangeStats]:
    """Compute the statistics of every range of the product detail.

    Args:
        offers (list[OfferHistory]): Every offer with its full history.
        best_offer_id (int | None): The offer that values the product.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        list[RangeStats]: One entry per ``RANGE_KEYS`` key, in order.
    """
    best_history = next(
        (offer.history for offer in offers if offer.offer_id == best_offer_id), []
    )
    best_current = current_record(best_history)
    ranges = []
    for key in RANGE_KEYS:
        window_days = range_window_days(key)
        stats = compute_window_stats(
            filter_window(best_history, window_days, now), best_current
        )
        lowest = lowest_across_offers(offers, window_days, now)
        ranges.append(
            RangeStats(
                key=key,
                window_start=(
                    None if window_days is None else now - window_days * SECONDS_PER_DAY
                ),
                average=stats.average,
                price_change_pct=stats.price_change_pct,
                lowest=(
                    LowestPrice(
                        price=lowest.price,
                        timestamp=lowest.timestamp,
                        offer_id=lowest.offer_id,
                    )
                    if lowest
                    else None
                ),
            )
        )
    return ranges
```

3. In `get_detail`, after the `histories` loop:

```python
    offer_histories = [
        OfferHistory(offer_id=offer.id, history=histories[offer.id]) for offer in offers
    ]
    # Neither the best offer nor the product's stock depends on the window.
    offer_stats = compute_product_offer_stats(offer_histories, None, now)
```

   and add to `ProductDetailResponse(...)`:

```python
        best_offer_id=offer_stats.best_offer_id,
        is_in_stock=offer_stats.is_in_stock,
        default_range=str(get_hist_window_size(session)),
        ranges=_range_stats(offer_histories, offer_stats.best_offer_id, now),
```

   Update the `get_detail` docstring: "Build the full product detail: every offer with its whole history, the best offer and the precomputed statistics of every chart range."

- [ ] **Step 6: Run the backend suite**

Run: `uv run pytest -q`
Expected: all pass except `test_contracts.py::test_schema_fields_match_contract[ProductDetailResponse]`. Add `best_offer_id`, `is_in_stock`, `default_range`, `ranges` to `ProductDetailResponse` in `contracts/api-fields.json` (deleted in Task 9); re-run and expect all pass.

- [ ] **Step 7: Commit**

```bash
git add backend/src/core/config.py backend/src/schemas/product.py backend/src/services/product_service.py backend/tests/test_product_detail_ranges.py contracts/api-fields.json
git commit -m "feat(backend): precompute the statistics of every range in the product detail"
```

---

### Task 5: Frontend test fixtures carry the backend fields

The frontend code does not change in this task; the mocked responses gain the new fields so the next tasks can read them. Everything here is test-only.

**Files:**
- Create: `frontend/e2e/fixtures/backendFields.js`
- Modify: `frontend/e2e/fixtures/products.js`, `frontend/e2e/fixtures/config.js`, `frontend/e2e/support/apiMock.js` (POST `/products/`), `frontend/src/test/products.js`
- Test: `frontend/src/test/products.test.js` (new)

**Interfaces:**
- Produces (test-only): `offerStaleFields(lastCheckedAt, now?)`, `productStaleFields(offers)`, `detailFields(offers, { now?, defaultRange? })`, `currentRecord(history)`, `windowRecords(history, days, now?)`, `windowStats(window, current)`, `RANGE_KEYS`.
- Every fixture built by `buildOfferSummary`, `buildOfferDetail`, `buildDashboardProduct`, `buildProductDetail`, `singleStoreProduct` and `singleStoreDetail` has the backend's computed fields, derived from its own data unless overridden.

- [ ] **Step 1: Write the failing test**

`frontend/src/test/products.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { singleStoreDetail, singleStoreProduct } from './products';

const DAY = 60 * 60 * 24;

describe('test product helpers', () => {
  it('flags a product checked 5 days ago as stale, like the backend', () => {
    const now = Math.floor(Date.now() / 1000);

    const product = singleStoreProduct({
      id: 1,
      last_checked_at: now - 5 * DAY - 60
    });

    expect(product.offers[0]).toMatchObject({
      is_stale: true,
      days_since_check: 5
    });
    expect(product).toMatchObject({ is_stale: true, stale_days: 5 });
  });

  it('precomputes every range of a detail, like the backend', () => {
    const now = Math.floor(Date.now() / 1000);

    const detail = singleStoreDetail({
      id: 1,
      price_history: [
        { timestamp: now - 10 * DAY, price: 100, is_in_stock: true },
        { timestamp: now - DAY, price: 80, is_in_stock: true }
      ]
    });

    expect(detail.ranges.map((range) => range.key)).toEqual([
      '30',
      '60',
      '90',
      '180',
      'all'
    ]);
    expect(detail.best_offer_id).toBe(10);
    expect(detail.default_range).toBe('60');
    expect(detail.ranges[0]).toMatchObject({
      average: 100,
      price_change_pct: -20,
      lowest: { price: 80, offer_id: 10 }
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/test/products.test.js`
Expected: FAIL (`is_stale` is undefined)

- [ ] **Step 3: Write the fixture helper**

`frontend/e2e/fixtures/backendFields.js`:

```js
/**
 * Test-only stand-in for the fields the backend computes (staleness, best
 * offer, precomputed range statistics), so mocked responses are internally
 * consistent with their own histories. The backend is the source of truth
 * (`backend/src/services/staleness.py`, `best_offer.py`, `price_stats.py`);
 * application code never imports this file.
 */

import { DAY_SECONDS, nowSeconds } from './time';

export const STALE_AFTER_DAYS = 3;
export const RANGE_KEYS = ['30', '60', '90', '180', 'all'];
export const DEFAULT_RANGE = '60';

const ascending = (history) =>
  [...(history ?? [])].sort((a, b) => a.timestamp - b.timestamp);

/** The newest record (the last one in input order on ties), or `null`. */
export const currentRecord = (history) => {
  const sorted = ascending(history);
  return sorted.length === 0 ? null : sorted[sorted.length - 1];
};

/** Records inside the last `days` days (every record when `days` is `null`). */
export const windowRecords = (history, days, now = nowSeconds()) => {
  const sorted = ascending(history);
  if (days === null) return sorted;
  const start = now - days * DAY_SECONDS;
  return sorted.filter((record) => record.timestamp >= start);
};

/** Average, change vs. average, lowest and at-lowest of a window. */
export function windowStats(window, current) {
  const valid = window.filter((record) => record.is_in_stock === true);
  const baseline = current
    ? valid.filter((record) => record.timestamp !== current.timestamp)
    : valid;
  const average =
    baseline.length > 0
      ? baseline.reduce((sum, record) => sum + record.price, 0) /
        baseline.length
      : null;
  const currentInStock = Boolean(current) && current.is_in_stock === true;
  const priceChangePct =
    currentInStock && average !== null && average > 0
      ? ((current.price - average) / average) * 100
      : null;
  let lowest = null;
  for (const record of valid) {
    if (lowest === null || record.price <= lowest.price) lowest = record;
  }
  return {
    average,
    priceChangePct,
    lowest,
    isAtLowest: currentInStock && lowest !== null && current.price <= lowest.price
  };
}

/** `days_since_check` and `is_stale` of an offer. */
export function offerStaleFields(lastCheckedAt, now = nowSeconds()) {
  const days =
    lastCheckedAt === null || lastCheckedAt === undefined
      ? null
      : Math.max(0, Math.floor((now - lastCheckedAt) / DAY_SECONDS));
  return {
    days_since_check: days,
    is_stale: days !== null && days >= STALE_AFTER_DAYS
  };
}

/** `is_stale` and `stale_days` of a product, from its offers' fields. */
export function productStaleFields(offers) {
  const days = (offers ?? [])
    .filter((offer) => offer.is_stale)
    .map((offer) => offer.days_since_check);
  return {
    is_stale: days.length > 0,
    stale_days: days.length > 0 ? Math.max(...days) : null
  };
}

const rank = (offer, current) => [
  current.is_in_stock === true ? 0 : 1,
  current.price,
  -current.timestamp,
  offer.id
];

const compareRanks = (a, b) => {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
};

function bestOffer(offers) {
  let best = null;
  for (const offer of offers) {
    const current = currentRecord(offer.price_history);
    if (!current) continue;
    const offerRank = rank(offer, current);
    if (best === null || compareRanks(offerRank, best.rank) < 0) {
      best = { offer, rank: offerRank };
    }
  }
  return best?.offer ?? null;
}

function lowestAcrossOffers(offers, days, now) {
  let lowest = null;
  for (const offer of offers) {
    for (const record of windowRecords(offer.price_history, days, now)) {
      if (record.is_in_stock !== true) continue;
      if (
        lowest === null ||
        record.price < lowest.price ||
        (record.price === lowest.price && record.timestamp >= lowest.timestamp)
      ) {
        lowest = {
          price: record.price,
          timestamp: record.timestamp,
          offer_id: offer.id
        };
      }
    }
  }
  return lowest;
}

/**
 * `best_offer_id`, `is_in_stock`, `default_range` and `ranges` of a product
 * detail, from its offers' histories.
 * @param {object[]} offers - Offers with `price_history`.
 * @param {{ now?: number, defaultRange?: string }} [options]
 */
export function detailFields(
  offers,
  { now = nowSeconds(), defaultRange = DEFAULT_RANGE } = {}
) {
  const currents = (offers ?? [])
    .map((offer) => currentRecord(offer.price_history))
    .filter(Boolean);
  const best = bestOffer(offers ?? []);
  const bestCurrent = best ? currentRecord(best.price_history) : null;
  return {
    best_offer_id: best?.id ?? null,
    is_in_stock:
      currents.length === 0
        ? null
        : currents.some((current) => current.is_in_stock === true),
    default_range: defaultRange,
    ranges: RANGE_KEYS.map((key) => {
      const days = key === 'all' ? null : Number(key);
      const stats = windowStats(
        windowRecords(best?.price_history, days, now),
        bestCurrent
      );
      return {
        key,
        window_start: days === null ? null : now - days * DAY_SECONDS,
        average: stats.average,
        price_change_pct: stats.priceChangePct,
        lowest: lowestAcrossOffers(offers ?? [], days, now)
      };
    })
  };
}
```

- [ ] **Step 4: Use it in the e2e builders**

In `frontend/e2e/fixtures/products.js`:

1. Replace the `src/lib/productHistory.js` import with
   `import { currentRecord, detailFields, offerStaleFields, productStaleFields, windowRecords, windowStats } from './backendFields';`.
2. `buildOfferSummary`: build `const offer = { ...defaults, ...overrides };` (the current literal is the defaults) and `return { ...offerStaleFields(offer.last_checked_at), ...offer };`.
3. `buildOfferDetail`: stale fields must follow an overridden `last_checked_at`:

```js
export function buildOfferDetail(overrides = {}) {
  const {
    price_history = [
      buildHistoryPoint({
        price: 219.99,
        timestamp: nowSeconds() - 5 * DAY_SECONDS
      }),
      buildHistoryPoint({ price: 199.99, timestamp: nowSeconds() - 3600 })
    ],
    ...rest
  } = overrides;
  return { ...buildOfferSummary(rest), price_history };
}
```

4. `buildDashboardProduct`: `const product = { ...defaults, ...overrides }; return { ...productStaleFields(product.offers), ...product };`.
5. `buildProductDetail`: `const detail = { ...defaults, ...overrides }; return { ...productStaleFields(detail.offers), ...detailFields(detail.offers), ...detail };`.
6. `buildManyProducts`: replace the three `productHistory` calls with

```js
    const current = currentRecord(history);
    const window = windowRecords(history, SUMMARY_WINDOW_DAYS);
    const stats = windowStats(window, current);
```

   and use `price_change_pct: stats.priceChangePct`, `is_at_lowest: stats.isAtLowest`. Update its JSDoc: the numbers come from `./backendFields.js`, a test-only stand-in of the backend formulas (drop the `contracts/` mention).

In `frontend/e2e/fixtures/config.js`, add to `buildConfig`'s defaults:

```js
    hist_window_options: [30, 60, 90, 180],
    daily_check_report_options: ['off', 'limit_days', 'every_day'],
    stale_after_days: 3,
```

In `frontend/e2e/support/apiMock.js` (POST `/products/` handler), import `detailFields` from `../fixtures/backendFields`, add `days_since_check: null, is_stale: false` to the new `offer`, `is_stale: false, stale_days: null` to the new dashboard row, and build the detail as:

```js
        this.details[id] = {
          id,
          name: body.name,
          priority: body.priority,
          category_id: body.category_id,
          category_name: category?.name ?? '',
          category_color: category?.color ?? '#94A3B8',
          description: body.description,
          currency: body.offer.currency,
          is_stale: false,
          stale_days: null,
          ...detailFields([{ ...offer, price_history: [] }], {
            defaultRange: String(this.config?.hist_window_size ?? 60)
          }),
          offers: [{ ...offer, price_history: [] }]
        };
```

- [ ] **Step 5: Use it in the unit test helpers**

In `frontend/src/test/products.js`, import `{ detailFields, offerStaleFields, productStaleFields }` from `'../../e2e/fixtures/backendFields'` and:

- `singleStoreProduct`: build the offer as now, add `...offerStaleFields(last_checked_at)` to it, then `return { ...productStaleFields(offers), ...product, best_offer_id: offerId, offers };` (with `const offers = [offer]`).
- `singleStoreDetail`: add `...offerStaleFields(last_checked_at)` to the offer, then `return { ...productStaleFields(offers), ...detailFields(offers), ...product, offers };`, so a test can still override `best_offer_id`, `default_range` or `ranges` through `flat`.

Update both JSDoc blocks to mention the computed backend fields.

- [ ] **Step 6: Run the unit and e2e suites**

Run: `npx vitest run`
Expected: all pass (the app ignores the new fields for now)

Run: `npm run test:e2e`
Expected: all pass, snapshots unchanged

- [ ] **Step 7: Commit**

```bash
git add frontend/e2e/fixtures frontend/e2e/support/apiMock.js frontend/src/test/products.js frontend/src/test/products.test.js
git commit -m "test(frontend): give the mocked responses the backend's computed fields"
```

---

### Task 6: Frontend reads staleness from the backend

**Files:**
- Modify: `frontend/src/components/common/StaleBadge.jsx` (+ `.test.jsx`)
- Modify: `frontend/src/components/product/StaleProductNotice.jsx` (+ `.test.jsx`)
- Modify: `frontend/src/components/dashboard/ProductTable.jsx`, `ProductCardList.jsx` (+ tests)
- Modify: `frontend/src/components/dashboard/ProductFilterPanel.jsx`, `ProductFilterBar.jsx`, `frontend/src/pages/DashboardPage.jsx`
- Modify: `frontend/src/lib/productFilters.js`, `frontend/src/lib/dashboardSummary.js` (+ tests), `frontend/src/components/dashboard/DashboardSummary.test.jsx`
- Delete: `frontend/src/lib/staleness.js`, `frontend/src/lib/staleness.test.js`

**Interfaces:**
- Consumes: `offer.is_stale`, `offer.days_since_check`, `product.is_stale`, `product.stale_days`, `config.stale_after_days` (Tasks 1, 3, 5).
- Produces: `<StaleBadge days={number|null} storeNames? />`, `<StaleProductNotice days={number} lastCheckedAt url storeName? locale />`, `<ProductFilterPanel staleAfterDays={number|null} ... />`, `filterProducts(products, filters)` (no `now`), `computeDashboardSummary(products)` (no `now`).

- [ ] **Step 1: Rewrite the component tests first**

`frontend/src/components/common/StaleBadge.test.jsx` — replace every render that passes `lastCheckedAt`/`now` with `days`. The cases must be:

```jsx
it('shows how many days the price has not been updated', () => {
  renderWithProviders(<StaleBadge days={5} />);
  expect(screen.getByText('No updates for 5 days')).toBeInTheDocument();
});

it('renders nothing without stale days', () => {
  const { container } = renderWithProviders(<StaleBadge days={null} />);
  expect(container).toBeEmptyDOMElement();
});
```

Keep the existing tooltip / `storeNames` test, passing `days={4}` instead of `lastCheckedAt`/`now`.

`frontend/src/components/product/StaleProductNotice.test.jsx` — pass `days={4}` plus the existing `lastCheckedAt` (still used for the date in the description) and drop `now`; replace the "renders nothing while up to date" case with "renders nothing without days" (`days={null}`).

`frontend/src/lib/productFilters.test.js` — in `keeps only outdated products when stale is on` and every other fixture relying on `last_checked_at` for staleness, set `is_stale: true` on the stale products (fixtures built with `singleStoreProduct` already get it from their `last_checked_at`) and call `filterProducts(products, filters)` without `now`.

`frontend/src/lib/dashboardSummary.test.js` — call `computeDashboardSummary(products)` without `now`; the stale-count case must use products with `is_stale: true` / `false`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/common/StaleBadge.test.jsx src/components/product/StaleProductNotice.test.jsx src/lib/productFilters.test.js src/lib/dashboardSummary.test.js`
Expected: FAIL (the components still read `lastCheckedAt`)

- [ ] **Step 3: Implement the components**

`StaleBadge.jsx`: remove the `@/lib/staleness` import and the `lastCheckedAt`/`now` props; the signature becomes `({ days, storeNames, ...rest })` and the guard `if (typeof days !== 'number') return null;`. JSDoc: "A warning badge for a product whose price the backend reports as stale (`stale_days`)... Renders nothing when `days` is not a number."

`StaleProductNotice.jsx`: remove the `@/lib/staleness` import and `now`; props `({ days, lastCheckedAt, url, storeName, locale })`; guard `if (typeof days !== 'number') return null;`. Document `days` as the offer's `days_since_check`, passed only for stale offers.

`ProductTable.jsx` and `ProductCardList.jsx`: remove the `@/lib/staleness` import and use

```jsx
  const staleStores = product.offers.filter((offer) => offer.is_stale);
  ...
          <StaleBadge
            days={product.stale_days}
            storeNames={
              product.offers.length > 1
                ? staleStores.map((offer) => offer.store_name)
                : undefined
            }
          />
```

- [ ] **Step 4: Implement filters, summary and the filter label**

`productFilters.js`: remove the `./staleness` import; `filterProducts(products, filters)` loses `now` (drop its JSDoc line); the stale check becomes `if (filters.stale && product.is_stale !== true) return false;`; add above `COMPARATORS`:

```js
/** The oldest `last_checked_at` of a product's stores, or `null` if none was checked. */
const oldestCheck = (product) => {
  const checks = (product.offers ?? [])
    .map((offer) => offer.last_checked_at)
    .filter(isFiniteNumber);
  return checks.length === 0 ? null : Math.min(...checks);
};
```

and use it in `checked_desc`: `compareNullable(oldestCheck(a), oldestCheck(b), -1)`. Update the `stale` property doc: "Only products the backend reports as stale (`is_stale`)."

`dashboardSummary.js`: remove the `./staleness` import and the `now` parameter; `staleCount: products.filter((product) => product.is_stale === true).length`; update the JSDoc (`is_stale` replaces `offers` in `DashboardSummaryProduct`).

`ProductFilterPanel.jsx`: remove the `STALE_AFTER_DAYS` import, add a `staleAfterDays` prop (JSDoc: "`config.stale_after_days`; `null` while the config loads") and render

```jsx
          {staleAfterDays === null
            ? t('pages.dashboard.filters.updates.chip')
            : t('pages.dashboard.filters.updates.stale', {
                days: staleAfterDays
              })}
```

`ProductFilterBar.jsx`: accept `staleAfterDays` and pass it to `ProductFilterPanel`. `DashboardPage.jsx`: pass `staleAfterDays={config?.stale_after_days ?? null}` to `ProductFilterBar`.

- [ ] **Step 5: Delete the staleness module**

```bash
git rm frontend/src/lib/staleness.js frontend/src/lib/staleness.test.js
grep -rn "staleness" frontend/src
```

Expected: the only hits are in `ProductPage.jsx` (`staleOffers`, fixed in Task 7). For now replace that one call in `ProductPage.jsx` with `product.offers.filter((offer) => offer.is_stale)` and render `<StaleProductNotice key={offer.id} days={offer.days_since_check} lastCheckedAt={offer.last_checked_at} url={offer.url} storeName={isMultiStore ? offer.store_name : undefined} locale={locale} />`.

- [ ] **Step 6: Run the unit suite**

Run: `npx vitest run`
Expected: all pass. If a component or page test still builds a stale product by hand (a raw object with only `last_checked_at`), add `is_stale`/`stale_days` (products) or `is_stale`/`days_since_check` (offers) to that fixture. If `DashboardPage.filters.test.jsx` asserts the "Not updated for 3+ days" label, its config mock must include `stale_after_days: 3`.

- [ ] **Step 7: Run e2e**

Run: `npm run test:e2e`
Expected: all pass, snapshots unchanged

- [ ] **Step 8: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(frontend): read staleness from the backend"
```

---

### Task 7: Product detail reads the precomputed ranges

**Files:**
- Create: `frontend/src/lib/offers.js`, `frontend/src/lib/offers.test.js`
- Modify: `frontend/src/lib/productHistory.js` (+ `.test.js`), `frontend/src/lib/offerChart.js` (+ `.test.js`)
- Modify: `frontend/src/components/product/PriceHistoryChart.jsx` (+ `.test.jsx`), `ProductStatsRow.jsx` (JSDoc only)
- Modify: `frontend/src/pages/ProductPage.jsx` (+ `ProductPage.test.jsx`, `ProductPage.edit.test.jsx`, `ProductPage.delete.test.jsx` if needed)
- Modify: `frontend/src/components/dashboard/ProductTable.jsx`, `ProductCardList.jsx`, `OfferStores.jsx`, `ProductRowActions.jsx` (import path)
- Delete: `frontend/src/lib/bestOffer.js`, `bestOffer.test.js`, `bestOffer.contract.test.js`, `productHistory.contract.test.js`

**Interfaces:**
- Consumes: `product.best_offer_id`, `product.is_in_stock`, `product.default_range`, `product.ranges[] = { key, window_start, average, price_change_pct, lowest: { price, timestamp, offer_id } | null }` (Task 4, fixtures from Task 5).
- Produces: `findBestOfferSummary(product)` in `@/lib/offers`; `filterPriceHistoryByWindow(priceHistory, windowStart: number|null)`; `RANGE_ALL = 'all'` in `@/lib/productHistory`; `buildOfferSeries(offers, windowStart: number|null)`; `<PriceHistoryChart rangeKeys={string[]} range onRangeChange ... />`.

- [ ] **Step 1: Write the failing lib tests**

`frontend/src/lib/offers.test.js` — move the `findBestOfferSummary` cases from `bestOffer.test.js` here unchanged, importing from `./offers`.

In `frontend/src/lib/productHistory.test.js`, delete the `computeRangeStats`, `getCurrentRecord`, `resolveDefaultRange`, `RANGE_OPTIONS` and `filterPriceHistoryByRange` blocks and add:

```js
describe('filterPriceHistoryByWindow', () => {
  const history = [
    { timestamp: 300, price: 3, is_in_stock: true },
    { timestamp: 100, price: 1, is_in_stock: true },
    { timestamp: 200, price: 2, is_in_stock: true }
  ];

  it('sorts ascending and keeps everything without a window start', () => {
    expect(
      filterPriceHistoryByWindow(history, null).map((r) => r.timestamp)
    ).toEqual([100, 200, 300]);
  });

  it('keeps the records at or after the window start', () => {
    expect(
      filterPriceHistoryByWindow(history, 200).map((r) => r.timestamp)
    ).toEqual([200, 300]);
  });

  it('handles a missing history', () => {
    expect(filterPriceHistoryByWindow(undefined, 100)).toEqual([]);
  });
});
```

In `frontend/src/lib/offerChart.test.js`, call `buildOfferSeries(offers, windowStart)` with the timestamp the old `range`/`now` pair produced (`now - days * 86400`), or `null` where the test used `RANGE_ALL`.

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/lib/offers.test.js src/lib/productHistory.test.js src/lib/offerChart.test.js`
Expected: FAIL (`./offers` missing, `filterPriceHistoryByWindow` not exported)

- [ ] **Step 3: Implement the libs**

`frontend/src/lib/offers.js`:

```js
/**
 * The dashboard row's best offer summary: the offer the backend picked
 * (`best_offer_id`), or the first one when the product has no best offer yet,
 * so "Open in store" always has a URL.
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

`frontend/src/lib/productHistory.js`: rewrite the module docstring ("Chart helpers for the product detail page: filtering a history by the backend's range `window_start`, chart points, Y domain. Every statistic comes precomputed from the backend (`ProductDetailResponse.ranges`)."), delete `computeRangeStats`, `getCurrentRecord`, `RANGE_OPTIONS`, `resolveDefaultRange`, `SECONDS_PER_DAY` and the `./histWindow` import, keep `RANGE_ALL` (document it as "the backend's key for the whole-history range"), and replace `filterPriceHistoryByRange` with:

```js
/**
 * Sort a price history ascending by timestamp and keep the records at or
 * after `windowStart` (the selected range's `window_start`, computed by the
 * backend). `null` keeps every record.
 *
 * @param {PriceHistoryRecord[]|null|undefined} priceHistory
 * @param {number|null} windowStart - Seconds since epoch.
 * @returns {PriceHistoryRecord[]} A new, sorted (and possibly filtered) array.
 */
export function filterPriceHistoryByWindow(priceHistory, windowStart) {
  const sorted = Array.isArray(priceHistory)
    ? [...priceHistory].sort((a, b) => a.timestamp - b.timestamp)
    : [];
  if (windowStart === null || windowStart === undefined) return sorted;
  return sorted.filter((record) => record.timestamp >= windowStart);
}
```

`frontend/src/lib/offerChart.js`: `buildOfferSeries(offers, windowStart)` calls `filterPriceHistoryByWindow(offer.price_history, windowStart)`; update the import and JSDoc (`@param {number|null} windowStart - The selected range's window_start.`).

Point `ProductTable.jsx`, `ProductCardList.jsx`, `OfferStores.jsx` and `ProductRowActions.jsx` at `@/lib/offers`, then delete the old module and the contract tests:

```bash
git rm frontend/src/lib/bestOffer.js frontend/src/lib/bestOffer.test.js frontend/src/lib/bestOffer.contract.test.js frontend/src/lib/productHistory.contract.test.js
```

- [ ] **Step 4: Run the lib tests**

Run: `npx vitest run src/lib`
Expected: all pass except `contracts.test.js`, which imports `RANGE_OPTIONS`; delete that import and its `offers exactly the window options as chart ranges` case (the file goes away in Task 9).

- [ ] **Step 5: Write the failing page and chart tests**

`PriceHistoryChart.test.jsx`: every render passes `rangeKeys={['30', '60', '90', '180', 'all']}`. Add:

```jsx
it('offers exactly the ranges the backend sends', () => {
  renderChart({ rangeKeys: ['30', 'all'] });
  expect(screen.getByRole('radio', { name: '30 days' })).toBeInTheDocument();
  expect(screen.getByRole('radio', { name: 'All' })).toBeInTheDocument();
  expect(screen.queryByRole('radio', { name: '60 days' })).not.toBeInTheDocument();
});
```

(`renderChart` is the file's existing render helper; if the segmented control items are not exposed as `radio`, use the same query the file already uses for the range options.)

`ProductPage.test.jsx`: extend the `PriceHistoryChart` stub so tests can change the range:

```jsx
    PriceHistoryChart: ({
      hasEnoughHistory,
      hasEnoughTotalHistory,
      rangeKeys,
      onRangeChange
    }) => (
      <div
        data-testid="price-history-chart-stub"
        data-has-enough-history={String(hasEnoughHistory)}
        data-has-enough-total-history={String(hasEnoughTotalHistory)}
      >
        {rangeKeys?.map((key) => (
          <button key={key} type="button" onClick={() => onRangeChange(key)}>
            {`range-${key}`}
          </button>
        ))}
      </div>
    )
```

and add:

```jsx
  const backendRanges = [
    { key: '30', window_start: 0, average: 111, price_change_pct: -10, lowest: null },
    { key: '60', window_start: 0, average: 222, price_change_pct: 5, lowest: null },
    { key: '90', window_start: 0, average: 333, price_change_pct: null, lowest: null },
    { key: '180', window_start: 0, average: 444, price_change_pct: null, lowest: null },
    { key: 'all', window_start: null, average: 555, price_change_pct: null, lowest: null }
  ];

  it('shows the stats of the backend range, starting from its default', async () => {
    productsApi.get.mockResolvedValue(
      buildProduct({ default_range: '90', ranges: backendRanges })
    );

    renderProductPage();

    expect(await screen.findByText('$333.00')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'range-30' }));
    expect(screen.getByText('$111.00')).toBeInTheDocument();
  });

  it('keeps the range the user picked when the product is refetched', async () => {
    productsApi.get.mockResolvedValue(
      buildProduct({ default_range: '60', ranges: backendRanges })
    );
    renderProductPage();
    await screen.findByText('$222.00');
    await userEvent.click(screen.getByRole('button', { name: 'range-30' }));

    await act(() => useProductsStore.getState().fetchDetail('7'));

    expect(screen.getByText('$111.00')).toBeInTheDocument();
  });

  it('names the store of the lowest price the backend found', async () => {
    const detail = buildMultiStoreDetail();
    const ranges = detail.ranges.map((range) => ({
      ...range,
      lowest: { price: 150, timestamp: range.window_start ?? 0, offer_id: 2 }
    }));
    productsApi.get.mockResolvedValue({ ...detail, id: 7, ranges });

    renderProductPage();

    expect(await screen.findByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText(/at Thomann/i)).toBeInTheDocument();
  });
```

(import `act` from `@testing-library/react`). Update the existing tests that depended on the frontend computing stats or on `hist_window_size`: `ignores out-of-stock records in the stats...` now asserts that the page shows `N/A` when the selected range's `price_change_pct` is `null` (set it via `ranges`); `treats a range with fewer than 2 filtered points...` keeps working because `singleStoreDetail` computes `window_start` from the history; any test that set `configApi.get` to change the default range must set `default_range` on the product instead. The "at Thomann" text comes from `pages.product.stats.atStore`; if the English copy differs, use that key's English text.

- [ ] **Step 6: Run them to verify they fail**

Run: `npx vitest run src/pages/ProductPage.test.jsx src/components/product/PriceHistoryChart.test.jsx`
Expected: FAIL (`rangeKeys` is ignored; stats still computed locally)

- [ ] **Step 7: Implement the chart and the page**

`PriceHistoryChart.jsx`: drop the `RANGE_OPTIONS` import (keep `RANGE_ALL`), add a `rangeKeys` prop (JSDoc: "The backend's range keys, `ProductDetailResponse.ranges[].key`"), and build the items from it:

```jsx
  const rangeItems = useMemo(
    () =>
      rangeKeys.map((key) =>
        key === RANGE_ALL
          ? { value: key, label: t('pages.product.chart.rangeAll') }
          : { value: key, label: t('pages.product.chart.rangeOption', { days: key }) }
      ),
    [rangeKeys, t]
  );
```

Update the `range` / `average` / `lowest` JSDoc to say they come from the backend's selected range.

`ProductStatsRow.jsx`: replace the "its caller recomputes..." JSDoc sentence with "Every range-dependent value is the backend's statistics of the chart's selected range (`ProductDetailResponse.ranges`)."

`ProductPage.jsx`:

1. Imports: remove `@/lib/bestOffer`, `@/lib/histWindow`, `useConfigStore`, and import from `@/lib/productHistory` only `RANGE_ALL`, `getTrackingStartTimestamp`, `hasEnoughHistory as hasEnoughHistoryPoints`.
2. Remove `config`, `fetchConfig`, `histWindowSize`, the `fetchConfig` effect and the `histWindowSize` range effect.
3. Replace the range state with:

```jsx
  // The range the user picked; `null` follows the backend's `default_range`.
  // Reset when navigating to another product, kept across refetches.
  const [pickedRange, setPickedRange] = useState(null);
  useEffect(() => {
    setPickedRange(null);
  }, [productId]);
  const handleRangeChange = (value) => setPickedRange(value);
```

   and delete `userChangedRangeRef`.
4. Replace the block from `const offers = useMemo(...)` to `const lowest = useMemo(...)` with:

```jsx
  // The backend values the product by its best offer and precomputes every
  // range's stats (`ProductDetailResponse.ranges`); the page only picks one.
  const offers = useMemo(() => product?.offers ?? [], [product]);
  const bestOfferId = product?.best_offer_id ?? null;
  const bestOffer =
    offers.find((offer) => offer.id === bestOfferId) ?? offers[0] ?? null;
  const ranges = useMemo(() => product?.ranges ?? [], [product]);
  const rangeKeys = useMemo(() => ranges.map((r) => r.key), [ranges]);
  const range = pickedRange ?? product?.default_range ?? RANGE_ALL;
  const selectedRange = ranges.find((r) => r.key === range) ?? null;
  const windowStart = selectedRange?.window_start ?? null;
  const isMultiStore = offers.length > 1;
  const storeNameOf = (offerId) =>
    offers.find((offer) => offer.id === offerId)?.store_name ?? null;
  // One line per store; the chart plots when any store has 2+ points in
  // the range. The total history decides which message replaces it: "not
  // enough data in this range" when a longer range would plot, "tracking
  // started" otherwise.
  const series = useMemo(
    () => buildOfferSeries(offers, windowStart),
    [offers, windowStart]
  );
  const yDomain = useMemo(() => seriesYDomain(series), [series]);
  const hasEnoughHistory = series.some((s) => hasEnoughHistoryPoints(s.points));
  const hasEnoughTotalHistory = offers.some((offer) =>
    hasEnoughHistoryPoints(offer.price_history)
  );
  const average = selectedRange?.average ?? null;
  const currentVsAverage = selectedRange?.price_change_pct ?? null;
  const lowest = selectedRange?.lowest ?? null;
```

5. `<StockStatus inStock={product.is_in_stock} />`; `lowestStoreName={isMultiStore && lowest ? (storeNameOf(lowest.offer_id) ?? undefined) : undefined}`; pass `rangeKeys={rangeKeys}` to `PriceHistoryChart`.

- [ ] **Step 8: Run the unit suite and lint**

Run: `npx vitest run && npm run lint`
Expected: all pass, no lint errors (unused imports removed)

- [ ] **Step 9: Run e2e**

Run: `npm run test:e2e`
Expected: all pass, snapshots unchanged (fixtures from Task 5 carry the same numbers the page used to compute)

- [ ] **Step 10: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(frontend): show the product detail stats the backend precomputes"
```

---

### Task 8: Settings take the options from the backend

**Files:**
- Modify: `frontend/src/components/settings/AnalysisSection.jsx` (+ test), `NotificationsSection.jsx` (+ test), `frontend/src/pages/SettingsPage.jsx`
- Modify: `frontend/src/lib/settingsDraft.js` (+ test)
- Delete: `frontend/src/lib/histWindow.js`, `frontend/src/lib/dailyCheckReport.js`

**Interfaces:**
- Consumes: `config.hist_window_options`, `config.daily_check_report_options` (Task 3, fixtures from Task 5).
- Produces: `<AnalysisSection histWindowOptions={number[]} ... />`, `<NotificationsSection dailyCheckReportOptions={string[]} ... />`.

- [ ] **Step 1: Update the tests first**

`AnalysisSection.test.jsx`: every render passes `histWindowOptions={[30, 60, 90, 180]}`; add:

```jsx
it('offers exactly the window options the backend sends', async () => {
  renderSection({ histWindowOptions: [30, 90], histWindowSize: 30 });
  await userEvent.click(screen.getByRole('combobox', { name: /historical window/i }));
  expect(screen.getByRole('option', { name: '30 days' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: '90 days' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: '60 days' })).not.toBeInTheDocument();
});
```

(`renderSection` is the file's existing helper; reuse the exact combobox/option queries and labels the file already uses.) Delete any test asserting that an off-list `histWindowSize` shows the default: the backend never sends one now.

`NotificationsSection.test.jsx`: pass `dailyCheckReportOptions={['off', 'limit_days', 'every_day']}` and add the analogous "offers exactly the report options the backend sends" case with `['off', 'every_day']`.

`settingsDraft.test.js`: delete the cases where `draftFromConfig` corrects an off-list `hist_window_size` or `daily_check_report`; add:

```js
it('copies the window and the report mode as the backend sends them', () => {
  const draft = draftFromConfig({ ...baseConfig, hist_window_size: 90, daily_check_report: 'off' });
  expect(draft.hist_window_size).toBe(90);
  expect(draft.daily_check_report).toBe('off');
});
```

(`baseConfig` is the file's existing config fixture; use `buildConfig()` from `e2e/fixtures/config` if there is none.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/components/settings src/lib/settingsDraft.test.js`
Expected: FAIL (the sections still render the hard-coded options)

- [ ] **Step 3: Implement**

`AnalysisSection.jsx`: remove the `@/lib/histWindow` import, add the `histWindowOptions` prop (JSDoc: "`config.hist_window_options`"), use `const selectedHistWindow = histWindowSize.toString();` and build the collection from `histWindowOptions.map(...)` with `[histWindowOptions, t]` as `useMemo` deps. Update the `histWindowSize` JSDoc to "In days; one of `histWindowOptions`."

`NotificationsSection.jsx`: remove the `@/lib/dailyCheckReport` import, add the `dailyCheckReportOptions` prop, build `dailyReportCollection` from it with `[dailyCheckReportOptions, t]` deps; JSDoc `dailyCheckReport` → "One of `dailyCheckReportOptions`."

`SettingsPage.jsx`: pass `histWindowOptions={config.hist_window_options}` to `AnalysisSection` and `dailyCheckReportOptions={config.daily_check_report_options}` to `NotificationsSection`.

`settingsDraft.js`: remove both `resolve*` imports; `hist_window_size: config.hist_window_size` and `daily_check_report: config.daily_check_report`; remove the "a `hist_window_size` outside the offered options..." sentence from `draftFromConfig`'s JSDoc.

Delete the modules and check nothing else imports them:

```bash
git rm frontend/src/lib/histWindow.js frontend/src/lib/dailyCheckReport.js
grep -rn "histWindow'\|dailyCheckReport'" frontend/src
```

Expected: only `src/lib/contracts.test.js` (deleted in Task 9); delete its `./histWindow` and `./dailyCheckReport` imports and its `hist-window contract` and `daily-check-report contract` blocks now so the suite runs.

- [ ] **Step 4: Run the unit suite, lint and e2e**

Run: `npx vitest run && npm run lint && npm run test:e2e`
Expected: all pass. Settings page tests whose config mock lacks the new fields (`SettingsPage.test.jsx`, `SettingsPage.language.test.jsx`, `SettingsPage.leaveGuard.test.jsx`, `TelegramSetup*.test.jsx`, `AppShell.test.jsx`, `configStore.test.js`, `api/config.test.js`) must build their config with `buildConfig()` from `e2e/fixtures/config` or add `hist_window_options` and `daily_check_report_options`; snapshots unchanged.

- [ ] **Step 5: Commit**

```bash
git add -A frontend/src
git commit -m "refactor(frontend): take the settings options from the backend"
```

---

### Task 9: Delete the contracts and update the docs

**Files:**
- Move: `contracts/price-stats-cases.json` → `backend/tests/cases/price-stats-cases.json`; `contracts/best-offer-cases.json` → `backend/tests/cases/best-offer-cases.json`
- Create: `backend/tests/case_utils.py`
- Rename: `backend/tests/test_price_stats_contract.py` → `test_price_stats_cases.py`; `test_best_offer_contract.py` → `test_best_offer_cases.py`
- Delete: `contracts/`, `backend/tests/contract_utils.py`, `backend/tests/test_contracts.py`, `frontend/src/lib/contracts.test.js`, `frontend/src/test/contracts.js`
- Modify: docstrings in `backend/src/services/price_stats.py`, `best_offer.py`, `backend/src/schemas/product.py`
- Modify: `README.md`, `backend/README.md`, `frontend/README.md`, `AGENTS.md`

- [ ] **Step 1: Move the backend cases**

```bash
mkdir -p backend/tests/cases
git mv contracts/price-stats-cases.json backend/tests/cases/price-stats-cases.json
git mv contracts/best-offer-cases.json backend/tests/cases/best-offer-cases.json
git mv backend/tests/test_price_stats_contract.py backend/tests/test_price_stats_cases.py
git mv backend/tests/test_best_offer_contract.py backend/tests/test_best_offer_cases.py
git rm backend/tests/contract_utils.py backend/tests/test_contracts.py
git rm -r contracts
git rm frontend/src/lib/contracts.test.js frontend/src/test/contracts.js
```

In both JSON files, change the `"description"` so it no longer mentions `contracts/README.md` (e.g. `"Best offer and product-level stock / at-lowest rules (backend/src/services/best_offer.py)."`).

`backend/tests/case_utils.py`:

```python
"""Helpers to read the table-driven test cases in ``tests/cases/``."""

import json
from pathlib import Path

CASES_DIR = Path(__file__).resolve().parent / "cases"


def load_cases(name: str) -> dict:
    """Load one cases JSON file.

    Args:
        name (str): File name inside ``tests/cases/`` (e.g. ``"best-offer-cases.json"``).

    Returns:
        dict: The parsed JSON document.
    """
    with (CASES_DIR / name).open(encoding="utf-8") as file:
        return json.load(file)
```

In the two renamed test files: import `load_cases` from `tests.case_utils` instead of `load_contract`, rename `CONTRACT` → `CASES`, rename the test functions (`test_price_stats_cases`, `test_dashboard_summary_follows_the_price_stats_cases`, `test_best_offer_cases`), and rewrite the module docstrings: "Table-driven cases (``tests/cases/price-stats-cases.json``) for ``src/services/price_stats.py``" and the same for best offer, with no frontend mention.

- [ ] **Step 2: Clean the backend docstrings**

- `price_stats.py`: first line "Price statistics of a price history over a window." and drop the "(and mirrored by the frontend)" / "The same rules are implemented in ``frontend/...`` and both implementations are pinned by ``contracts/...``" sentences.
- `best_offer.py`: drop "Mirrored by ``frontend/src/lib/bestOffer.js``; both are pinned by ``contracts/...``".
- `schemas/product.py`: drop every "Pinned by ``contracts/api-fields.json``" / "Field names are pinned by ..." sentence.

Then check: `grep -rn "contracts\|mirror\|frontend/src" backend/src backend/tests`
Expected: no hits.

- [ ] **Step 3: Run the backend suite**

Run: `uv run pytest -q`
Expected: all pass

- [ ] **Step 4: Update the docs**

- `AGENTS.md`: add a bullet: "- The backend is the single source of truth for business logic; the frontend only presents backend data (formatting, filtering, sorting, charts, display aggregates)."
- `README.md` and `backend/README.md`: remove the sections about `contracts/` and shared contracts; where they described the rule, state that the backend computes every business value (best offer, price statistics per range, staleness, config options) and the frontend only presents it. Mention `backend/tests/cases/` as the table-driven cases for the price and best-offer rules.
- `frontend/README.md`: state that `src/lib/` holds presentation helpers only (formatting, filters/sorts over backend fields, chart geometry, display aggregates), and that `e2e/fixtures/backendFields.js` is a test-only stand-in to keep mocked responses consistent.

Then check: `grep -rn "contracts" README.md backend/README.md frontend/README.md AGENTS.md frontend/src frontend/e2e`
Expected: no hits (older specs and plans under `docs/` are historical and stay as they are).

- [ ] **Step 5: Full verification**

Run from the repo root: `just lint && just test && just test-e2e`
Expected: lint clean, pytest and vitest all pass, Playwright all pass with unchanged snapshots.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: delete the shared contracts now that the backend is the only source of truth"
```
