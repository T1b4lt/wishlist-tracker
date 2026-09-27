# Backend

## Testing

Tests use [pytest](https://docs.pytest.org) with FastAPI's `TestClient`,
against an isolated in-memory SQLite database (never the real
`db/database.db`).

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
(`test_extraction.py`). The price statistics formulas
(`src/services/price_stats.py`), the best-offer rules
(`src/services/best_offer.py`), window options and product response fields
are also pinned by the shared contracts in `../contracts/`
(`test_price_stats_contract.py`, `test_best_offer_contract.py`,
`test_contracts.py`); the cronjob, including the
once-per-day full run, the 10-minute retries of offers that hit the Gemini
quota and the daily run summary, is covered by `test_cronjob.py`; the
Telegram daily check report by `test_daily_report.py`; `GET /daily-check/` by
`test_daily_check.py`; and the local-day helpers by `test_local_day.py`.

Shared helpers to create products, offers and price history live in
`tests/factories.py`.
