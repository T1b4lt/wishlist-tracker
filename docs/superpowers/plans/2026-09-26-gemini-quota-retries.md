# Gemini Quota Retries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Resume the products left by a Gemini quota error every 10 minutes for the rest of the day, record a per-day summary, show it on the dashboard and send a configurable Telegram daily report.

**Architecture:** The hourly cronjob becomes a 10-minute cronjob whose `main()` decides between the day's single full run (first tick at or after `analysis_hour` with no `DailyCheckRun` row for today) and a retry pass over `PendingStatusRetry`. A `DailyCheckRun` row per local day stores the snapshot (start, totals, first quota error, report sent). A read-only `GET /daily-check/` exposes today's status to a dashboard notice; a new `daily_check_report` config key (off / limit_days / every_day) drives a Telegram report sent once per day.

**Tech Stack:** Python 3.12, FastAPI, SQLModel/SQLite, python-telegram-bot, pytest; React 19, Chakra UI v3, zustand, i18next, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-26-gemini-quota-retries-design.md`

## Global Constraints

- No backward compatibility / no migrations: the database is recreated (`python -m src.setup_backend`).
- One record per product per **local** day (`TZ`); a lost day is never backfilled; pending retries from another day are dropped.
- Cron schedule: `*/10 * * * *`.
- `daily_check_report` values: `off` | `limit_days` | `every_day`; default `limit_days`; pinned by `contracts/daily-check-report.json`.
- End-of-day threshold: local time `>= 23:50`.
- Telegram report sent at most once per local day; `report_sent` set only after a successful send.
- Report messages localized in English and Spanish, following `selected_language`; times `HH:MM` in the process local time.
- All code, comments and docs in English. Backend commands run from `backend/` (`.venv/bin/pytest`, `.venv/bin/ruff`), frontend from `frontend/` (`npm test`, `npm run lint`, `npx playwright test`). Commits use Conventional Commits (a pre-commit hook enforces it).

## Review Focus

1. **Container started after `analysis_hour`** (e.g. at 18:00 with `analysis_hour=12`) → that day's full run happens on the first tick, exactly once. Pinned in Task 3 (`test_main_starts_the_daily_run_on_the_first_tick_after_the_analysis_hour` and `..._only_once_per_day`).
2. **Google API key missing at the analysis hour** → no `DailyCheckRun` row is created, so the full run is attempted again on the next tick once the key is saved. Pinned in Task 3 (`test_full_run_without_api_key_does_not_create_the_daily_run`).
3. **Telegram send fails** (network / wrong chat) → `report_sent` stays false and the next tick retries. Pinned in Task 5 (`test_failed_report_send_is_retried_next_run`).
4. **Products deleted during the day** → counts never go negative and "failed" never includes pending products. Pinned in Task 5 (`test_report_counts_never_go_negative_when_products_are_deleted`).
5. **Dashboard notice when `/daily-check/` fails or the store's API module is missing** → the dashboard renders normally with no notice and no uncaught error. Pinned in Task 6 (`renders nothing when the status request fails`).

---

## File Structure

**Backend (create)**
- `backend/src/core/local_day.py` — local-day bounds and `HH:MM` formatting shared by the cronjob, the service and the report.
- `backend/src/schemas/daily_check.py` — `DailyCheckStatusResponse`.
- `backend/src/services/daily_check_service.py` — today's status and counts (`get_status`, `count_today`).
- `backend/src/routers/daily_check_router.py` — `GET /daily-check/`.
- `backend/tests/test_local_day.py`, `backend/tests/test_daily_check.py`, `backend/tests/test_daily_report.py`.
- `contracts/daily-check-report.json`.

**Backend (modify)**
- `backend/src/models/database_models.py` — `DailyCheckRun`.
- `backend/src/product_status_cronjob.py` — daily run bookkeeping, new `main()`, report.
- `backend/src/telegram_utils.py` — report message builders + `send_daily_check_report`.
- `backend/src/core/config.py`, `backend/src/schemas/config.py`, `backend/src/services/config_service.py` — `daily_check_report`.
- `backend/src/api.py` — include the new router.
- `backend/tests/test_cronjob.py`, `backend/tests/test_contracts.py`, `backend/tests/test_config.py`.
- `contracts/api-fields.json`, `contracts/README.md`, `entrypoint.sh`, `README.md`, `backend/README.md`.

**Frontend (create)**
- `frontend/src/lib/api/dailyCheck.js` (+ test), `frontend/src/stores/dailyCheckStore.js` (+ test).
- `frontend/src/components/dashboard/DailyCheckNotice.jsx` (+ test).
- `frontend/src/lib/dailyCheckReport.js` — report options mirror of the contract.
- `frontend/e2e/fixtures/dailyCheck.js`.

**Frontend (modify)**
- `frontend/src/lib/api/index.js`, `frontend/src/lib/format.js` (+ test: `formatTime`).
- `frontend/src/components/dashboard/index.js`, `frontend/src/pages/DashboardPage.jsx` and the page tests that mock `@/lib/api` for the dashboard.
- `frontend/src/components/settings/NotificationsSection.jsx` (+ test), `frontend/src/pages/SettingsPage.jsx`, `frontend/src/lib/settingsDraft.js` (+ test).
- `frontend/src/lib/contracts.test.js`, `frontend/src/i18n/english.json`, `frontend/src/i18n/spanish.json`.
- `frontend/e2e/support/apiMock.js`, `frontend/e2e/fixtures/config.js`, `frontend/e2e/dashboard.spec.js`, `frontend/e2e/settings.spec.js`, visual snapshots.

---

### Task 0: Commit the already-implemented baseline

The working tree already contains (with passing tests) quota detection, `PendingStatusRetry`, the retry pass and least-recently-checked ordering (spec §2).

- [ ] **Step 1: Verify it is green**

Run (from `backend/`): `.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .`
Expected: `157 passed`, `All checks passed!`, `41 files already formatted`.

- [ ] **Step 2: Commit**

```bash
git add README.md backend/README.md backend/src/models/database_models.py backend/src/product_status_cronjob.py backend/src/stagehand_utils.py backend/tests/test_cronjob.py backend/tests/test_extraction.py
git commit -m "feat(backend): retry products left by a Gemini quota error, least recently checked first"
```

---

### Task 1: Shared local-day helpers

**Files:**
- Create: `backend/src/core/local_day.py`
- Create: `backend/tests/test_local_day.py`
- Modify: `backend/src/product_status_cronjob.py` (remove `_local_day_bounds`, import the shared one)

**Interfaces:**
- Produces: `local_day_bounds(now: datetime) -> tuple[int, int]`, `format_local_time(timestamp: int) -> str` (`"HH:MM"`), `END_OF_DAY = dt_time(23, 50)`, `is_end_of_day(now: datetime) -> bool`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_local_day.py`

```python
"""Tests for the local-day helpers shared by the cronjob and the API."""

from datetime import datetime, timedelta

import pytest
from src.core.local_day import format_local_time, is_end_of_day, local_day_bounds


def test_local_day_bounds_cover_the_whole_local_day():
    now = datetime(2026, 9, 26, 15, 30)
    start, end = local_day_bounds(now)

    assert start == int(datetime(2026, 9, 26).timestamp())
    assert end == int(datetime(2026, 9, 27).timestamp())


def test_local_day_bounds_are_the_same_for_every_moment_of_the_day():
    assert local_day_bounds(datetime(2026, 9, 26, 0, 0)) == local_day_bounds(
        datetime(2026, 9, 26, 23, 59, 59)
    )


def test_format_local_time_uses_hours_and_minutes():
    assert format_local_time(int(datetime(2026, 9, 26, 9, 5).timestamp())) == "09:05"


@pytest.mark.parametrize(
    ("moment", "expected"),
    [
        (datetime(2026, 9, 26, 23, 49), False),
        (datetime(2026, 9, 26, 23, 50), True),
        (datetime(2026, 9, 26, 23, 59), True),
        (datetime(2026, 9, 26, 12, 0), False),
    ],
)
def test_is_end_of_day_from_23_50(moment, expected):
    assert is_end_of_day(moment) is expected


def test_next_day_starts_where_the_previous_ends():
    today = datetime(2026, 9, 26, 12)
    assert local_day_bounds(today)[1] == local_day_bounds(today + timedelta(days=1))[0]
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_local_day.py -q`
Expected: collection error `ModuleNotFoundError: No module named 'src.core.local_day'`.

- [ ] **Step 3: Implement** — `backend/src/core/local_day.py`

```python
"""Local-day helpers shared by the cronjob, the API and the daily report.

"Local" is the process local time, set with the ``TZ`` environment variable
(the Docker image defaults to UTC). There is one price record per product
per local day.
"""

from datetime import datetime, timedelta
from datetime import time as dt_time

# From this time on, a run is the day's last chance to send the report.
END_OF_DAY = dt_time(23, 50)


def local_day_bounds(now: datetime) -> tuple[int, int]:
    """Return the Unix timestamps of the start of ``now``'s local day and the next.

    Args:
        now (datetime): A naive local datetime.

    Returns:
        tuple[int, int]: ``(start, end)`` with ``start <= t < end`` for
            every timestamp ``t`` of that day.
    """
    start = datetime.combine(now.date(), dt_time.min)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp())


def format_local_time(timestamp: int) -> str:
    """Format a Unix timestamp as local ``HH:MM``.

    Args:
        timestamp (int): Seconds since the epoch.

    Returns:
        str: The local time, e.g. ``"09:05"``.
    """
    return datetime.fromtimestamp(timestamp).strftime("%H:%M")


def is_end_of_day(now: datetime) -> bool:
    """Whether ``now`` is at or after ``END_OF_DAY``.

    Args:
        now (datetime): A naive local datetime.

    Returns:
        bool: True from 23:50 until midnight.
    """
    return now.time() >= END_OF_DAY
```

