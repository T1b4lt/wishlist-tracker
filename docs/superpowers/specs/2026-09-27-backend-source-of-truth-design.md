# Backend as the Single Source of Truth — Design

- **Date:** 2026-09-27
- **Branch:** `refactor/backend-source-of-truth`
- **Status:** Approved in brainstorming, pending spec review

## 1. Goal

Several business rules are implemented twice, in Python and in JavaScript,
and `contracts/` exists only to catch the two copies drifting apart. One
rule (staleness) exists only in the frontend. This refactor makes the
backend the single source of truth for every business rule: the backend
hands the frontend everything already computed, and the frontend only
presents it (formats, filters, sorts, draws, and at most aggregates
backend-provided fields for display, like the dashboard summary strip).

### Success criteria

- No business rule is implemented in the frontend. The frontend keeps only
  presentation logic: formatting, search/filter/sort over backend fields,
  chart geometry, and display aggregates of backend fields.
- `contracts/` is deleted, together with every contract test and helper.
- The UI shows exactly the same numbers and states as before, including the
  product detail's range selector, which stays instant (no refetch).
- `just test` (pytest + vitest) and the Playwright e2e suite pass; visual
  snapshots do not change.

### Constraints / decisions

- **No backward compatibility, no migrations.** The project is in
  development; the database may be recreated.
- **Range statistics are precomputed** for every range option in the
  product detail response, so the range selector never refetches.
- **The dashboard summary strip stays in the frontend.** It only counts and
  sums backend fields (`current_price`, `currency`, `price_change_pct`,
  `is_at_lowest`, `is_stale`) and holds no rule of its own.
- **Staleness is computed at request time.** A page left open does not
  update its stale badges until the data is refetched; this is acceptable.

## 2. Inventory: what moves and what stays

| Rule | Frontend today | Backend today | After |
| --- | --- | --- | --- |
| Range stats (average, change vs. average) | `productHistory.computeRangeStats` | `price_stats.compute_window_stats` (dashboard only) | Backend, per range, in product detail |
| Lowest across stores in a range | `bestOffer.computeLowestAcrossOffers` | — (only a min price inside `compute_product_offer_stats`) | Backend `best_offer.lowest_across_offers` |
| Best offer, product stock | `bestOffer.selectBestOffer`, `computeProductOfferStats` | `best_offer.py` | Backend, in product detail |
| History window cutoff | `productHistory.filterPriceHistoryByRange` (days) | `price_stats.filter_window` | Backend sends `window_start`; frontend only compares timestamps |
| Default range | `productHistory.resolveDefaultRange` | `get_hist_window_size` | Backend `default_range` |
| Staleness (3 days) | `staleness.js` | — | Backend `services/staleness.py` |
| Hist window options/default | `histWindow.js` | `core/config.py` | Backend, in `GET /config/` |
| Daily check report options/default | `dailyCheckReport.js` | `core/config.py` | Backend, in `GET /config/` |
| Config value fallbacks | `settingsDraft.draftFromConfig` | `ConfigUpdate` validation | Backend always returns valid values |
| API field names | `contracts/api-fields.json` | Pydantic schemas | Pydantic schemas / OpenAPI only |

Stays in the frontend (presentation): `format.js`, `productFilters.js`
(filters and sorts over backend fields), `offerChart.js`, chart point
building and Y domain, `dashboardSummary.js`, `findBestOfferSummary`
(a plain lookup by `best_offer_id`), colors and badges.

## 3. Backend API changes

### 3.1 Staleness — `backend/src/services/staleness.py` (new)

Pure functions, no database access.

```python
STALE_AFTER_DAYS = 3

def days_since_check(last_checked_at: int | None, now: int) -> int | None
    # Whole days since the last check, never negative; None if never checked.

def is_stale(last_checked_at: int | None, now: int) -> bool
    # days_since_check(...) is not None and >= STALE_AFTER_DAYS.

def product_stale_days(offers_last_checked: list[int | None], now: int) -> int | None
    # Days of the stalest stale offer (max days among stale offers);
    # None when no offer is stale.
```

Products never checked are not stale (same rule as today).

Schema changes (`backend/src/schemas/product.py`):

- `OfferSummary` (and therefore `OfferDetail`) adds
  `days_since_check: int | None` and `is_stale: bool`.
- `ProductDashboardSummary` and `ProductDetailResponse` add
  `is_stale: bool` (any offer stale) and `stale_days: int | None`
  (`product_stale_days`).

