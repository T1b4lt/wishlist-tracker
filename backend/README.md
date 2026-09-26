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
`url`, `recent_prices`, `price_change_pct`, `is_at_lowest` and
`last_checked_at` on the product endpoints (see "API Reference" in the root
README), the store linking and favicon endpoint (`test_stores.py`,
`test_product_store.py`) and the favicon validation/extraction flow with
Stagehand mocked, including the Gemini quota error detection
(`test_extraction.py`). The price statistics formulas
(`src/services/price_stats.py`), window options and product response fields
are also pinned by the shared contracts in `../contracts/`
(`test_price_stats_contract.py`, `test_contracts.py`); the cronjob, including the
hourly retries of products that hit the Gemini quota, is covered by
`test_cronjob.py`.