In `backend/src/product_status_cronjob.py`: delete the `_local_day_bounds` function and the `from datetime import time as dt_time` / `timedelta` imports if unused, add `from src.core.local_day import local_day_bounds`, and replace every `_local_day_bounds(` with `local_day_bounds(`.

- [ ] **Step 4: Run all backend tests**

Run: `.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .`
Expected: all pass (157 + 7 new).

- [ ] **Step 5: Commit**

```bash
git add backend/src/core/local_day.py backend/tests/test_local_day.py backend/src/product_status_cronjob.py
git commit -m "refactor(backend): share the local-day helpers between the cronjob and the API"
```

---

### Task 2: `DailyCheckRun` model and `GET /daily-check/`

**Files:**
- Modify: `backend/src/models/database_models.py`
- Create: `backend/src/schemas/daily_check.py`, `backend/src/services/daily_check_service.py`, `backend/src/routers/daily_check_router.py`, `backend/tests/test_daily_check.py`
- Modify: `backend/src/api.py`, `contracts/api-fields.json`, `backend/tests/test_contracts.py`

**Interfaces:**
- Consumes: `local_day_bounds` (Task 1).
- Produces:
  - `DailyCheckRun(day_start: int PK, started_at: int, total_products: int, limit_reached_at: int | None, pending_at_limit: int | None, report_sent: bool = False)`.
  - `daily_check_service.count_today(session, now) -> DailyCounts` with `DailyCounts` a frozen dataclass `(recorded: int, pending: int)`.
  - `daily_check_service.get_today_run(session, now) -> DailyCheckRun | None`.
  - `daily_check_service.get_status(session, now) -> DailyCheckStatusResponse`.
  - `DailyCheckStatusResponse(day_start: int, started_at: int | None, total_products: int | None, limit_reached_at: int | None, pending_at_limit: int | None, pending_now: int)`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_daily_check.py`

```python
"""Tests for today's daily-check status (``GET /daily-check/``)."""

from datetime import datetime

import pytest
from src.core.local_day import local_day_bounds
from src.models.database_models import (
    Category,
    DailyCheckRun,
    PendingStatusRetry,
    Product,
    ProductHist,
)
from src.services import daily_check_service

NOW = datetime(2026, 9, 26, 15, 0)
DAY_START, DAY_END = local_day_bounds(NOW)


@pytest.fixture
def products(session):
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    items = [
        Product(
            name=f"P{i}",
            url=f"https://example.com/{i}",
            priority="low",
            category_id=category.id,
            description="x",
            currency="EUR",
        )
        for i in range(3)
    ]
    session.add_all(items)
    session.commit()
    return [p.id for p in items]


def test_status_before_todays_run_has_no_snapshot(session):
    status = daily_check_service.get_status(session, NOW)

    assert status.model_dump() == {
        "day_start": DAY_START,
        "started_at": None,
        "total_products": None,
        "limit_reached_at": None,
        "pending_at_limit": None,
        "pending_now": 0,
    }


def test_status_on_a_limit_day_reports_the_snapshot_and_live_pending(
    session, products
):
    session.add(
        DailyCheckRun(
            day_start=DAY_START,
            started_at=DAY_START + 12 * 3600,
            total_products=3,
            limit_reached_at=DAY_START + 12 * 3600 + 180,
            pending_at_limit=2,
        )
    )
    session.add(PendingStatusRetry(product_id=products[2], day_start=DAY_START))
    session.commit()

    status = daily_check_service.get_status(session, NOW)

    assert status.started_at == DAY_START + 12 * 3600
    assert status.total_products == 3
    assert status.limit_reached_at == DAY_START + 12 * 3600 + 180
    assert status.pending_at_limit == 2
    assert status.pending_now == 1


def test_pending_from_another_day_is_not_counted(session, products):
    session.add(PendingStatusRetry(product_id=products[0], day_start=DAY_START - 86400))
    session.commit()

    assert daily_check_service.count_today(session, NOW).pending == 0


def test_recorded_counts_products_with_a_record_today_once(session, products):
    for timestamp in (DAY_START + 10, DAY_START + 20):
        session.add(
            ProductHist(
                product_id=products[0], price=1.0, is_in_stock=True, timestamp=timestamp
            )
        )
    session.add(
        ProductHist(
            product_id=products[1], price=1.0, is_in_stock=True, timestamp=DAY_START - 1
        )
    )
    session.commit()

    assert daily_check_service.count_today(session, NOW).recorded == 1


def test_endpoint_returns_todays_status(client, monkeypatch):
    monkeypatch.setattr(daily_check_service, "datetime", _FrozenDatetime)

    response = client.get("/daily-check/")

    assert response.status_code == 200
    assert response.json()["day_start"] == DAY_START
    assert response.json()["pending_now"] == 0


class _FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW
```

Add to `backend/tests/test_contracts.py` (import `DailyCheckStatusResponse` from `src.schemas.daily_check` and include it in the parametrize list):

```python
@pytest.mark.parametrize(
    "schema",
    [
        ProductDashboardSummary,
        ProductDetailResponse,
        ProductHistResponse,
        DailyCheckStatusResponse,
    ],
    ids=lambda schema: schema.__name__,
)
def test_schema_fields_match_contract(schema):
    assert set(schema.model_fields) == set(API_FIELDS[schema.__name__])
```

Add to `contracts/api-fields.json`:

```json
  "DailyCheckStatusResponse": [
    "day_start",
    "started_at",
    "total_products",
    "limit_reached_at",
    "pending_at_limit",
    "pending_now"
  ]
```

- [ ] **Step 2: Run to verify it fails**

Run: `.venv/bin/pytest tests/test_daily_check.py tests/test_contracts.py -q`
Expected: `ImportError: cannot import name 'DailyCheckRun'`.

- [ ] **Step 3: Implement**

Append to `backend/src/models/database_models.py`:

```python
class DailyCheckRun(SQLModel, table=True):
    """Summary of one local day's price check, created by its full run.

    ``limit_reached_at`` / ``pending_at_limit`` are the snapshot of the first
    Gemini quota error of the day (null when the quota never ran out); they
    are never overwritten by the retries. ``PendingStatusRetry`` holds the
    live list of products still pending.
    """

    day_start: int = Field(primary_key=True)  # Unix seconds, local day start
    started_at: int  # Unix seconds
    total_products: int
    limit_reached_at: int | None = None  # Unix seconds
    pending_at_limit: int | None = None
    report_sent: bool = False
```

`backend/src/schemas/daily_check.py`:

```python
"""Response schema for today's daily price check status."""

from pydantic import BaseModel


class DailyCheckStatusResponse(BaseModel):
    """Today's check: the full-run snapshot (null before it runs) and live pending."""

    day_start: int
    started_at: int | None
    total_products: int | None
    limit_reached_at: int | None
    pending_at_limit: int | None
    pending_now: int
```

`backend/src/services/daily_check_service.py`:

```python
"""
Daily check service — today's price-check summary and counts.

Shared by ``GET /daily-check/`` (dashboard notice) and the cronjob's
Telegram daily report, so both use the same local day and counts.
"""

from dataclasses import dataclass
from datetime import datetime

from sqlmodel import Session, func, select
from src.core.local_day import local_day_bounds
from src.models.database_models import (
    DailyCheckRun,
    PendingStatusRetry,
    Product,
    ProductHist,
)
from src.schemas.daily_check import DailyCheckStatusResponse


@dataclass(frozen=True)
class DailyCounts:
    """Products recorded today and products still pending a quota retry."""

    recorded: int
    pending: int


def get_today_run(session: Session, now: datetime) -> DailyCheckRun | None:
    """Return today's ``DailyCheckRun``, or None before the full run.

    Args:
        session (Session): Active database session.
        now (datetime): Naive local time.

    Returns:
        DailyCheckRun | None: Today's row.
    """
    day_start, _ = local_day_bounds(now)
    return session.get(DailyCheckRun, day_start)


def count_today(session: Session, now: datetime) -> DailyCounts:
    """Count existing products recorded today and today's pending retries.

    Args:
        session (Session): Active database session.
        now (datetime): Naive local time.

    Returns:
        DailyCounts: The counts for ``now``'s local day.
    """
    day_start, day_end = local_day_bounds(now)
    recorded = session.exec(
        select(func.count(func.distinct(ProductHist.product_id)))
        .join(Product, Product.id == ProductHist.product_id)
        .where(ProductHist.timestamp >= day_start, ProductHist.timestamp < day_end)
    ).one()
    pending = session.exec(
        select(func.count())
        .select_from(PendingStatusRetry)
        .where(PendingStatusRetry.day_start == day_start)
    ).one()
    return DailyCounts(recorded=recorded, pending=pending)


def get_status(session: Session, now: datetime | None = None) -> DailyCheckStatusResponse:
    """Build today's status for the dashboard.

    Args:
        session (Session): Active database session.
        now (datetime | None): Naive local time; defaults to ``datetime.now()``.

    Returns:
        DailyCheckStatusResponse: The snapshot (null before the full run)
            and the live number of pending products.
    """
    now = now or datetime.now()
    day_start, _ = local_day_bounds(now)
    run = get_today_run(session, now)
    return DailyCheckStatusResponse(
        day_start=day_start,
        started_at=run.started_at if run else None,
        total_products=run.total_products if run else None,
        limit_reached_at=run.limit_reached_at if run else None,
        pending_at_limit=run.pending_at_limit if run else None,
        pending_now=count_today(session, now).pending,
    )
