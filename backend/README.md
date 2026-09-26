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
`url`, `recent_prices` and `last_checked_at` on the product endpoints (see
"API Reference" in the root README).

The suite also runs on `git push` through the pre-commit `pre-push` hook
(see "Git Hooks" in the root README).
