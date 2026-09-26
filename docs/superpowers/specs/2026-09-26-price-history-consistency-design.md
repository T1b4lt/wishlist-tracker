# Price History Consistency — Design

- **Date:** 2026-09-26
- **Branch:** `refactor/price-history-consistency`
- **Status:** Approved in brainstorming, pending spec review

## 1. Goal

The price-evolution feature (dashboard trend column, sparkline, summary strip,
product detail chart and stats, Telegram price alerts and the "historical
window size" setting) must give **one consistent answer everywhere**. Today the
same product shows different numbers on the dashboard and on its detail page,
the window means "records" in the backend and "days" in the frontend, and
out-of-stock or invalid scraped prices pollute every statistic.

### Success criteria

- For the same product and the same window, the dashboard's price change and
  the detail page's "current vs average" show the same value.
- The historical window is measured in **calendar days** everywhere (backend,
  frontend, settings copy, README).
- Out-of-stock records never affect averages, minimums, price changes,
  "at lowest" or price-drop alerts, but are still drawn on charts.
- The cron never stores an invalid price and never stores two records for the
  same product on the same day.
- Any divergence between the Python and JavaScript implementations of the
  shared formulas, constants or API field names makes a test fail.
- The dashboard summary endpoint issues a constant number of queries,
  independent of the number of products.

### Constraints / decisions

- **Window unit = calendar days.** A record is in the window when
  `timestamp >= now - window_days * 86400`.
- **Price change baseline excludes the current record.**
- **Out-of-stock records are excluded from statistics, not from charts.**
- **If the current record is out of stock**, the price change is `null` and
  the product is never "at lowest" nor counted as a price drop.
- **Invalid scraped prices** (non-finite or `<= 0`) are treated as a scraping
  failure: nothing is stored, no alert is sent.
- **One record per product per day**: if the product already has a record for
  today (process local time), the cron skips it without scraping.
- **Price-drop alert** fires only when the new price is in stock and lower
  than the **last in-stock** price.
- **Time zone** comes from the container's `TZ` environment variable
  (default UTC); `tzdata` is installed in the image.
- **Detail stats stay on the frontend** (range switching is instant); the
  dashboard stats are computed on the backend. Both implement the same
  formulas ("mirror formulas") and are pinned by shared contract fixtures.
- **Window options** `30, 60, 90, 180` (default `60`) are defined as a
  constant on each side and pinned by a shared contract fixture.
- **Breaking API change is fine**: frontend and backend ship together in the
  same image; no versioning, no DB migration.

### Out of scope

- Cleaning up duplicate records that already exist in databases.
- A time-zone setting in the UI.
- Pagination or down-sampling of the detail's `price_history`.
- The stock-change ("back in stock") alert logic.

## 2. Shared semantics

These rules are implemented identically in `backend/src/services/price_stats.py`
and `frontend/src/lib/productHistory.js`.

Definitions, given a product's full history, a `now` timestamp and
`window_days`:

| Term | Definition |
|---|---|
| **current** | The newest record of the full history (regardless of the window). |
| **window** | Records with `timestamp >= now - window_days * 86400`, ascending. |
| **valid** | Records with `is_in_stock = true`. |
| **baseline** | Valid window records, excluding *current*. |
| **average** | Mean price of *baseline*; `null` when *baseline* is empty. |
| **price change %** | `(current.price - average) / average * 100`; `null` when *current* is out of stock, *average* is `null`, or *average* `<= 0`. |
| **lowest** | Valid window records **including** *current* (if in the window and in stock); the minimum price, ties resolved to the **most recent** record. `null` when there are none. |
| **at lowest** | *current* is in stock, *lowest* is not `null` and `current.price <= lowest.price`. |

The detail page's "Average in range" stat and the chart's dashed "Average"
line both show *average* (the same baseline the % is computed against), so the
three numbers are mutually consistent. A `window_days` of `null` (the detail
range `all`) uses the full history as the window.

## 3. Backend

### 3.1 `src/services/price_stats.py` (new, pure)

Pure functions with no database access, operating on objects exposing
`price`, `is_in_stock`, `timestamp`:

- `filter_window(history, window_days, now) -> list` — ascending window
  (`window_days=None` keeps the full history).
- `compute_price_stats(history, window_days, now) -> PriceStats` — a small
  dataclass with `window`, `average`, `price_change_pct`, `lowest`,
  `is_at_lowest`, following section 2.

`product_service` stops owning `_compute_price_change`, `_get_recent_prices`
and `MAX_RECENT_PRICES`; it calls `price_stats` instead.

### 3.2 API contract

`ProductDashboardSummary`:

- `price_change_60d` → renamed **`price_change_pct`**.
- `recent_prices` → **all** window prices (in and out of stock), oldest
  first. The 60-point cap is removed.
- New **`is_at_lowest: bool`**.

`ProductDetailResponse`:

- `min_price` **removed** (unused by the frontend, which computes range stats).
- `price_history` unchanged: full history, ascending.

### 3.3 Dashboard query shape

`get_dashboard_summary` loads, in a constant number of queries:

1. all products;
2. all categories and all stores referenced (one query each);
3. all history records with `timestamp >= cutoff`, ordered by product and
   timestamp, grouped in memory;
4. the newest record per product (for *current* and `last_checked_at`, which
   may fall outside the window) via a grouped subquery.

A test asserts the query count does not grow with the number of products.

### 3.4 Configuration

- `src/core/config.py` gains `HIST_WINDOW_OPTIONS = (30, 60, 90, 180)` and
  `DEFAULT_HIST_WINDOW = 60`; `CONFIG_DEFAULTS["hist_window_size"]` derives
  from it.
- New helper `get_hist_window_size(session) -> int`: returns the stored value
  when it parses as an int, otherwise `DEFAULT_HIST_WINDOW`. Replaces the
  three `int(get_config_value(..., "hist_window_size", ...))` call sites.
- `ConfigUpdate.hist_window_size: Literal[30, 60, 90, 180] | None`. Invalid
  values are rejected with a Pydantic **422**; the manual 30–180 range check
  in `config_service` is removed.
- A stored off-list value (e.g. `45`, from before this change) is still used
  as-is for calculations; the settings UI shows the default until saved.

### 3.5 Cron (`product_status_cronjob.py`)

Per product, in order:

1. **Skip** if the product already has a record whose timestamp falls on
   today's local date. Logged as skipped (not an error).
2. Scrape. If `price` is not finite or `<= 0`, log an error, increment
   `error_count`, store nothing, send no alert.
3. Price-drop alert: fetch the **last in-stock** record; alert only if the new
   status is in stock and its price is lower than that record's price.
4. Stock alert: unchanged (compares with the last record).
5. Store the record.

### 3.6 Time zone

- `Dockerfile`: install `tzdata`; set `ENV TZ=UTC`.
- `entrypoint.sh` already dumps the environment for cron, so `TZ` reaches the
  cron job.
- README documents `docker run -e TZ=Europe/Madrid ...`.

## 4. Frontend

### 4.1 `src/lib/histWindow.js` (new)

Exports `HIST_WINDOW_OPTIONS = [30, 60, 90, 180]` and
`DEFAULT_HIST_WINDOW = 60`. Used by:

- `AnalysisSection` (replaces `HIST_WINDOW_VALUES`);
- `productHistory.js`: `RANGE_OPTIONS` derived as strings;
- `ProductPage`: default for `histWindowSize` before config loads.

`resolveDefaultRange(histWindowSize)` returns `String(histWindowSize)` when it
is one of the options, otherwise `String(DEFAULT_HIST_WINDOW)`.

### 4.2 Dashboard

- Rename `price_change_60d` → `price_change_pct` in `ProductTable`,
  `ProductCardList`, `productFilters.js` (price-drop filter and sort),
  `dashboardSummary.js`, and all tests/fixtures.
- `isAtLowestPrice` is removed; `computeDashboardSummary` counts
  `product.is_at_lowest === true` (`atLowestCount` is `null` when no product
  has any history).
- The column header "Price change ({{days}}D)" is now accurate.

### 4.3 Detail page

- `computeRangeStats(filteredHistory, current)` implements section 2, where
  `current` is the last record of the **full** history (so its stock status
  is known), not the loose `current_price`. It returns
  `{ lowest, average, currentVsAverage }` with the same shape as today.
- `ProductPage` passes the last full-history record as `current`.
- `PriceHistoryChart`: line `type="stepAfter"`; stock bands and tooltip
  unchanged.
- `computeYDomain` clamps the lower bound at `0`.

### 4.4 Copy

- "Historical window size" helper (EN/ES) states the window is in days and
  that out-of-stock checks are ignored in price statistics.

## 5. Shared contracts

New top-level directory `contracts/`, read **only by tests** on both sides
(not part of the Docker build nor the frontend bundle).

### 5.1 `contracts/price-stats-cases.json`

```json
{
  "tolerance": 1e-6,
  "cases": [
    {
      "name": "baseline excludes current",
      "now": 1000000,
      "window_days": 30,
      "history": [{ "timestamp": 0, "price": 10.0, "is_in_stock": true }],
      "expected": {
        "window_prices": [10.0],
        "average": null,
        "price_change_pct": null,
        "lowest": { "price": 10.0, "timestamp": 0 },
        "is_at_lowest": true
      }
    }
  ]
}
```

Cases cover at least: empty history; single record; window boundary
(exactly at cutoff is included); records outside the window; out-of-stock
records in the baseline; current out of stock; current outside the window;
average `<= 0`; tie on lowest (most recent wins); price above/below/equal to
the lowest; unsorted input.

- Backend: `tests/test_price_stats_contract.py` parametrizes over the cases
  and calls `price_stats.compute_price_stats`.
- Frontend: `src/lib/productHistory.contract.test.js` iterates the cases with
  `it.each` and calls `filterPriceHistoryByRange` + `computeRangeStats`.
- Floats compare with the file's `tolerance`.

### 5.2 `contracts/hist-window.json`

`{ "options": [30, 60, 90, 180], "default": 60 }`.

- Backend test: equals `HIST_WINDOW_OPTIONS`, the `Literal` args of
  `ConfigUpdate.hist_window_size`, `DEFAULT_HIST_WINDOW` and
  `CONFIG_DEFAULTS["hist_window_size"]`.
- Frontend test: equals `HIST_WINDOW_OPTIONS`, `DEFAULT_HIST_WINDOW` and
  `RANGE_OPTIONS` (as numbers).

### 5.3 `contracts/api-fields.json`

Field names of `ProductDashboardSummary`, `ProductDetailResponse` and
`ProductHistResponse`.

- Backend test: each schema's `model_fields` equals the listed set exactly.
- Frontend test: the e2e builders in `e2e/fixtures/products.js`
  (`buildDashboardProduct`, `buildProductDetail`, `buildHistoryPoint`)
  produce exactly the listed keys.

### 5.4 `contracts/README.md`

States that any change to a mirrored formula, a window option or an API field
starts by editing the contract JSON, then both implementations.

## 6. Testing

TDD: tests are written before each implementation change.

**Backend**

- `test_price_stats_contract.py` (5.1) plus Python-only edge cases.
- `test_contracts.py` (5.2, 5.3).
- `test_products.py`: `recent_prices` by days without cap,
  `price_change_pct`, `is_at_lowest`, `min_price` absent, constant query
  count for the dashboard summary.
- `test_config.py`: accepts every option, rejects `45` with 422, corrupt
  stored value falls back to 60.
- `test_cronjob.py` (new; Stagehand and Telegram mocked): invalid price not
  stored; same-day record skips the product without scraping; price-drop
  alert compares with last in-stock price and is not sent when the new status
  is out of stock.

**Frontend**

- `productHistory.contract.test.js` (5.1) and a contracts test (5.2, 5.3).
- Update `productHistory.test.js` (JS-only cases such as `null`/`NaN`
  inputs), `dashboardSummary.test.js`, `productFilters.test.js`,
  `AnalysisSection.test.jsx`, `ProductStatsRow.test.jsx`,
  `PriceHistoryChart.test.jsx`, page tests and e2e fixtures/mocks.
- Refresh visual snapshots affected by `stepAfter`.

## 7. Documentation

- `README.md`: `hist_window_size` described as days (30/60/90/180), `TZ`
  variable, how out-of-stock records affect statistics, `contracts/`
  directory in the project tree.
- `backend/README.md`: updated dashboard/detail fields.
- `contracts/README.md` (5.4).