```

`backend/src/routers/daily_check_router.py`:

```python
"""
Daily check router — today's price-check status for the dashboard.
"""

from fastapi import APIRouter
from src.core.database import SessionDep
from src.schemas.daily_check import DailyCheckStatusResponse
from src.services import daily_check_service

router = APIRouter(tags=["daily-check"])


@router.get("/daily-check/")
def get_daily_check(session: SessionDep) -> DailyCheckStatusResponse:
    """Return today's check snapshot and how many products are still pending."""
    return daily_check_service.get_status(session)
```

In `backend/src/api.py`: add `daily_check_router` to the `from src.routers import (...)` list and `app.include_router(daily_check_router.router)` after the config router.

- [ ] **Step 4: Run tests**

Run: `.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/database_models.py backend/src/schemas/daily_check.py backend/src/services/daily_check_service.py backend/src/routers/daily_check_router.py backend/src/api.py backend/tests/test_daily_check.py backend/tests/test_contracts.py contracts/api-fields.json
git commit -m "feat(backend): add the daily check summary and GET /daily-check/"
```

---

### Task 3: Daily run bookkeeping and 10-minute scheduling

**Files:**
- Modify: `backend/src/product_status_cronjob.py`, `backend/tests/test_cronjob.py`, `entrypoint.sh`, `README.md`

**Interfaces:**
- Consumes: `DailyCheckRun`, `daily_check_service.get_today_run` (Task 2), `local_day_bounds` (Task 1).
- Produces:
  - `_current_timestamp() -> int` (module-level, monkeypatched by tests).
  - `_check_products(...) -> tuple[list[int], int | None]` — pending IDs and the Unix time of the quota error (None if none).
  - `fetch_and_store_product_status(now)` creates today's `DailyCheckRun` (only when an API key and at least one product exist) and fills the limit snapshot.
  - `main(now)`: full run if no `DailyCheckRun` today and `now.hour >= analysis_hour`, else retry pass; then `send_daily_report_if_due(now)` (added in Task 5 — in this task `main` ends after the run).
  - `should_run_analysis` is **removed**; replaced by `_should_start_daily_run(now) -> bool`.

- [ ] **Step 1: Write the failing tests** — in `backend/tests/test_cronjob.py`

Import `DailyCheckRun` alongside the other models. Replace the existing `test_main_runs_the_full_check_at_the_analysis_hour_and_retries_otherwise` test with:

```python
def _daily_run(session):
    session.expire_all()
    return session.get(DailyCheckRun, _day_start(NOW))


@pytest.fixture
def main_calls(monkeypatch):
    calls = []

    async def fake_full(now=None):
        calls.append("full")

    async def fake_retry(now=None):
        calls.append("retry")

    monkeypatch.setattr(cronjob, "fetch_and_store_product_status", fake_full)
    monkeypatch.setattr(cronjob, "retry_rate_limited_products", fake_retry)
    return calls


@pytest.mark.parametrize(
    ("hour", "expected"), [(11, "retry"), (12, "full"), (18, "full")]
)
def test_main_starts_the_daily_run_on_the_first_tick_after_the_analysis_hour(
    session, cron, main_calls, hour, expected
):
    asyncio.run(cronjob.main(now=NOW.replace(hour=hour)))

    assert main_calls == [expected]


def test_main_starts_the_daily_run_only_once_per_day(session, cron, main_calls):
    session.add(
        DailyCheckRun(day_start=_day_start(NOW), started_at=_ts(NOW), total_products=1)
    )
    session.commit()

    asyncio.run(cronjob.main(now=NOW.replace(minute=10)))

    assert main_calls == ["retry"]


def test_main_ignores_the_daily_run_of_another_day(session, cron, main_calls):
    yesterday = NOW - timedelta(days=1)
    session.add(
        DailyCheckRun(
            day_start=_day_start(yesterday), started_at=_ts(yesterday), total_products=1
        )
    )
    session.commit()

    asyncio.run(cronjob.main(now=NOW))

    assert main_calls == ["full"]


def test_full_run_creates_the_daily_run_without_a_limit(session, cron):
    _run()

    run = _daily_run(session)
    assert (run.started_at, run.total_products) == (_ts(NOW), 1)
    assert (run.limit_reached_at, run.pending_at_limit) == (None, None)
    assert run.report_sent is False


def test_full_run_records_the_first_quota_error(session, cron, monkeypatch):
    second = _add_product(session, cron, "Gadget")
    _add_product(session, cron, "Gizmo")
    cron.errors[second.url] = _quota_error()
    monkeypatch.setattr(cronjob, "_current_timestamp", lambda: _ts(NOW) + 180)

    _run()

    run = _daily_run(session)
    assert run.total_products == 3
    assert (run.limit_reached_at, run.pending_at_limit) == (_ts(NOW) + 180, 2)


def test_retry_quota_error_keeps_the_first_snapshot(session, cron, monkeypatch):
    session.add(
        DailyCheckRun(
            day_start=_day_start(NOW),
            started_at=_ts(NOW),
            total_products=1,
            limit_reached_at=_ts(NOW) + 60,
            pending_at_limit=1,
        )
    )
    session.commit()
    _mark_pending(session, cron.product_id, _day_start(NOW))
    cron.errors[cron.product_url] = _quota_error()
    monkeypatch.setattr(cronjob, "_current_timestamp", lambda: _ts(NOW) + 3600)

    _retry()

    assert _daily_run(session).limit_reached_at == _ts(NOW) + 60


def test_full_run_without_api_key_does_not_create_the_daily_run(session, cron):
    session.exec(delete(Config).where(Config.key == "google_api_key"))
    session.commit()

    _run()

    assert _daily_run(session) is None


def test_full_run_without_products_does_not_create_the_daily_run(session, cron):
    session.delete(session.get(Product, cron.product_id))
    session.commit()

    _run()

    assert _daily_run(session) is None
```

(Add `from sqlmodel import delete, select` at the top.)

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/pytest tests/test_cronjob.py -q`
Expected: the new tests fail (`hour=18` expects `full`, `_daily_run` is None, `_current_timestamp` missing).

- [ ] **Step 3: Implement** in `backend/src/product_status_cronjob.py`

Module docstring: replace "run every hour" with "run every 10 minutes" and item 1 with "The first run at or after the configured analysis hour each day (no `DailyCheckRun` row yet) fetches prices for every product not yet checked today…"; item 3 becomes "Every later run that day retries today's pending products…".

Add imports `import time`, `from src.models.database_models import DailyCheckRun` (merge into the existing import) and `from src.services import daily_check_service`.

```python
def _current_timestamp() -> int:
    """Return the current Unix time; a seam so tests can pin quota-error times."""
    return int(time.time())
```

In `_check_products`: change the return type to `tuple[list[int], int | None]`; inside the `RATE_LIMITED` branch set `limit_reached_at = _current_timestamp()` before building `pending_ids`; initialize `limit_reached_at = None` before the loop; return `pending_ids, limit_reached_at`. Update the docstring `Returns:` to "tuple[list[int], int | None]: IDs still without a record today because of the quota (…) and the Unix time of the quota error, or None if the quota never ran out."

Replace the body of `fetch_and_store_product_status` after the products check:

```python
        logger.info(f"Found {len(products)} products to process")
        day_start, _ = local_day_bounds(now)
        daily_run = DailyCheckRun(
            day_start=day_start,
            started_at=int(now.timestamp()),
            total_products=len(products),
        )
        session.add(daily_run)
        session.commit()

        pending_ids, limit_reached_at = await _check_products(
            session, products, google_api_key, now
        )

        for product_id in pending_ids:
            session.add(PendingStatusRetry(product_id=product_id, day_start=day_start))
        if limit_reached_at is not None:
            daily_run.limit_reached_at = limit_reached_at
            daily_run.pending_at_limit = len(pending_ids)
            session.add(daily_run)
        session.commit()
```

Docstring addition: "Creates today's ``DailyCheckRun`` (only once an API key and at least one product exist, so a run that cannot start is attempted again on the next tick) and records the first quota error in it."

In `retry_rate_limited_products`, unpack: `still_pending, _ = await _check_products(...)` (the snapshot is never overwritten by retries).

Replace `should_run_analysis` and `main`:

```python
def _should_start_daily_run(now: datetime) -> bool:
    """Whether this run must start today's full check.

    True on the first run at or after the configured analysis hour of a day
    with no ``DailyCheckRun`` yet, so the full check happens once per day
    even if the scheduled tick was missed (container stopped or restarted).

    Args:
        now (datetime): Naive local time of the run.

    Returns:
        bool: True to run the full check, False to run the retry pass.
    """
    with Session(engine) as session:
        configured_hour = int(get_config_value(session, "analysis_hour", "12"))
        already_started = daily_check_service.get_today_run(session, now) is not None

    logger.info(
        f"Current time: {now:%H:%M}, configured analysis hour: {configured_hour}, "
        f"today's check started: {already_started}"
    )
    return not already_started and now.hour >= configured_hour


async def main(now: datetime | None = None):
    """Main entry point for the cronjob (runs every 10 minutes).

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    logger.info("=== Product Status Tracking Cronjob Started ===")

    if _should_start_daily_run(now):
        logger.info("Starting today's product status check...")
        await fetch_and_store_product_status(now=now)
    else:
        logger.info("Checking pending rate-limit retries...")
        await retry_rate_limited_products(now=now)

    logger.info("=== Product Status Tracking Cronjob Completed ===")
```

In `entrypoint.sh`: comment "Run every 10 minutes as root; the job decides between today's full check (first run at or after the configured analysis hour) and retrying products left by a Gemini quota error." and schedule `*/10 * * * *`.