`_offer_summary_fields` receives `now` and fills the two offer fields;
`get_detail` gains a `now: int | None = None` parameter like
`get_dashboard_summary`.

### 3.2 Product detail with precomputed ranges

`ProductDetailResponse` adds:

```python
best_offer_id: int | None
is_in_stock: bool | None          # any offer's current record in stock
default_range: RangeKey           # str(get_hist_window_size(session))
ranges: list[RangeStats]          # always in order: 30, 60, 90, 180, all

RangeKey = Literal["30", "60", "90", "180", "all"]

class LowestPrice(BaseModel):
    price: float
    timestamp: int
    offer_id: int

class RangeStats(BaseModel):
    key: RangeKey
    window_start: int | None      # now - days * 86400; None for "all"
    average: float | None
    price_change_pct: float | None
    lowest: LowestPrice | None
```

Rules (unchanged from what the frontend computes today):

- `best_offer_id` and `is_in_stock` follow `best_offer.compute_product_offer_stats`
  (neither depends on the range).
- `average` and `price_change_pct` are `price_stats.compute_window_stats`
  of the **best offer's** window records, with `current` being the best
  offer's newest record of its full history.
- `lowest` is the cheapest in-stock record of **any offer** inside the
  window, the most recent one on price ties, with the offer it belongs to.
  New pure function in `best_offer.py`:

  ```python
  def lowest_across_offers(offers: list[OfferHistory], window_days: int | None, now: int) -> LowestRecord | None
  ```

  `compute_product_offer_stats` reuses it for its at-lowest check, so the
  rule exists once.
- The range keys are derived from `HIST_WINDOW_OPTIONS` plus `"all"`, so
  adding an option in `core/config.py` adds a range automatically.
- `is_at_lowest` per range is **not** included: the detail page does not
  show it (YAGNI).

### 3.3 Config

- `get_hist_window_size` returns `DEFAULT_HIST_WINDOW` for any stored value
  that is not in `HIST_WINDOW_OPTIONS` (today it returns positive values
  outside the options as-is). `get_daily_check_report` already does the
  same for `daily_check_report`; `GET /config/` must use both helpers.
- `ConfigResponse` types `hist_window_size` as `HistWindowSize` and
  `daily_check_report` as `DailyCheckReport`, and adds read-only fields:

  ```python
  hist_window_options: list[int]          # HIST_WINDOW_OPTIONS
  daily_check_report_options: list[str]   # DAILY_CHECK_REPORT_OPTIONS
  stale_after_days: int                   # STALE_AFTER_DAYS
  ```

- `ConfigUpdate` is unchanged (the new fields are not writable).

### 3.4 Docstrings

Every "mirrored by the frontend" / "pinned by `contracts/...`" mention in
`price_stats.py`, `best_offer.py`, `core/config.py` and
`schemas/product.py` is removed. `ProductDetailResponse`'s docstring no
longer says range statistics are computed by the frontend.

## 4. Frontend changes

### 4.1 Deleted

- `src/lib/histWindow.js`, `src/lib/dailyCheckReport.js`,
  `src/lib/staleness.js` (and their tests).
- `src/lib/bestOffer.js` rules and tests; `findBestOfferSummary` moves to
  `src/lib/offers.js` (with its test).
- `src/lib/contracts.test.js`, `src/lib/bestOffer.contract.test.js`,
  `src/lib/productHistory.contract.test.js`, `src/test/contracts.js`.
- From `src/lib/productHistory.js`: `computeRangeStats`,
  `getCurrentRecord`, `RANGE_OPTIONS`, `resolveDefaultRange` and the
  day-based cutoff.

### 4.2 `src/lib/productHistory.js` (chart only)

- `filterPriceHistoryByWindow(priceHistory, windowStart)`: sorts ascending
  and keeps records with `timestamp >= windowStart`; `windowStart === null`
  keeps everything. Replaces `filterPriceHistoryByRange`.
- Keeps `buildChartPoints`, `computeYDomain`, `hasEnoughHistory`,
  `getTrackingStartTimestamp`.
- `offerChart.buildOfferSeries(offers, windowStart)` takes the window start
  instead of a range.

### 4.3 `ProductPage.jsx`

- Range options: `product.ranges.map((r) => r.key)`; `"all"` keeps its
  current label. Default range: `product.default_range`. The "user changed
  the range" behavior is kept (reset when `productId` changes).
