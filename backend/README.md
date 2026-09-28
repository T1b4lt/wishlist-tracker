# Backend

## Testing

Tests use [pytest](https://docs.pytest.org) with FastAPI's `TestClient`,
against an isolated in-memory SQLite database (never the real
`db/database.db`; the migration tests use temporary files).

```bash
uv run pytest
```

Shared fixtures (`session`, `client`) live in `tests/conftest.py`. The suite
covers the response fields the frontend relies on, e.g. `product_count` on
`GET /categories/`, the derived `telegram_status` on `GET /config/`, and
the best-offer fields (`best_offer_id`, `recent_prices`, `price_change_pct`,
`is_at_lowest`) and the nested `offers` on the product endpoints (see "API
Reference" in the root README), the offer endpoints and product merge
(`test_offers.py`, `test_merge.py`), the store linking and favicon endpoint
(`test_stores.py`, `test_product_store.py`) and the favicon validation/extraction flow with
Stagehand mocked, including the Gemini quota error detection
(`test_extraction.py`). The backend computes every business value the
frontend shows (best offer, price statistics of every chart range,
staleness, config options). The price statistics formulas
(`src/services/price_stats.py`) and the best-offer rules
(`src/services/best_offer.py`) are pinned by the table-driven cases in
`tests/cases/` (`test_price_stats_cases.py`, `test_best_offer_cases.py`);
the lowest price across stores by `test_lowest_across_offers.py`; the
staleness rules by `test_staleness.py`; the precomputed ranges of the product
detail by `test_product_detail_ranges.py`; the cronjob, including the
once-per-day full run, the 10-minute retries of offers that hit the Gemini
quota and the daily run summary, is covered by `test_cronjob.py`; the
check of a store right after it is added or its URL changes, and the manual
"check now" (`POST /offers/{id}/check`), by
`test_offer_check.py`; the
Telegram daily check report by `test_daily_report.py`; `GET /daily-check/` by
`test_daily_check.py`; the local-day helpers by `test_local_day.py`; and
the schema migrations (see [`migrations/README.md`](migrations/README.md)) by
`test_migrations.py`, which runs them on throwaway database files and fails
if they do not produce exactly the models' schema.

Shared helpers to create products, offers and price history live in
`tests/factories.py`.