In `README.md` "⏰ Cronjob Setup": "designed to be **executed every 10 minutes**"; crontab example `*/10 * * * * cd /path/to/wishlist-tracker/backend && …`; "What the Cronjob Does" step 1 becomes "The first run at or after the configured **analysis hour** each day starts the daily check (once per day, even if the container was stopped at that hour)."; step 5 "At every later run that day (every 10 minutes)…"; the Docker section line "**Cron** runs the price tracking job every 10 minutes…"; add `DailyCheckRun` to the schema diagram under `PendingStatusRetry`:

```
┌────────────────────┐
│   DailyCheckRun    │
├────────────────────┤
│ day_start (PK)     │ (Unix seconds, start of the local day)
│ started_at         │
│ total_products     │
│ limit_reached_at   │ (nullable, first Gemini quota error)
│ pending_at_limit   │ (nullable)
│ report_sent        │
└────────────────────┘
```

and update "There are 6 tables" → "There are 7 tables".

- [ ] **Step 4: Run tests**

Run: `.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/product_status_cronjob.py backend/tests/test_cronjob.py entrypoint.sh README.md
git commit -m "feat(backend)!: run the cronjob every 10 minutes and record each day's check"
```

---

### Task 4: `daily_check_report` setting and contract

**Files:**
- Create: `contracts/daily-check-report.json`
- Modify: `backend/src/core/config.py`, `backend/src/schemas/config.py`, `backend/src/services/config_service.py`, `backend/tests/test_contracts.py`, `backend/tests/test_config.py`, `contracts/README.md`

**Interfaces:**
- Produces: `DAILY_CHECK_REPORT_OPTIONS = ("off", "limit_days", "every_day")`, `DEFAULT_DAILY_CHECK_REPORT = "limit_days"`, `DailyCheckReport = Literal["off", "limit_days", "every_day"]`, `get_daily_check_report(session) -> str` (unknown stored value → default); `ConfigResponse.daily_check_report: str`; `ConfigUpdate.daily_check_report: DailyCheckReport | None`.

- [ ] **Step 1: Write the failing tests**

`contracts/daily-check-report.json`:

```json
{
  "options": ["off", "limit_days", "every_day"],
  "default": "limit_days"
}
```

`backend/tests/test_contracts.py`:

```python
DAILY_CHECK_REPORT = load_contract("daily-check-report.json")


# --- daily-check-report.json ---


def test_daily_check_report_options_match_contract():
    assert list(DAILY_CHECK_REPORT_OPTIONS) == DAILY_CHECK_REPORT["options"]


def test_config_update_accepts_exactly_the_report_options():
    annotation = ConfigUpdate.model_fields["daily_check_report"].annotation
    literal = next(arg for arg in get_args(annotation) if arg is not type(None))

    assert list(get_args(literal)) == DAILY_CHECK_REPORT["options"]


def test_default_daily_check_report_matches_contract():
    assert DEFAULT_DAILY_CHECK_REPORT == DAILY_CHECK_REPORT["default"]
    assert CONFIG_DEFAULTS["daily_check_report"] == DAILY_CHECK_REPORT["default"]
```

(Import `DAILY_CHECK_REPORT_OPTIONS`, `DEFAULT_DAILY_CHECK_REPORT` from `src.core.config`.)

`backend/tests/test_config.py`:

```python
def test_daily_check_report_defaults_to_limit_days(client):
    assert client.get("/config/").json()["daily_check_report"] == "limit_days"


@pytest.mark.parametrize("value", ["off", "limit_days", "every_day"])
def test_daily_check_report_accepts_every_option(client, value):
    response = client.patch("/config/", json={"daily_check_report": value})

    assert response.status_code == 200
    assert response.json()["daily_check_report"] == value


@pytest.mark.parametrize("value", ["always", "", "OFF"])
def test_daily_check_report_rejects_other_values(client, value):
    assert client.patch("/config/", json={"daily_check_report": value}).status_code == 422


def test_corrupt_daily_check_report_falls_back_to_default(client, session):
    session.add(Config(key="daily_check_report", value="weekly"))
    session.commit()

    assert client.get("/config/").json()["daily_check_report"] == "limit_days"
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/pytest tests/test_contracts.py tests/test_config.py -q`
Expected: `ImportError: cannot import name 'DAILY_CHECK_REPORT_OPTIONS'`.

- [ ] **Step 3: Implement**

`backend/src/core/config.py` (after the hist-window block):

```python
# Telegram daily check report modes. Mirrored by the frontend
# (``frontend/src/lib/dailyCheckReport.js``) and pinned for both sides by
# ``contracts/daily-check-report.json``.
DAILY_CHECK_REPORT_OPTIONS = ("off", "limit_days", "every_day")
DEFAULT_DAILY_CHECK_REPORT = "limit_days"
DailyCheckReport = Literal["off", "limit_days", "every_day"]
```

Add `"daily_check_report": DEFAULT_DAILY_CHECK_REPORT,` to `CONFIG_DEFAULTS`, and:

```python
def get_daily_check_report(session: Session) -> str:
    """Return the configured Telegram daily check report mode.

    An unknown stored value falls back to ``DEFAULT_DAILY_CHECK_REPORT``.

    Args:
        session (Session): The database session.

    Returns:
        str: One of ``DAILY_CHECK_REPORT_OPTIONS``.
    """
    value = get_config_value(session, "daily_check_report", DEFAULT_DAILY_CHECK_REPORT)
    return value if value in DAILY_CHECK_REPORT_OPTIONS else DEFAULT_DAILY_CHECK_REPORT
```

`backend/src/schemas/config.py`: import `DailyCheckReport`; add `daily_check_report: DailyCheckReport | None = None` to `ConfigUpdate` and `daily_check_report: str` to `ConfigResponse`.

`backend/src/services/config_service.py`: import `get_daily_check_report`; in `get_all_config` add `daily_check_report=get_daily_check_report(session),`; in `update_config` add:

```python
    if config_update.daily_check_report is not None:
        # Already restricted to DAILY_CHECK_REPORT_OPTIONS by the schema (422).
        set_config_value(session, "daily_check_report", config_update.daily_check_report)
```

`contracts/README.md`: add the row
`| \`daily-check-report.json\` | Telegram daily check report modes and default | \`backend/tests/test_contracts.py\` | \`frontend/src/lib/contracts.test.js\` |`
and the root `README.md` Config keys table row
`| \`daily_check_report\` | \`limit_days\` | Telegram daily check report: \`off\`, \`limit_days\` (only on days the Gemini limit was reached) or \`every_day\` |`.

- [ ] **Step 4: Run tests**

Run: `.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add contracts/daily-check-report.json contracts/README.md README.md backend/src/core/config.py backend/src/schemas/config.py backend/src/services/config_service.py backend/tests/test_contracts.py backend/tests/test_config.py
git commit -m "feat(backend): add the daily_check_report setting and its shared contract"
```

---

### Task 5: Telegram daily report

**Files:**
- Modify: `backend/src/telegram_utils.py`, `backend/src/product_status_cronjob.py`, `README.md`
- Create: `backend/tests/test_daily_report.py`

**Interfaces:**
- Consumes: `get_daily_check_report` (Task 4), `daily_check_service.get_today_run`, `count_today` (Task 2), `format_local_time`, `is_end_of_day` (Task 1), `_load_telegram_settings` (existing).
- Produces:
  - `telegram_utils.build_daily_done_message(lang, recorded, total, failed, limit_time: str | None, pending_at_limit: int | None) -> str`.
  - `telegram_utils.build_daily_unchecked_message(lang, pending, total, limit_time: str, pending_at_limit: int) -> str`.
  - `telegram_utils.send_daily_check_report(bot_token, chat_id, text) -> None` (raises on failure).
  - `product_status_cronjob.send_daily_report_if_due(now: datetime) -> None`, called at the end of `main()`.

- [ ] **Step 1: Write the failing tests** — `backend/tests/test_daily_report.py`