- `const selected = product.ranges.find((r) => r.key === range)`; the
  stats row takes `average`, `price_change_pct` (as `currentVsAverage`) and
  `lowest` from it; `lowest.offer_id` gives the lowest store's name.
- `bestOfferId`, product stock and the stale notices come from
  `product.best_offer_id`, `product.is_in_stock` and
  `offers.filter((o) => o.is_stale)` (with `o.days_since_check`).
- The chart is filtered with `selected.window_start`.
- The page no longer reads `hist_window_size` from the config store.

### 4.4 Stale UI

- `StaleBadge` takes `days: number | null` and renders when it is a number;
  callers pass it only for stale items (`product.stale_days`). No `now`
  prop, no threshold check.
- `StaleProductNotice` takes `days` (the offer's `days_since_check`) the
  same way; callers render it only for `offer.is_stale`.
- `ProductTable` / `ProductCardList`: badge from `product.stale_days`,
  tooltip stores from `product.offers.filter((o) => o.is_stale)`.
- `productFilters`: the stale filter checks `product.is_stale`;
  `checked_desc` sorts by the oldest `last_checked_at` of the offers
  (inline `Math.min`, raw data ordering).
- `dashboardSummary.staleCount` counts `product.is_stale`; the function
  loses its `now` parameter.
- `ProductFilterPanel`'s stale label uses `config.stale_after_days`
  (the dashboard already fetches the config; the prop is passed down).

### 4.5 Settings

- `AnalysisSection` builds its options from `config.hist_window_options`;
  `NotificationsSection` from `config.daily_check_report_options`. Labels
  keep coming from i18n keys per value.
- `settingsDraft.draftFromConfig` copies `hist_window_size` and
  `daily_check_report` as-is (no fallback).

## 5. Contracts removal

- Delete `contracts/` (README and the five JSON files).
- Move `price-stats-cases.json` and `best-offer-cases.json` to
  `backend/tests/cases/` and keep `test_price_stats_contract.py` and
  `test_best_offer_contract.py` running them, renamed to
  `test_price_stats_cases.py` / `test_best_offer_cases.py`; the case
  loader becomes a small helper in `backend/tests/` (replacing
  `contract_utils.py`).
- Delete `backend/tests/test_contracts.py` and `contract_utils.py`. The
  hist-window, daily-check-report and field-name contracts are replaced by
  endpoint tests on the real responses.
- Build and tooling files (`justfile`, `Dockerfile`, `.dockerignore`,
  Vite and ESLint configs) do not reference `contracts/`; nothing to change
  there.

## 6. Error handling

No new error paths. `get_detail` still returns 404 for an unknown product.
A product without history returns `best_offer_id = None`,
`is_in_stock = None`, `is_stale = False`, `stale_days = None`, and every
range with `average`, `price_change_pct` and `lowest` set to `None`;
`window_start` is still filled. The frontend already renders "-" for
missing stats.

## 7. Testing

Backend (pytest):

- `staleness.py`: never checked, 2 days 23 h (not stale), exactly 3 days
  (stale), future timestamp (0 days), `product_stale_days` with mixed
  offers.
- `lowest_across_offers`: out-of-stock records ignored, most recent on
  ties, window boundary, several offers; the moved best-offer cases still
  pass.
- `GET /products/{id}`: five ranges in order with correct `window_start`,
  `default_range` following the config, stats of the best offer, `lowest`
  across stores with `offer_id`, `best_offer_id`, `is_in_stock`, stale
  fields on offers and product, a product without history.
- `GET /products/dashboard-summary`: stale fields.
- `GET /config/`: the three option fields; an invalid stored
  `hist_window_size` returns the default.

Frontend (vitest): update the tests of every changed module and component;
new tests for `filterPriceHistoryByWindow`, `offers.findBestOfferSummary`,
and `ProductPage` taking stats, default range and stale notices from the
response.

E2E (Playwright): update `e2e/fixtures/products.js` and
`e2e/fixtures/config.js` with the new fields (fixtures must now carry the
precomputed ranges and stale flags matching their histories). All specs
pass and visual snapshots are unchanged.

## 8. Documentation

- `README.md` and `backend/README.md`: remove the `contracts/` sections;
  describe the rule that the backend computes every business value.
- `frontend/README.md`: state that `src/lib/` holds presentation helpers
  only.
- `AGENTS.md`: add "The backend is the single source of truth for business
  logic; the frontend only presents backend data (formatting, filtering,
  sorting, charts, display aggregates)."
- Older specs and plans under `docs/` are historical and are not edited.
