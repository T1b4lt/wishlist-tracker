# Backend

## Testing

Tests use [pytest](https://docs.pytest.org) with FastAPI's `TestClient`,
against an isolated in-memory SQLite database (never the real
`db/database.db`).

```bash
uv run pytest
```

Shared fixtures (`session`, `client`) live in `tests/conftest.py`.