```python
"""Tests for the Telegram daily check report (messages and when it is sent)."""

import asyncio
from datetime import datetime, timedelta

import pytest
from src import product_status_cronjob as cronjob
from src.core.local_day import local_day_bounds
from src.models.database_models import (
    Category,
    Config,
    DailyCheckRun,
    PendingStatusRetry,
    Product,
    ProductHist,
)
from src.telegram_utils import build_daily_done_message, build_daily_unchecked_message

NOW = datetime(2026, 9, 26, 12, 30)
DAY_START, _ = local_day_bounds(NOW)
LIMIT_AT = int(datetime(2026, 9, 26, 12, 3).timestamp())


# --- Messages ---


def test_done_message_on_a_normal_day():
    assert build_daily_done_message("english", 40, 40, 0, None, None) == (
        "✅ Daily check completed: 40 of 40 products recorded."
    )


def test_done_message_on_a_limit_day_with_failures():
    assert build_daily_done_message("english", 38, 40, 2, "12:03", 15) == (
        "✅ Daily check completed: 38 of 40 products recorded (2 failed).\n"
        "Gemini limit reached at 12:03 with 15 products left; finished by retrying."
    )


def test_unchecked_message():
    assert build_daily_unchecked_message("english", 12, 40, "12:03", 15) == (
        "⚠️ 12 of 40 products could not be checked today: the Gemini limit was "
        "reached at 12:03 with 15 products left. Tomorrow's run will check them first."
    )


def test_messages_in_spanish():
    assert build_daily_done_message("spanish", 38, 40, 2, "12:03", 15) == (
        "✅ Revisión diaria completada: 38 de 40 productos registrados (2 fallidos).\n"
        "Límite de Gemini alcanzado a las 12:03 con 15 productos pendientes; "
        "completada con reintentos."
    )
    assert build_daily_unchecked_message("spanish", 12, 40, "12:03", 15) == (
        "⚠️ 12 de 40 productos no se han podido revisar hoy: el límite de Gemini se "
        "alcanzó a las 12:03 con 15 productos pendientes. Mañana se revisarán primero."
    )


def test_unknown_language_falls_back_to_english():
    assert build_daily_done_message("klingon", 1, 1, 0, None, None).startswith(
        "✅ Daily check completed"
    )


# --- When it is sent ---


@pytest.fixture
def report(session, monkeypatch):
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    for key, value in {
        "telegram_bot_token": "token",
        "telegram_bot_chat_id": "chat",
        "daily_check_report": "limit_days",
    }.items():
        session.add(Config(key=key, value=value))
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    products = [
        Product(
            name=f"P{i}",
            url=f"https://example.com/{i}",
            priority="low",
            category_id=category.id,
            description="x",
            currency="EUR",
        )
        for i in range(3)
    ]
    session.add_all(products)
    session.commit()
    ids = [p.id for p in products]
    session.commit()

    sent = []
    state = {"fail": False}

    async def fake_send(bot_token, chat_id, text):
        if state["fail"]:
            raise RuntimeError("telegram down")
        sent.append(text)

    monkeypatch.setattr(cronjob, "send_daily_check_report", fake_send)
    return {"ids": ids, "sent": sent, "state": state}


def _set_mode(session, mode):
    session.get(Config, 3).value = mode  # third Config row is daily_check_report
    session.commit()


def _add_run(session, limit=True, total=3):
    session.add(
        DailyCheckRun(
            day_start=DAY_START,
            started_at=int(NOW.replace(hour=12, minute=0).timestamp()),
            total_products=total,
            limit_reached_at=LIMIT_AT if limit else None,
            pending_at_limit=2 if limit else None,
        )
    )
    session.commit()


def _record(session, product_id):
    session.add(
        ProductHist(
            product_id=product_id, price=1.0, is_in_stock=True, timestamp=DAY_START + 60
        )
    )
    session.commit()


def _pending(session, product_id):
    session.add(PendingStatusRetry(product_id=product_id, day_start=DAY_START))
    session.commit()


def _send(now=NOW):
    asyncio.run(cronjob.send_daily_report_if_due(now))


def _report_sent(session):
    session.expire_all()
    return session.get(DailyCheckRun, DAY_START).report_sent


def test_limit_day_sends_done_once_nothing_is_pending(session, report):
    _add_run(session)
    for product_id in report["ids"]:
        _record(session, product_id)

    _send()
    _send(NOW + timedelta(minutes=10))

    assert report["sent"] == [build_daily_done_message("english", 3, 3, 0, "12:03", 2)]
    assert _report_sent(session) is True


def test_limit_day_waits_while_products_are_pending(session, report):
    _add_run(session)
    _record(session, report["ids"][0])
    _pending(session, report["ids"][1])

    _send()

    assert report["sent"] == []
    assert _report_sent(session) is False


def test_limit_day_sends_unchecked_at_the_end_of_the_day(session, report):
    _add_run(session)
    _record(session, report["ids"][0])
    _pending(session, report["ids"][1])
    _pending(session, report["ids"][2])

    _send(NOW.replace(hour=23, minute=50))

    assert report["sent"] == [build_daily_unchecked_message("english", 2, 3, "12:03", 2)]


def test_limit_days_mode_sends_nothing_on_a_normal_day(session, report):
    _add_run(session, limit=False)
    for product_id in report["ids"]:
        _record(session, product_id)

    _send()

    assert report["sent"] == []


def test_every_day_mode_sends_done_on_a_normal_day_with_failures(session, report):
    _set_mode(session, "every_day")
    _add_run(session, limit=False)
    _record(session, report["ids"][0])

    _send()

    assert report["sent"] == [build_daily_done_message("english", 1, 3, 2, None, None)]


def test_off_mode_sends_nothing(session, report):
    _set_mode(session, "off")
    _add_run(session)

    _send(NOW.replace(hour=23, minute=55))

    assert report["sent"] == []


def test_nothing_is_sent_without_telegram(session, report):
    session.get(Config, 2).value = ""  # telegram_bot_chat_id
    session.commit()
    _add_run(session)

    _send()

    assert report["sent"] == []


def test_nothing_is_sent_before_todays_run(session, report):
    _send()

    assert report["sent"] == []


def test_failed_report_send_is_retried_next_run(session, report):
    _add_run(session)
    report["state"]["fail"] = True

    _send()
    assert _report_sent(session) is False

    report["state"]["fail"] = False
    _send(NOW + timedelta(minutes=10))
    assert len(report["sent"]) == 1
    assert _report_sent(session) is True


def test_report_counts_never_go_negative_when_products_are_deleted(session, report):
    _set_mode(session, "every_day")
    _add_run(session, limit=False, total=1)
    _record(session, report["ids"][0])
    _record(session, report["ids"][1])

    _send()

    assert report["sent"] == [build_daily_done_message("english", 2, 1, 0, None, None)]
```

Also add to `backend/tests/test_cronjob.py`:

```python
def test_main_evaluates_the_daily_report_after_the_run(session, cron, main_calls, monkeypatch):
    async def fake_report(now):
        main_calls.append("report")

    monkeypatch.setattr(cronjob, "send_daily_report_if_due", fake_report)

    asyncio.run(cronjob.main(now=NOW))

    assert main_calls == ["full", "report"]
```

- [ ] **Step 2: Run to verify they fail**

Run: `.venv/bin/pytest tests/test_daily_report.py tests/test_cronjob.py -q`
Expected: `ImportError: cannot import name 'build_daily_done_message'`.

- [ ] **Step 3: Implement**

Append to `backend/src/telegram_utils.py`:

```python
# --- Daily check report ---
# Plain-text messages (no parse_mode), so product counts and times need no
# MarkdownV2 escaping.

_DAILY_REPORT_TEXTS = {
    "english": {
        "done": "✅ Daily check completed: {recorded} of {total} products recorded",
        "failed": " ({failed} failed)",
        "done_limit": (
            "Gemini limit reached at {limit_time} with {pending_at_limit} products "
            "left; finished by retrying."
        ),
        "unchecked": (
            "⚠️ {pending} of {total} products could not be checked today: the Gemini "
            "limit was reached at {limit_time} with {pending_at_limit} products left. "
            "Tomorrow's run will check them first."
        ),
    },
    "spanish": {
        "done": "✅ Revisión diaria completada: {recorded} de {total} productos registrados",
        "failed": " ({failed} fallidos)",
        "done_limit": (
            "Límite de Gemini alcanzado a las {limit_time} con {pending_at_limit} "
            "productos pendientes; completada con reintentos."
        ),
        "unchecked": (
            "⚠️ {pending} de {total} productos no se han podido revisar hoy: el límite "
            "de Gemini se alcanzó a las {limit_time} con {pending_at_limit} productos "
            "pendientes. Mañana se revisarán primero."
        ),
    },
}


def _daily_report_texts(lang: str) -> dict:
    return _DAILY_REPORT_TEXTS.get(lang.lower(), _DAILY_REPORT_TEXTS["english"])


def build_daily_done_message(
    lang: str,
    recorded: int,
    total: int,
    failed: int,
    limit_time: str | None,
    pending_at_limit: int | None,
) -> str:
    """Build the "daily check completed" report.

    Args:
        lang (str): Language code ("english" or "spanish").
        recorded (int): Products recorded today.
        total (int): Products when the daily check started.
        failed (int): Products checked without a record (not pending).
        limit_time (str | None): Local ``HH:MM`` of the quota error, if any.
        pending_at_limit (int | None): Products left at that quota error.

    Returns:
        str: The message text.
    """
    texts = _daily_report_texts(lang)
    message = texts["done"].format(recorded=recorded, total=total)
    if failed:
        message += texts["failed"].format(failed=failed)
    message += "."
    if limit_time is not None:
        message += "\n" + texts["done_limit"].format(
            limit_time=limit_time, pending_at_limit=pending_at_limit
        )
    return message


def build_daily_unchecked_message(
    lang: str, pending: int, total: int, limit_time: str, pending_at_limit: int
) -> str:
    """Build the end-of-day "products left unchecked" report.

    Args:
        lang (str): Language code ("english" or "spanish").
        pending (int): Products still pending at the end of the day.
        total (int): Products when the daily check started.
        limit_time (str): Local ``HH:MM`` of the first quota error.
        pending_at_limit (int): Products left at that quota error.

    Returns:
        str: The message text.
    """
    return _daily_report_texts(lang)["unchecked"].format(
        pending=pending,
        total=total,
        limit_time=limit_time,
        pending_at_limit=pending_at_limit,
    )


async def send_daily_check_report(bot_token: str, chat_id: str, text: str) -> None:
    """Send the daily check report as plain text.

    Args:
        bot_token (str): The Telegram bot token.
        chat_id (str): The chat ID to send the message to.
        text (str): The message built by one of the ``build_daily_*`` helpers.

    Raises:
        TelegramError: If Telegram rejects the message (the caller retries later).
    """
    await Bot(token=bot_token).send_message(chat_id=chat_id, text=text)
```

In `backend/src/product_status_cronjob.py`: import `get_daily_check_report` from `src.core.config`, `format_local_time, is_end_of_day` from `src.core.local_day`, and `send_daily_check_report, build_daily_done_message, build_daily_unchecked_message` from `src.telegram_utils`. Add:

```python
def _build_daily_report(session: Session, run: DailyCheckRun, now: datetime) -> str | None:
    """Return today's report text if it is due, else None.

    "Done" is due once nothing is pending; "left unchecked" only from
    ``END_OF_DAY`` with products still pending.
    """
    counts = daily_check_service.count_today(session, now)
    lang = get_config_value(session, "selected_language", "english")
    limit_time = (
        format_local_time(run.limit_reached_at) if run.limit_reached_at else None
    )
    if counts.pending == 0:
        failed = max(run.total_products - counts.recorded, 0)
        return build_daily_done_message(
            lang, counts.recorded, run.total_products, failed, limit_time, run.pending_at_limit
        )
    if is_end_of_day(now) and limit_time is not None:
        return build_daily_unchecked_message(
            lang, counts.pending, run.total_products, limit_time, run.pending_at_limit
        )
    return None


async def send_daily_report_if_due(now: datetime) -> None:
    """Send today's Telegram daily check report once, when it is due.

    Follows the ``daily_check_report`` setting: ``off`` never sends,
    ``limit_days`` only on days the Gemini quota ran out, ``every_day``
    always. ``report_sent`` is set only after a successful send, so a failed
    send is retried by the next run of the same day.

    Args:
        now (datetime): Naive local time of the run.
    """
    with Session(engine) as session:
        run = daily_check_service.get_today_run(session, now)
        if run is None or run.report_sent:
            return
        mode = get_daily_check_report(session)
        if mode == "off" or (mode == "limit_days" and run.limit_reached_at is None):
            return
        tg = _load_telegram_settings(session)
        if not tg["enabled"]:
            return

        text = _build_daily_report(session, run, now)
        if text is None:
            return
        try:
            await send_daily_check_report(tg["token"], tg["chat_id"], text)
        except Exception as e:
            logger.error(f"Failed to send the daily check report: {str(e)}")
            return

        run.report_sent = True
        session.add(run)
        session.commit()
        logger.info("Daily check report sent")
```

Note: the "failed" count uses `max(total - recorded, 0)` since pending is 0 in the done branch (spec §4.2's `max(total - recorded - pending, 0)`).

At the end of `main()`, before the "Completed" log line: `await send_daily_report_if_due(now)`.

`README.md` "What the Cronjob Does": add step 6 "After each run, sends the **daily check report** on Telegram once per day (setting `daily_check_report`): ✅ as soon as no product is pending, or ⚠️ with the count left unchecked on the 23:50 run. `limit_days` only reports days the Gemini limit was reached, `every_day` reports every day, `off` never."

- [ ] **Step 4: Run tests**

Run: `.venv/bin/pytest -q && .venv/bin/ruff check . && .venv/bin/ruff format --check .`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add backend/src/telegram_utils.py backend/src/product_status_cronjob.py backend/tests/test_daily_report.py backend/tests/test_cronjob.py README.md
git commit -m "feat(backend): send a Telegram daily check report according to daily_check_report"
```

---

### Task 6: Dashboard daily-check notice

**Files:**
- Create: `frontend/src/lib/api/dailyCheck.js`, `frontend/src/lib/api/dailyCheck.test.js`, `frontend/src/stores/dailyCheckStore.js`, `frontend/src/stores/dailyCheckStore.test.js`, `frontend/src/components/dashboard/DailyCheckNotice.jsx`, `frontend/src/components/dashboard/DailyCheckNotice.test.jsx`, `frontend/e2e/fixtures/dailyCheck.js`
- Modify: `frontend/src/lib/api/index.js`, `frontend/src/lib/format.js`, `frontend/src/lib/format.test.js`, `frontend/src/components/dashboard/index.js`, `frontend/src/pages/DashboardPage.jsx`, the page tests mocking `@/lib/api` that render the dashboard (`DashboardPage.editDialogState.test.jsx`, `DashboardPage.filters.test.jsx`, `idleStatus.test.jsx`, `AppShell.test.jsx` if it renders the dashboard), `frontend/src/lib/contracts.test.js`, `frontend/src/i18n/english.json`, `frontend/src/i18n/spanish.json`, `frontend/e2e/support/apiMock.js`, `frontend/e2e/dashboard.spec.js`

**Interfaces:**
- Consumes: `GET /daily-check/` (Task 2).
- Produces: `dailyCheck.get(signal) -> Promise<DailyCheckStatus>`; `useDailyCheckStore` with `{status, data, fetch()}`; `<DailyCheckNotice locale />`; `formatTime(ts, locale) -> string`; e2e `buildDailyCheck(overrides)` and `ApiMock#setDailyCheck(status)`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/format.test.js` (add):

```js
describe('formatTime', () => {
  it('formats hours and minutes in the given locale', () => {
    const ts = Date.UTC(2026, 8, 26, 9, 5) / 1000;
    expect(formatTime(ts, 'en-GB', 'UTC')).toBe('09:05');
  });

  it('returns a dash for a missing timestamp', () => {
    expect(formatTime(null, 'en-GB')).toBe('-');
  });
});
```

`frontend/src/lib/api/dailyCheck.test.js`:

```js
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_URL } from './client';
import { get } from './dailyCheck';

afterEach(() => vi.restoreAllMocks());

describe('dailyCheck api', () => {
  it('GETs /daily-check/', async () => {
    const body = { day_start: 1, pending_now: 0 };
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    await expect(get()).resolves.toEqual(body);
    expect(fetchSpy).toHaveBeenCalledWith(
      `${API_URL}/daily-check/`,
      expect.objectContaining({ method: 'GET' })
    );
  });
});
```

`frontend/src/stores/dailyCheckStore.test.js`:

```js
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dailyCheck as dailyCheckApi } from '@/lib/api';
import { initialDailyCheckState, useDailyCheckStore } from './dailyCheckStore';

vi.mock('@/lib/api', () => ({ dailyCheck: { get: vi.fn() } }));

let consoleErrorSpy;

beforeEach(() => {
  useDailyCheckStore.setState(initialDailyCheckState, true);
  vi.clearAllMocks();
  consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => consoleErrorSpy.mockRestore());

describe('useDailyCheckStore', () => {
  it('stores the fetched status', async () => {
    const data = { day_start: 1, pending_now: 2 };
    dailyCheckApi.get.mockResolvedValue(data);

    await useDailyCheckStore.getState().fetch();

    expect(useDailyCheckStore.getState()).toMatchObject({ status: 'success', data });
  });

  it('keeps no data when the request fails', async () => {
    dailyCheckApi.get.mockRejectedValue(new Error('boom'));

    await useDailyCheckStore.getState().fetch();

    expect(useDailyCheckStore.getState()).toMatchObject({ status: 'error', data: null });
  });
});
```

`frontend/src/components/dashboard/DailyCheckNotice.test.jsx`:

```jsx
import { screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { dailyCheck as dailyCheckApi } from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { initialDailyCheckState, useDailyCheckStore } from '@/stores/dailyCheckStore';
import { DailyCheckNotice } from './DailyCheckNotice';

vi.mock('@/lib/api', () => ({ dailyCheck: { get: vi.fn() } }));

const LIMIT_AT = Date.UTC(2026, 8, 26, 12, 3) / 1000;
const status = (overrides) => ({
  day_start: Date.UTC(2026, 8, 26) / 1000,
  started_at: Date.UTC(2026, 8, 26, 12, 0) / 1000,
  total_products: 40,
  limit_reached_at: LIMIT_AT,
  pending_at_limit: 15,
  pending_now: 12,
  ...overrides
});

beforeEach(() => {
  useDailyCheckStore.setState(initialDailyCheckState, true);
  vi.clearAllMocks();
});

describe('DailyCheckNotice', () => {
  it('warns while products are still pending', async () => {
    dailyCheckApi.get.mockResolvedValue(status());
    renderWithProviders(<DailyCheckNotice locale="en-GB" timeZone="UTC" />);

    expect(
      await screen.findByText(
        'Gemini limit reached at 12:03 with 15 products left to check today.'
      )
    ).toBeInTheDocument();
    expect(
      screen.getByText('12 still pending, retrying every 10 minutes.')
    ).toBeInTheDocument();
  });

  it('confirms when the retries finished every product', async () => {
    dailyCheckApi.get.mockResolvedValue(status({ pending_now: 0 }));
    renderWithProviders(<DailyCheckNotice locale="en-GB" timeZone="UTC" />);

    expect(
      await screen.findByText(
        'Gemini limit reached at 12:03; all products were checked by retrying.'
      )
    ).toBeInTheDocument();
  });

  it('renders nothing on a day without a limit', async () => {
    dailyCheckApi.get.mockResolvedValue(
      status({ limit_reached_at: null, pending_at_limit: null, pending_now: 0 })
    );
    const { container } = renderWithProviders(<DailyCheckNotice locale="en-GB" />);

    await waitFor(() => expect(dailyCheckApi.get).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the status request fails', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    dailyCheckApi.get.mockRejectedValue(new Error('boom'));
    const { container } = renderWithProviders(<DailyCheckNotice locale="en-GB" />);

    await waitFor(() =>
      expect(useDailyCheckStore.getState().status).toBe('error')
    );
    expect(container).toBeEmptyDOMElement();
    spy.mockRestore();
  });

  it('refetches when the window regains focus', async () => {
    dailyCheckApi.get.mockResolvedValue(status());
    renderWithProviders(<DailyCheckNotice locale="en-GB" />);
    await waitFor(() => expect(dailyCheckApi.get).toHaveBeenCalledTimes(1));

    window.dispatchEvent(new Event('focus'));

    await waitFor(() => expect(dailyCheckApi.get).toHaveBeenCalledTimes(2));
  });
});
```

(If `renderWithProviders` wraps the tree in providers that add DOM, replace `toBeEmptyDOMElement()` with `expect(screen.queryByRole('alert')).not.toBeInTheDocument()`.)

`frontend/src/lib/contracts.test.js` (add):

```js
import { buildDailyCheck } from '../../e2e/fixtures/dailyCheck';
// inside describe('api-fields contract'):
  it('matches the daily check status fields', () => {
    expect(sortedKeys(buildDailyCheck())).toEqual(
      [...API_FIELDS.DailyCheckStatusResponse].sort()
    );
  });
```

- [ ] **Step 2: Run to verify they fail**

Run (from `frontend/`): `npm test -- --run src/lib/format.test.js src/lib/api/dailyCheck.test.js src/stores/dailyCheckStore.test.js src/components/dashboard/DailyCheckNotice.test.jsx src/lib/contracts.test.js`
Expected: failures resolving `./dailyCheck`, `formatTime`, `DailyCheckNotice`, `e2e/fixtures/dailyCheck`.

- [ ] **Step 3: Implement**

`frontend/src/lib/format.js` (add):

```js
/**
 * Format a unix timestamp (seconds since epoch) as a localized hour and
 * minute (e.g. "09:05").
 *
 * @param {number|null|undefined} ts - Seconds since epoch.
 * @param {string} locale - An `Intl` locale tag, see `getLocale`.
 * @param {string} [timeZone] - IANA time zone; the browser's by default.
 * @returns {string} The formatted time, or `'-'` when `ts` is missing or invalid.
 */
export const formatTime = (ts, locale, timeZone) => {
  if (ts === null || ts === undefined || Number.isNaN(ts)) {
    return '-';
  }
  return new Date(ts * 1000).toLocaleTimeString(locale, {
    hour: '2-digit',
    minute: '2-digit',
    timeZone
  });
};
```

`frontend/src/lib/api/dailyCheck.js`:

```js
import { request } from './client';

/**
 * Fetch today's daily price check status (`GET /daily-check/`): the full
 * run's snapshot (nulls before it runs) and how many products are still
 * pending a Gemini quota retry.
 * @param {AbortSignal} [signal]
 * @returns {Promise<object>}
 */
export const get = (signal) => request('/daily-check/', { signal });
```

`frontend/src/lib/api/index.js`: add `export * as dailyCheck from './dailyCheck';`.

`frontend/src/stores/dailyCheckStore.js`:

```js
import { create } from 'zustand';
import { dailyCheck as dailyCheckApi } from '@/lib/api';

/** Exported so tests can reset the store between cases. */
export const initialDailyCheckState = {
  /** @type {'idle'|'loading'|'success'|'error'} */
  status: 'idle',
  /** @type {object|null} Last `GET /daily-check/` response. */
  data: null
};

/**
 * Zustand store for today's daily check status, shown by the dashboard's
 * `DailyCheckNotice`. A failed request only logs: the notice is
 * informative and must never get in the way of the dashboard.
 */
export const useDailyCheckStore = create((set) => ({
  ...initialDailyCheckState,

  /** (Re)load today's status. */
  async fetch() {
    set({ status: 'loading' });
    try {
      const data = await dailyCheckApi.get();
      set({ status: 'success', data });
    } catch (err) {
      console.error('Error fetching the daily check status:', err);
      set({ status: 'error', data: null });
    }
  }
}));
```

`frontend/src/components/dashboard/DailyCheckNotice.jsx`:

```jsx
import { useEffect } from 'react';
import { Alert } from '@chakra-ui/react';
import { useTranslation } from 'react-i18next';
import { formatTime } from '@/lib/format';
import { useDailyCheckStore } from '@/stores/dailyCheckStore';

/**
 * Dashboard notice for days the Gemini quota ran out during the daily
 * price check: when it happened and how many products were left, plus how
 * many are still pending the 10-minute retries (or that all were checked).
 * Renders nothing on a normal day, before today's check or if the status
 * cannot be loaded. Refetched on mount and whenever the window regains focus.
 *
 * @param {object} props
 * @param {string} props.locale - An `Intl` locale tag, see `getLocale`.
 * @param {string} [props.timeZone] - Only for tests; the browser's by default.
 */
export const DailyCheckNotice = ({ locale, timeZone }) => {
  const { t } = useTranslation();
  const data = useDailyCheckStore((state) => state.data);
  const fetchStatus = useDailyCheckStore((state) => state.fetch);

  useEffect(() => {
    fetchStatus();
    const onFocus = () => fetchStatus();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [fetchStatus]);

  if (!data?.limit_reached_at) return null;

  const time = formatTime(data.limit_reached_at, locale, timeZone);
  const isPending = data.pending_now > 0;

  return (
    <Alert.Root status={isPending ? 'warning' : 'success'} mb={6}>
      <Alert.Indicator />
      <Alert.Content>
        {isPending ? (
          <>
            <Alert.Title>
              {t('pages.dashboard.dailyCheck.limitReached', {
                time,
                count: data.pending_at_limit
              })}
            </Alert.Title>
            <Alert.Description>
              {t('pages.dashboard.dailyCheck.stillPending', {
                count: data.pending_now
              })}
            </Alert.Description>
          </>
        ) : (
          <Alert.Title>
            {t('pages.dashboard.dailyCheck.allChecked', { time })}
          </Alert.Title>
        )}
      </Alert.Content>
    </Alert.Root>
  );
};
```

`frontend/src/components/dashboard/index.js`: export `DailyCheckNotice`.

`frontend/src/pages/DashboardPage.jsx`: import `DailyCheckNotice` and render `<DailyCheckNotice locale={locale} />` right after `<PageHeader … />` (outside the error/empty branches, so it shows whatever the product list state).

i18n — under `pages.dashboard` in `english.json`:

```json
"dailyCheck": {
  "limitReached_one": "Gemini limit reached at {{time}} with {{count}} product left to check today.",
  "limitReached_other": "Gemini limit reached at {{time}} with {{count}} products left to check today.",
  "stillPending_one": "{{count}} still pending, retrying every 10 minutes.",
  "stillPending_other": "{{count}} still pending, retrying every 10 minutes.",
  "allChecked": "Gemini limit reached at {{time}}; all products were checked by retrying."
}
```

and in `spanish.json`:

```json
"dailyCheck": {
  "limitReached_one": "Límite de Gemini alcanzado a las {{time}} con {{count}} producto pendiente de revisar hoy.",
  "limitReached_other": "Límite de Gemini alcanzado a las {{time}} con {{count}} productos pendientes de revisar hoy.",
  "stillPending_one": "Queda {{count}} pendiente, se reintenta cada 10 minutos.",
  "stillPending_other": "Quedan {{count}} pendientes, se reintenta cada 10 minutos.",
  "allChecked": "Límite de Gemini alcanzado a las {{time}}; todos los productos se revisaron con reintentos."
}
```

(`src/i18n/locales.test.js` checks both locales have the same keys; keep them in sync.)

Page tests mocking `@/lib/api` that render `DashboardPage`: add
`dailyCheck: { get: vi.fn().mockResolvedValue({ day_start: 0, started_at: null, total_products: null, limit_reached_at: null, pending_at_limit: null, pending_now: 0 }) },`
to each mock factory (find them with `grep -ln "DashboardPage" src/**/*.test.jsx`), and in `idleStatus.test.jsx` use its existing never-resolving `pending` helper: `dailyCheck: { get: vi.fn(pending) },`.

`frontend/e2e/fixtures/dailyCheck.js`:

```js
/**
 * `GET /daily-check/` fixtures (`backend/src/schemas/daily_check.py`'s
 * `DailyCheckStatusResponse`).
 */

/**
 * @param {object} [overrides]
 * @returns {object} A full `DailyCheckStatusResponse`-shaped object; by
 *   default today's check has not run yet (no notice).
 */
export function buildDailyCheck(overrides = {}) {
  return {
    day_start: 0,
    started_at: null,
    total_products: null,
    limit_reached_at: null,
    pending_at_limit: null,
    pending_now: 0,
    ...overrides
  };
}
```

`frontend/e2e/support/apiMock.js`: import `buildDailyCheck`; constructor `this.dailyCheck = buildDailyCheck();`; setter

```js
  /** @param {object} status `DailyCheckStatusResponse`. */
  setDailyCheck(status) {
    this.dailyCheck = status;
  }
```

and in `install()`:

```js
    await page.route(`${API_URL}/daily-check/`, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: this.dailyCheck })
        : this._recordUnmatched(route)
    );
```

`frontend/e2e/dashboard.spec.js` (add):

```js
test('shows the Gemini limit notice with the pending products', async ({ page, apiMock }) => {
  const now = Math.floor(Date.now() / 1000);
  apiMock.setDailyCheck(
    buildDailyCheck({
      started_at: now - 600,
      total_products: 40,
      limit_reached_at: now - 420,
      pending_at_limit: 15,
      pending_now: 12
    })
  );
  await page.goto('/');

  await expect(page.getByRole('alert')).toContainText('with 15 products left to check today');
  await expect(page.getByRole('alert')).toContainText('12 still pending');
});
```

(Use the spec file's existing setup for config/products fixtures, e.g. a `beforeEach` that calls `apiMock.setConfig`/`setProducts`.)

- [ ] **Step 4: Run tests**

Run: `npm test -- --run && npm run lint && npm run format:check && npx playwright test e2e/dashboard.spec.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src frontend/e2e
git commit -m "feat(frontend): show the Gemini limit notice on the dashboard"
```

---

### Task 7: Settings — daily check report select

**Files:**
- Create: `frontend/src/lib/dailyCheckReport.js`
- Modify: `frontend/src/components/settings/NotificationsSection.jsx`, `frontend/src/components/settings/NotificationsSection.test.jsx`, `frontend/src/pages/SettingsPage.jsx`, `frontend/src/lib/settingsDraft.js`, its test, `frontend/src/lib/contracts.test.js`, `frontend/src/i18n/english.json`, `frontend/src/i18n/spanish.json`, `frontend/e2e/fixtures/config.js`, `frontend/e2e/settings.spec.js`, and any unit-test config fixture objects (`grep -rln "is_stock_change_alert" src`) — add `daily_check_report: 'limit_days'`.

**Interfaces:**
- Consumes: `daily_check_report` in `/config/` (Task 4).
- Produces: `DAILY_CHECK_REPORT_OPTIONS`, `DEFAULT_DAILY_CHECK_REPORT`, `resolveDailyCheckReport(value)`; `NotificationsSection` props `dailyCheckReport: string`, `onDailyCheckReportChange: (value: string) => void`; `'daily_check_report'` in `EDITABLE_FIELDS`.

- [ ] **Step 1: Write the failing tests**

`frontend/src/lib/contracts.test.js`:

```js
import {
  DAILY_CHECK_REPORT_OPTIONS,
  DEFAULT_DAILY_CHECK_REPORT
} from './dailyCheckReport';

const DAILY_CHECK_REPORT = readContract('daily-check-report.json');

describe('daily-check-report contract', () => {
  it('pins the report options', () => {
    expect(DAILY_CHECK_REPORT_OPTIONS).toEqual(DAILY_CHECK_REPORT.options);
  });

  it('pins the default report', () => {
    expect(DEFAULT_DAILY_CHECK_REPORT).toBe(DAILY_CHECK_REPORT.default);
  });
});
```

`frontend/src/lib/settingsDraft.test.js` (add):

```js
it('drafts the daily check report, falling back to the default for unknown values', () => {
  expect(draftFromConfig({ ...CONFIG, daily_check_report: 'every_day' }).daily_check_report).toBe('every_day');
  expect(draftFromConfig({ ...CONFIG, daily_check_report: 'weekly' }).daily_check_report).toBe('limit_days');
});
```

(`CONFIG` = the config fixture object already used in that test file; add `daily_check_report: 'limit_days'` to it.)

`frontend/src/components/settings/NotificationsSection.test.jsx` (add `dailyCheckReport: 'limit_days', onDailyCheckReportChange: vi.fn()` to `baseProps`, `daily_check_report: 'limit_days'` to the store config, and):

```jsx
it('disables the daily report select with a reason when not connected', () => {
  setStatus('not_configured');
  renderWithProviders(<NotificationsSection {...baseProps} />);

  expect(screen.getByRole('combobox', { name: 'Daily check report' })).toBeDisabled();
});

it('reports the selected daily report mode', async () => {
  setStatus('connected');
  const onDailyCheckReportChange = vi.fn();
  const user = userEvent.setup();
  renderWithProviders(
    <NotificationsSection {...baseProps} onDailyCheckReportChange={onDailyCheckReportChange} />
  );

  await user.click(screen.getByRole('combobox', { name: 'Daily check report' }));
  await user.click(screen.getByRole('option', { name: 'Every day' }));

  expect(onDailyCheckReportChange).toHaveBeenCalledWith('every_day');
});
```

(Import `userEvent` from `@testing-library/user-event` as the other settings tests do; if `AnalysisSection.test.jsx` queries its selects differently, mirror its query.)

- [ ] **Step 2: Run to verify they fail**

Run: `npm test -- --run src/lib/contracts.test.js src/lib/settingsDraft.test.js src/components/settings/NotificationsSection.test.jsx`
Expected: failures (`./dailyCheckReport` missing, `daily_check_report` undefined, no combobox).

- [ ] **Step 3: Implement**

`frontend/src/lib/dailyCheckReport.js`:

```js
/**
 * Telegram daily check report modes offered in Settings. Mirrored by the
 * backend (`backend/src/core/config.py`) and pinned for both sides by
 * `contracts/daily-check-report.json`.
 * @type {string[]}
 */
export const DAILY_CHECK_REPORT_OPTIONS = ['off', 'limit_days', 'every_day'];

/** The mode used when none (or an unknown one) is configured. */
export const DEFAULT_DAILY_CHECK_REPORT = 'limit_days';

/**
 * @param {unknown} value - A configured `daily_check_report`.
 * @returns {string} `value` when it is an offered option, otherwise the default.
 */
export const resolveDailyCheckReport = (value) =>
  DAILY_CHECK_REPORT_OPTIONS.includes(value) ? value : DEFAULT_DAILY_CHECK_REPORT;
```

`frontend/src/lib/settingsDraft.js`: add `'daily_check_report'` to `EDITABLE_FIELDS`; in `draftFromConfig` add `daily_check_report: resolveDailyCheckReport(config.daily_check_report),` (import it).

`frontend/src/pages/SettingsPage.jsx`: `DEFAULT_DRAFT.daily_check_report = 'limit_days'`; pass `dailyCheckReport={draft.daily_check_report}` and `onDailyCheckReportChange={setField('daily_check_report')}` to `NotificationsSection`.

`frontend/src/components/settings/NotificationsSection.jsx`: accept the two props (document them in the JSDoc) and render, after the two `AlertRow`s inside the `VStack`:

```jsx
        <Field
          label={t('pages.settings.alerts.dailyReport.title')}
          helperText={reason ?? t('pages.settings.alerts.dailyReport.description')}
          disabled={!isConnected}
        >
          <SelectRoot
            collection={dailyReportCollection}
            value={[dailyCheckReport]}
            onValueChange={(e) => onDailyCheckReportChange(e.value[0])}
            disabled={!isConnected}
          >
            <SelectTrigger aria-label={t('pages.settings.alerts.dailyReport.title')}>
              <SelectValueText />
            </SelectTrigger>
            <SelectContent>
              {dailyReportCollection.items.map((item) => (
                <SelectItem key={item.value} item={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </SelectRoot>
        </Field>
```

with, inside the component:

```jsx
  const dailyReportCollection = useMemo(
    () =>
      createListCollection({
        items: DAILY_CHECK_REPORT_OPTIONS.map((value) => ({
          value,
          label: t(`pages.settings.alerts.dailyReport.options.${value}`)
        }))
      }),
    [t]
  );
```

and imports `useMemo`, `createListCollection`, the `Select*` parts from `@/components/ui/select`, `Field` from `@/components/ui/field`, `DAILY_CHECK_REPORT_OPTIONS` from `@/lib/dailyCheckReport` (same pattern as `AnalysisSection.jsx`). Update the section JSDoc: "the Telegram integration checklist, the two alert toggles and the daily check report select it gates."

i18n — under `pages.settings.alerts` in `english.json`:

```json
"dailyReport": {
  "title": "Daily check report",
  "description": "Telegram message when the day's price check is complete, or at 23:50 with the products the Gemini limit left unchecked",
  "options": {
    "off": "Off",
    "limit_days": "Only on days the limit is reached",
    "every_day": "Every day"
  }
}
```

`spanish.json`:

```json
"dailyReport": {
  "title": "Informe de la revisión diaria",
  "description": "Mensaje de Telegram cuando se completa la revisión de precios del día, o a las 23:50 con los productos que el límite de Gemini dejó sin revisar",
  "options": {
    "off": "Desactivado",
    "limit_days": "Solo los días en que se alcanza el límite",
    "every_day": "Todos los días"
  }
}
```

`frontend/e2e/fixtures/config.js`: add `daily_check_report: 'limit_days',` to `buildConfig`. `frontend/e2e/settings.spec.js` (add):

```js
test('saves the daily check report mode', async ({ page, apiMock }) => {
  apiMock.setConfig(CONFIG_CONNECTED);
  await page.goto('/settings');

  await page.getByRole('combobox', { name: 'Daily check report' }).click();
  await page.getByRole('option', { name: 'Every day' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect.poll(() => apiMock.config.daily_check_report).toBe('every_day');
});
```

(Use the save button's actual accessible name from `SaveBar.jsx` / existing specs.)

- [ ] **Step 4: Run tests**

Run: `npm test -- --run && npm run lint && npm run format:check && npx playwright test e2e/settings.spec.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add frontend/src frontend/e2e
git commit -m "feat(frontend): choose the Telegram daily check report in Settings"
```

---

### Task 8: Visual snapshots, docs and full verification

**Files:**
- Modify: `frontend/e2e/visual.spec.js-snapshots/*` (regenerated), `README.md`, `backend/README.md`, `frontend/README.md` (if it lists stores/components or e2e mocks)

- [ ] **Step 1: Regenerate the Settings visual snapshots** (the new select changes the Settings page; the dashboard default fixture has no notice)

Run: `npx playwright test e2e/visual.spec.js --update-snapshots`, then inspect the diff of the regenerated PNGs (only Settings pages should change) with `git status frontend/e2e/visual.spec.js-snapshots`.

- [ ] **Step 2: Docs**

- `README.md`: API reference row `| \`GET\` | \`/daily-check/\` | Today's daily check: full-run snapshot (start, total, Gemini limit time and products left) and products still pending |`; Settings table row `| **Daily check report** | Telegram report of the day's check: off, only on days the Gemini limit is reached, or every day. |`; features table/highlights: dashboard notice when the Gemini limit is reached.
- `backend/README.md`: tests line mentions `test_daily_check.py`, `test_daily_report.py`, `test_local_day.py`.
- `frontend/README.md`: add `dailyCheckStore` / `DailyCheckNotice` where stores/components are listed (only if such a list exists).

- [ ] **Step 3: Full verification**

Run from repo root: `just lint && just test && (cd frontend && npx playwright test)`
Expected: everything passes; paste the summary lines in the task report.

- [ ] **Step 4: Commit**

```bash
git add README.md backend/README.md frontend/README.md frontend/e2e/visual.spec.js-snapshots
git commit -m "docs: document the daily check report, the Gemini limit notice and 10-minute retries"
```
