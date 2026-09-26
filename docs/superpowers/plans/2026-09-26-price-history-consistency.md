# Price History Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every price-evolution number (dashboard trend, sparkline, summary strip, detail stats and chart, Telegram price alerts) follow one day-based, stock-aware definition, identical in Python and JavaScript and pinned by shared contract fixtures.

**Architecture:** A pure Python module (`backend/src/services/price_stats.py`) and its JavaScript mirror (`frontend/src/lib/productHistory.js`) implement the same formulas. JSON files in a new top-level `contracts/` directory hold the shared cases, window options and API field names; both test suites read them, so any divergence fails a test. The backend computes dashboard stats with a constant number of queries; the frontend computes detail stats per selected range.

**Tech Stack:** FastAPI + SQLModel + pytest (backend, run with `uv`), React 19 + Vite + Vitest + Playwright (frontend), Docker.

**Spec:** `docs/superpowers/specs/2026-09-26-price-history-consistency-design.md`

## Global Constraints

- Window unit is calendar days: a record is in the window when `timestamp >= now - window_days * 86400`; `window_days = null/None` means the full history.
- *current* = newest record of the full history, identified by its `timestamp` (ties: the last one in input order).
- *baseline* = in-stock window records whose `timestamp != current.timestamp`; *average* = mean of baseline or `null`.
- *price change %* = `(current.price - average) / average * 100`, `null` when current is missing/out of stock, average is `null` or `average <= 0`.
- *lowest* = minimum price among in-stock window records, ties resolved to the most recent; *at lowest* = current in stock and `current.price <= lowest.price`.
- Window options are exactly `30, 60, 90, 180`; default `60`.
- API: `price_change_60d` → `price_change_pct`; new `is_at_lowest: bool` on the dashboard summary; `min_price` removed from the detail; `recent_prices` = every window price (in and out of stock), oldest first, no cap.
- Invalid scraped price = not finite or `<= 0`: nothing stored, no alert, counted as an error.
- At most one history record per product per local day (process `TZ`); the cron skips a product that already has one without scraping.
- Price-drop alert only when the new status is in stock and cheaper than the last **in-stock** record.
- All code, comments and docs in English. Conventional Commits. Backend commands run from `backend/` with `uv run`; frontend commands from `frontend/`.
- `contracts/*.json` are read only by tests; never import them from app code.

## Review Focus

1. A stored off-list `hist_window_size` (e.g. `45`, saved before this change): the dashboard keeps using 45 days, the settings page shows "60 days" selected, saving writes a valid option — tests in Task 2 and Task 5.
2. A product whose whole history is older than the window (cron stopped for weeks): the dashboard still shows its last price, stock and `last_checked_at`, with empty `recent_prices`, `price_change_pct = null` and `is_at_lowest = false` — test in Task 3.
3. Day boundary for the "one record per day" rule: a record from yesterday 23:59 must not block today's run — test in Task 4.
4. A product with no previous in-stock record coming back in stock: no price-drop alert (nothing to compare with) but the stock alert still fires — test in Task 4.
5. Detail page whose last record is out of stock: "Current vs average" shows N/A, lowest and average only use in-stock records — test in Task 6.

---

### Task 1: Shared price-stats contract and Python `price_stats`

**Files:**
- Create: `contracts/price-stats-cases.json`
- Create: `contracts/README.md`
- Create: `backend/tests/contract_utils.py`
- Create: `backend/tests/test_price_stats_contract.py`
- Create: `backend/src/services/price_stats.py`

**Interfaces:**
- Produces: `price_stats.SECONDS_PER_DAY: int = 86400`
- Produces: `price_stats.PriceStats` (frozen dataclass: `current`, `window: list`, `average: float | None`, `price_change_pct: float | None`, `lowest` (record or `None`), `is_at_lowest: bool`)
- Produces: `price_stats.filter_window(history, window_days: int | None, now: int) -> list` (new ascending list)
- Produces: `price_stats.compute_window_stats(window: list, current) -> PriceStats` (window already filtered and ascending)
- Produces: `price_stats.compute_price_stats(history, window_days: int | None, now: int) -> PriceStats`
- Produces: `tests.contract_utils.load_contract(name: str) -> dict`
- Records are any objects exposing `price`, `is_in_stock`, `timestamp`.

- [ ] **Step 1: Create the contract fixture `contracts/price-stats-cases.json`**

Every expected value below was generated from the spec's definitions (section 2). `now` is `100000000`; one day is `86400` seconds.

```json
{
  "tolerance": 1e-6,
  "cases": [
    {
      "name": "empty history",
      "now": 100000000,
      "window_days": 30,
      "history": [],
      "expected": {
        "window_prices": [],
        "average": null,
        "price_change_pct": null,
        "lowest": null,
        "is_at_lowest": false
      }
    },
    {
      "name": "single in-stock record",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99913600, "price": 10.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [10.0],
        "average": null,
        "price_change_pct": null,
        "lowest": {"price": 10.0, "timestamp": 99913600},
        "is_at_lowest": true
      }
    },
    {
      "name": "baseline excludes current; tie on lowest resolves to most recent",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99740800, "price": 100.0, "is_in_stock": true},
        {"timestamp": 99827200, "price": 100.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 110.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [100.0, 100.0, 110.0],
        "average": 100.0,
        "price_change_pct": 10.0,
        "lowest": {"price": 100.0, "timestamp": 99827200},
        "is_at_lowest": false
      }
    },
    {
      "name": "current below average is at lowest",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99740800, "price": 100.0, "is_in_stock": true},
        {"timestamp": 99827200, "price": 100.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 90.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [100.0, 100.0, 90.0],
        "average": 100.0,
        "price_change_pct": -10.0,
        "lowest": {"price": 90.0, "timestamp": 99913600},
        "is_at_lowest": true
      }
    },
    {
      "name": "record exactly at the cutoff is included",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 97408000, "price": 50.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 100.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [50.0, 100.0],
        "average": 50.0,
        "price_change_pct": 100.0,
        "lowest": {"price": 50.0, "timestamp": 97408000},
        "is_at_lowest": false
      }
    },
    {
      "name": "record one second before the cutoff is excluded",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 97407999, "price": 50.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 100.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [100.0],
        "average": null,
        "price_change_pct": null,
        "lowest": {"price": 100.0, "timestamp": 99913600},
        "is_at_lowest": true
      }
    },
    {
      "name": "out-of-stock records are ignored by the stats but kept in the window",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99740800, "price": 10.0, "is_in_stock": false},
        {"timestamp": 99827200, "price": 100.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 100.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [10.0, 100.0, 100.0],
        "average": 100.0,
        "price_change_pct": 0.0,
        "lowest": {"price": 100.0, "timestamp": 99913600},
        "is_at_lowest": true
      }
    },
    {
      "name": "current out of stock has no change and is never at lowest",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99827200, "price": 100.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 80.0, "is_in_stock": false}
      ],
      "expected": {
        "window_prices": [100.0, 80.0],
        "average": 100.0,
        "price_change_pct": null,
        "lowest": {"price": 100.0, "timestamp": 99827200},
        "is_at_lowest": false
      }
    },
    {
      "name": "current outside the window",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 96544000, "price": 100.0, "is_in_stock": true},
        {"timestamp": 96976000, "price": 90.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [],
        "average": null,
        "price_change_pct": null,
        "lowest": null,
        "is_at_lowest": false
      }
    },
    {
      "name": "non-positive average gives no change",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99827200, "price": 0.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 10.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [0.0, 10.0],
        "average": 0.0,
        "price_change_pct": null,
        "lowest": {"price": 0.0, "timestamp": 99827200},
        "is_at_lowest": false
      }
    },
    {
      "name": "unsorted input is sorted by timestamp",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99913600, "price": 120.0, "is_in_stock": true},
        {"timestamp": 99740800, "price": 100.0, "is_in_stock": true},
        {"timestamp": 99827200, "price": 80.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [100.0, 80.0, 120.0],
        "average": 90.0,
        "price_change_pct": 33.33333333333333,
        "lowest": {"price": 80.0, "timestamp": 99827200},
        "is_at_lowest": false
      }
    },
    {
      "name": "null window keeps the full history",
      "now": 100000000,
      "window_days": null,
      "history": [
        {"timestamp": 65440000, "price": 50.0, "is_in_stock": true},
        {"timestamp": 82720000, "price": 150.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 100.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [50.0, 150.0, 100.0],
        "average": 100.0,
        "price_change_pct": 0.0,
        "lowest": {"price": 50.0, "timestamp": 65440000},
        "is_at_lowest": false
      }
    },
    {
      "name": "every record out of stock",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99827200, "price": 50.0, "is_in_stock": false},
        {"timestamp": 99913600, "price": 60.0, "is_in_stock": false}
      ],
      "expected": {
        "window_prices": [50.0, 60.0],
        "average": null,
        "price_change_pct": null,
        "lowest": null,
        "is_at_lowest": false
      }
    },
    {
      "name": "current equal to an older lowest is at lowest",
      "now": 100000000,
      "window_days": 30,
      "history": [
        {"timestamp": 99740800, "price": 120.0, "is_in_stock": true},
        {"timestamp": 99827200, "price": 90.0, "is_in_stock": true},
        {"timestamp": 99913600, "price": 90.0, "is_in_stock": true}
      ],
      "expected": {
        "window_prices": [120.0, 90.0, 90.0],
        "average": 105.0,
        "price_change_pct": -14.285714285714285,
        "lowest": {"price": 90.0, "timestamp": 99913600},
        "is_at_lowest": true
      }
    }
  ]
}
```

- [ ] **Step 2: Create `contracts/README.md`**

```markdown
# Shared contracts

Some rules are implemented twice: once in the backend (Python) and once in
the frontend (JavaScript). The JSON files in this directory are the single
source of truth for those rules. They are read **only by the test suites**
of both sides, never by application code, so they are not part of the Docker
image nor of the frontend bundle.

| File | Pins | Backend test | Frontend test |
| --- | --- | --- | --- |
| `price-stats-cases.json` | Price statistics formulas (window, average, price change, lowest, at lowest) | `backend/tests/test_price_stats_contract.py` | `frontend/src/lib/productHistory.contract.test.js` |
| `hist-window.json` | Historical window options and default | `backend/tests/test_contracts.py` | `frontend/src/lib/contracts.test.js` |
| `api-fields.json` | Field names of the product dashboard/detail/history responses | `backend/tests/test_contracts.py` | `frontend/src/lib/contracts.test.js` |

## Changing a shared rule

1. Edit the contract JSON first (add or change the cases/values).
2. Run both test suites (`just test`): the side(s) not yet updated fail.
3. Update the Python and JavaScript implementations until both pass.

Never change an implementation to make its contract test pass without
checking that the other side still agrees with the JSON.
```

- [ ] **Step 3: Create `backend/tests/contract_utils.py`**

```python
"""Helpers to read the shared frontend/backend contracts in ``/contracts``.

See ``contracts/README.md`` at the repository root.
"""

import json
from pathlib import Path

CONTRACTS_DIR = Path(__file__).resolve().parents[2] / "contracts"


def load_contract(name: str) -> dict:
    """Load one contract JSON file.

    Args:
        name (str): File name inside ``contracts/`` (e.g. ``"hist-window.json"``).

    Returns:
        dict: The parsed JSON document.
    """
    with (CONTRACTS_DIR / name).open(encoding="utf-8") as file:
        return json.load(file)
```

- [ ] **Step 4: Write the failing contract test `backend/tests/test_price_stats_contract.py`**

```python
"""Shared price-stats contract for the Python mirror formulas.

The same cases (``contracts/price-stats-cases.json``) run against
``frontend/src/lib/productHistory.js`` in ``productHistory.contract.test.js``,
so the two implementations cannot drift apart silently.
"""

from types import SimpleNamespace

import pytest
from src.services.price_stats import compute_price_stats
from tests.contract_utils import load_contract

CONTRACT = load_contract("price-stats-cases.json")
TOLERANCE = CONTRACT["tolerance"]


def _approx(value):
    return None if value is None else pytest.approx(value, abs=TOLERANCE)


@pytest.mark.parametrize("case", CONTRACT["cases"], ids=lambda case: case["name"])
def test_price_stats_contract(case):
    history = [SimpleNamespace(**record) for record in case["history"]]
    expected = case["expected"]

    stats = compute_price_stats(history, case["window_days"], case["now"])

    assert [record.price for record in stats.window] == [
        _approx(price) for price in expected["window_prices"]
    ]
    assert stats.average == _approx(expected["average"])
    assert stats.price_change_pct == _approx(expected["price_change_pct"])
    if expected["lowest"] is None:
        assert stats.lowest is None
    else:
        assert stats.lowest.price == _approx(expected["lowest"]["price"])
        assert stats.lowest.timestamp == expected["lowest"]["timestamp"]
    assert stats.is_at_lowest is expected["is_at_lowest"]


def test_compute_price_stats_does_not_mutate_the_input():
    history = [
        SimpleNamespace(price=2.0, is_in_stock=True, timestamp=20),
        SimpleNamespace(price=1.0, is_in_stock=True, timestamp=10),
    ]
    original = list(history)

    compute_price_stats(history, None, 100)

    assert history == original
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_price_stats_contract.py -v`
Expected: collection error `ModuleNotFoundError: No module named 'src.services.price_stats'`.

- [ ] **Step 6: Implement `backend/src/services/price_stats.py`**

```python
"""
Price statistics shared by the dashboard (and mirrored by the frontend).

Pure functions, no database access. The same rules are implemented in
``frontend/src/lib/productHistory.js`` and both implementations are pinned
by ``contracts/price-stats-cases.json`` (see ``contracts/README.md``).

Records are any objects exposing ``price``, ``is_in_stock`` and
``timestamp`` (Unix seconds), e.g. ``ProductHist`` rows.

Definitions:
    * current: the newest record of the full history.
    * window: records with ``timestamp >= now - window_days * 86400``
      (the full history when ``window_days`` is ``None``).
    * baseline: in-stock window records other than *current*.
    * average: mean price of the baseline.
    * price change: current price vs. average, in percent.
    * lowest: cheapest in-stock window record (most recent on ties).
    * at lowest: current is in stock and not above *lowest*.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

SECONDS_PER_DAY = 60 * 60 * 24


@dataclass(frozen=True)
class PriceStats:
    """Statistics of a product's price history over a window."""

    current: Any | None
    window: list
    average: float | None
    price_change_pct: float | None
    lowest: Any | None
    is_at_lowest: bool


def _sorted_by_timestamp(history: Iterable) -> list:
    """Return a new list sorted by ascending timestamp (stable)."""
    return sorted(history, key=lambda record: record.timestamp)


def filter_window(history: Iterable, window_days: int | None, now: int) -> list:
    """Return the records inside the window, oldest first.

    Args:
        history (Iterable): Price-history records, in any order.
        window_days (int | None): Window length in days; ``None`` keeps
            the full history.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        list: A new list of the window's records, ascending by timestamp.
    """
    ordered = _sorted_by_timestamp(history)
    if window_days is None:
        return ordered
    cutoff = now - window_days * SECONDS_PER_DAY
    return [record for record in ordered if record.timestamp >= cutoff]


def compute_window_stats(window: list, current: Any | None) -> PriceStats:
    """Compute the statistics of an already filtered window.

    Args:
        window (list): Window records, ascending by timestamp.
        current (Any | None): The newest record of the full history (it
            may fall outside the window), or ``None`` without history.

    Returns:
        PriceStats: The window's statistics.
    """
    valid = [record for record in window if record.is_in_stock]
    baseline = [
        record
        for record in valid
        if current is None or record.timestamp != current.timestamp
    ]
    average = (
        sum(record.price for record in baseline) / len(baseline) if baseline else None
    )

    current_in_stock = current is not None and current.is_in_stock
    price_change_pct = None
    if current_in_stock and average is not None and average > 0:
        price_change_pct = (current.price - average) / average * 100

    lowest = None
    for record in valid:  # Ascending, so "<=" keeps the most recent on ties.
        if lowest is None or record.price <= lowest.price:
            lowest = record

    is_at_lowest = (
        current_in_stock and lowest is not None and current.price <= lowest.price
    )

    return PriceStats(
        current=current,
        window=list(window),
        average=average,
        price_change_pct=price_change_pct,
        lowest=lowest,
        is_at_lowest=is_at_lowest,
    )


def compute_price_stats(
    history: Iterable, window_days: int | None, now: int
) -> PriceStats:
    """Compute the statistics of a full price history over a window.

    Args:
        history (Iterable): Every price-history record of a product.
        window_days (int | None): Window length in days; ``None`` keeps
            the full history.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        PriceStats: The window's statistics.
    """
    ordered = _sorted_by_timestamp(history)
    current = ordered[-1] if ordered else None
    return compute_window_stats(filter_window(ordered, window_days, now), current)
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_price_stats_contract.py -v`
Expected: 15 passed (14 contract cases + the mutation test).

- [ ] **Step 8: Commit**

```bash
git add contracts backend/tests/contract_utils.py backend/tests/test_price_stats_contract.py backend/src/services/price_stats.py
git commit -m "feat(backend): add shared price-stats contract and Python price_stats module"
```

---

### Task 2: Backend historical window options

**Files:**
- Create: `contracts/hist-window.json`
- Create: `backend/tests/test_contracts.py`
- Modify: `backend/src/core/config.py`
- Modify: `backend/src/schemas/config.py`
- Modify: `backend/src/services/config_service.py:308-367`
- Test: `backend/tests/test_config.py`

**Interfaces:**
- Consumes: `tests.contract_utils.load_contract` (Task 1)
- Produces: `src.core.config.HIST_WINDOW_OPTIONS: tuple[int, ...] = (30, 60, 90, 180)`
- Produces: `src.core.config.DEFAULT_HIST_WINDOW: int = 60`
- Produces: `src.core.config.HistWindowSize = Literal[30, 60, 90, 180]`
- Produces: `src.core.config.get_hist_window_size(session: Session) -> int`

- [ ] **Step 1: Create `contracts/hist-window.json`**

```json
{
  "options": [30, 60, 90, 180],
  "default": 60
}
```

- [ ] **Step 2: Write the failing contract tests `backend/tests/test_contracts.py`**

```python
"""Backend side of the shared contracts (see ``contracts/README.md``).

The frontend side lives in ``frontend/src/lib/contracts.test.js``.
"""

from typing import get_args

from src.core.config import (
    CONFIG_DEFAULTS,
    DEFAULT_HIST_WINDOW,
    HIST_WINDOW_OPTIONS,
)
from src.schemas.config import ConfigUpdate
from tests.contract_utils import load_contract

HIST_WINDOW = load_contract("hist-window.json")


# --- hist-window.json ---


def test_hist_window_options_match_contract():
    assert list(HIST_WINDOW_OPTIONS) == HIST_WINDOW["options"]


def test_config_update_accepts_exactly_the_contract_options():
    annotation = ConfigUpdate.model_fields["hist_window_size"].annotation
    literal = next(arg for arg in get_args(annotation) if arg is not type(None))

    assert list(get_args(literal)) == HIST_WINDOW["options"]


def test_default_hist_window_matches_contract():
    assert DEFAULT_HIST_WINDOW == HIST_WINDOW["default"]
    assert CONFIG_DEFAULTS["hist_window_size"] == str(HIST_WINDOW["default"])
```

- [ ] **Step 3: Append the failing config tests to `backend/tests/test_config.py`**

Replace the module docstring with `"""Tests for /config/: telegram_status and the historical window size."""` and add at the end:

```python
import pytest
from src.core.config import get_hist_window_size
from src.models.database_models import Config


def _store_hist_window_size(session, value):
    session.add(Config(key="hist_window_size", value=value))
    session.commit()


@pytest.mark.parametrize("value", [30, 60, 90, 180])
def test_hist_window_size_accepts_every_option(client, value):
    response = client.patch("/config/", json={"hist_window_size": value})

    assert response.status_code == 200
    assert response.json()["hist_window_size"] == value


@pytest.mark.parametrize("value", [45, 0, 365])
def test_hist_window_size_rejects_values_outside_the_options(client, value):
    response = client.patch("/config/", json={"hist_window_size": value})

    assert response.status_code == 422


def test_hist_window_size_defaults_to_60_when_missing(session):
    assert get_hist_window_size(session) == 60


@pytest.mark.parametrize("stored", ["abc", "", "0", "-5"])
def test_corrupt_hist_window_size_falls_back_to_default(client, session, stored):
    _store_hist_window_size(session, stored)

    assert get_hist_window_size(session) == 60
    assert client.get("/config/").json()["hist_window_size"] == 60


def test_off_list_stored_hist_window_size_is_used_as_is(session):
    # Values saved before the options were enforced keep working.
    _store_hist_window_size(session, "45")

    assert get_hist_window_size(session) == 45
```

Move the two new imports (`pytest`, `get_hist_window_size`, `Config`) to the top of the file so ruff's import sorting passes.

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_contracts.py tests/test_config.py -v`
Expected: `ImportError: cannot import name 'DEFAULT_HIST_WINDOW'` (and `get_hist_window_size`).

- [ ] **Step 5: Implement the config constants and helper in `backend/src/core/config.py`**

Replace the imports and `CONFIG_DEFAULTS` block with:

```python
from typing import Literal

from sqlmodel import Session, select
from src.models.database_models import Config

# Historical window options, in days. Mirrored by the frontend
# (``frontend/src/lib/histWindow.js``) and pinned for both sides by
# ``contracts/hist-window.json``.
HIST_WINDOW_OPTIONS = (30, 60, 90, 180)
DEFAULT_HIST_WINDOW = 60
HistWindowSize = Literal[30, 60, 90, 180]

# Default configuration values used during initial database setup
# and as fallback when a key is missing.
CONFIG_DEFAULTS = {
    "analysis_hour": "12",
    "hist_window_size": str(DEFAULT_HIST_WINDOW),
    "is_price_drop_alert": "false",
    "is_stock_change_alert": "false",
    "telegram_bot_token": "",
    "telegram_bot_chat_id": "",
    "selected_language": "english",
    "google_api_key": "",
}
```

Append at the end of the file:

```python
def get_hist_window_size(session: Session) -> int:
    """Return the configured historical window size, in days.

    A stored value that is not a positive integer (e.g. a corrupted row)
    falls back to ``DEFAULT_HIST_WINDOW``. A positive value outside
    ``HIST_WINDOW_OPTIONS`` (saved before the options were enforced) is
    returned as-is.

    Args:
        session (Session): The database session.

    Returns:
        int: The window size in days.
    """
    raw = get_config_value(session, "hist_window_size", str(DEFAULT_HIST_WINDOW))
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_HIST_WINDOW
    return value if value > 0 else DEFAULT_HIST_WINDOW
```

- [ ] **Step 6: Use the `Literal` in `backend/src/schemas/config.py`**

```python
"""Request and response schemas for application configuration."""

from pydantic import BaseModel
from src.core.config import HistWindowSize


class ConfigUpdate(BaseModel):
    """Partial update payload for application configuration."""

    analysis_hour: int | None = None
    hist_window_size: HistWindowSize | None = None
    ...
```

(Keep every other field of both classes unchanged.)

- [ ] **Step 7: Update `backend/src/services/config_service.py`**

Import: `from src.core.config import get_config_value, get_hist_window_size, set_config_value`.

In `get_all_config` replace
`hist_window_size=int(get_config_value(session, "hist_window_size", "60")),` with
`hist_window_size=get_hist_window_size(session),`.

In `update_config` replace the whole `hist_window_size` block with:

```python
    if config_update.hist_window_size is not None:
        # Already restricted to HIST_WINDOW_OPTIONS by the schema (422).
        set_config_value(
            session, "hist_window_size", str(config_update.hist_window_size)
        )
```

and update the docstring's `Raises:` line to `HTTPException: If analysis_hour is out of range.`

- [ ] **Step 8: Run the backend suite**

Run: `cd backend && uv run pytest -v`
Expected: all pass (`test_products.py` still uses `_get_hist_window_size` internally, unchanged in this task).

- [ ] **Step 9: Commit**

```bash
git add contracts/hist-window.json backend/src/core/config.py backend/src/schemas/config.py backend/src/services/config_service.py backend/tests/test_contracts.py backend/tests/test_config.py
git commit -m "feat(backend): restrict the historical window to the shared day options"
```

---

### Task 3: Backend product API on the shared formulas

**Files:**
- Create: `contracts/api-fields.json`
- Modify: `backend/src/schemas/product.py:101-155`
- Modify: `backend/src/services/product_service.py` (imports, `_store_fields`, remove `_get_hist_window_size`/`_compute_price_change`/`MAX_RECENT_PRICES`/`_get_recent_prices`, rewrite `get_dashboard_summary` and `get_detail`)
- Test: `backend/tests/test_contracts.py`, `backend/tests/test_products.py`

**Interfaces:**
- Consumes: `price_stats.SECONDS_PER_DAY`, `price_stats.compute_window_stats` (Task 1); `get_hist_window_size` (Task 2)
- Produces: `product_service.get_dashboard_summary(session: Session, now: int | None = None) -> list[ProductDashboardSummary]`
- Produces (API): `ProductDashboardSummary.price_change_pct: float | None`, `ProductDashboardSummary.is_at_lowest: bool`; `ProductDetailResponse` without `min_price`.

- [ ] **Step 1: Create `contracts/api-fields.json`**

```json
{
  "ProductDashboardSummary": [
    "id",
    "name",
    "url",
    "category_id",
    "category_name",
    "category_color",
    "priority",
    "current_price",
    "price_change_pct",
    "is_in_stock",
    "is_at_lowest",
    "currency",
    "store_id",
    "store_name",
    "store_domain",
    "store_has_favicon",
    "recent_prices",
    "last_checked_at"
  ],
  "ProductDetailResponse": [
    "id",
    "name",
    "url",
    "priority",
    "category_id",
    "category_name",
    "category_color",
    "description",
    "current_price",
    "is_in_stock",
    "price_history",
    "currency",
    "store_id",
    "store_name",
    "store_domain",
    "store_has_favicon",
    "last_checked_at"
  ],
  "ProductHistResponse": ["price", "is_in_stock", "timestamp"]
}
```

- [ ] **Step 2: Add the failing API-fields contract test to `backend/tests/test_contracts.py`**

Add imports `import pytest` and `from src.schemas.product import ProductDashboardSummary, ProductDetailResponse, ProductHistResponse`, then append:

```python
API_FIELDS = load_contract("api-fields.json")


# --- api-fields.json ---


@pytest.mark.parametrize(
    "schema",
    [ProductDashboardSummary, ProductDetailResponse, ProductHistResponse],
    ids=lambda schema: schema.__name__,
)
def test_schema_fields_match_contract(schema):
    assert set(schema.model_fields) == set(API_FIELDS[schema.__name__])
```

- [ ] **Step 3: Rewrite the dashboard/detail tests in `backend/tests/test_products.py`**

Update the module docstring to:

```python
"""Tests for the dashboard summary and product detail responses.

Covers the day-based window (``recent_prices``, ``price_change_pct``,
``is_at_lowest``), ``last_checked_at``, the absence of ``min_price``, the
dashboard's constant query count, and partial product updates.
"""
```

Add imports at the top: `import time`, `from sqlalchemy import event`, `from src.models.database_models import Store`, `from src.services import product_service`, and add `DAY = 60 * 60 * 24` after the imports.

Delete these three tests entirely: `test_dashboard_summary_recent_prices_window_smaller_than_history`, `test_dashboard_summary_recent_prices_window_larger_than_history`, `test_dashboard_summary_recent_prices_capped_at_60`.

In `test_dashboard_summary_empty_history_has_empty_recent_prices_and_no_last_checked`, add after the existing asserts:

```python
    assert data["price_change_pct"] is None
    assert data["is_at_lowest"] is False
```

Add these tests in the "Dashboard summary" section:

```python
def test_dashboard_summary_recent_prices_follow_the_day_window(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [
            (1.0, True, now - 40 * DAY),  # Outside the 30-day window
            (2.0, True, now - 20 * DAY),
            (3.0, False, now - 10 * DAY),  # Out of stock: still drawn
            (4.0, True, now - DAY),
        ],
    )
    _set_hist_window_size(session, 30)

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["recent_prices"] == [2.0, 3.0, 4.0]


def test_dashboard_summary_recent_prices_are_not_capped(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [(float(day), True, now - day * DAY) for day in range(100)],
    )
    _set_hist_window_size(session, 180)

    data = client.get("/products/dashboard-summary").json()[0]

    assert len(data["recent_prices"]) == 100


def test_dashboard_summary_price_change_and_at_lowest(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [
            (100.0, True, now - 3 * DAY),
            (100.0, True, now - 2 * DAY),
            (90.0, True, now - DAY),
        ],
    )

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["price_change_pct"] == pytest.approx(-10.0)
    assert data["is_at_lowest"] is True
    assert data["current_price"] == 90.0


def test_dashboard_summary_current_out_of_stock(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [(100.0, True, now - 2 * DAY), (80.0, False, now - DAY)],
    )

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["current_price"] == 80.0
    assert data["is_in_stock"] is False
    assert data["price_change_pct"] is None
    assert data["is_at_lowest"] is False


def test_dashboard_summary_history_older_than_the_window(client, session):
    # Review focus: the cron stopped weeks ago.
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    old_timestamp = now - 100 * DAY
    _add_history(session, product.id, [(50.0, True, old_timestamp)])
    _set_hist_window_size(session, 60)

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["current_price"] == 50.0
    assert data["is_in_stock"] is True
    assert data["last_checked_at"] == old_timestamp
    assert data["recent_prices"] == []
    assert data["price_change_pct"] is None
    assert data["is_at_lowest"] is False


def _count_queries(session, action):
    """Run ``action`` and return how many SQL statements it executed."""
    engine = session.get_bind()
    statements = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        action()
    finally:
        event.remove(engine, "before_cursor_execute", _record)
    return len(statements)


def _seed_products(session, count, start=0):
    now = int(time.time())
    for index in range(start, start + count):
        category = _make_category(session, name=f"Category {index}")
        store = Store(domain=f"store{index}.com", name=f"Store {index}")
        session.add(store)
        session.commit()
        product = _make_product(session, category.id, name=f"Product {index}")
        product.store_id = store.id
        session.add(product)
        session.commit()
        _add_history(
            session,
            product.id,
            [(10.0, True, now - 2 * DAY), (9.0, True, now - DAY)],
        )
    session.expire_all()


def test_dashboard_summary_query_count_does_not_grow_with_products(session):
    _seed_products(session, 1)
    one_product = _count_queries(
        session, lambda: product_service.get_dashboard_summary(session)
    )

    _seed_products(session, 4, start=1)
    five_products = _count_queries(
        session, lambda: product_service.get_dashboard_summary(session)
    )

    assert five_products == one_product
```

Add `import pytest` to the imports. In the "Detail" section add:

```python
def test_product_detail_has_no_min_price(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(session, product.id, [(10.0, True, 100)])

    data = client.get(f"/products/{product.id}").json()

    assert "min_price" not in data
    assert data["price_history"] == [
        {"price": 10.0, "is_in_stock": True, "timestamp": 100}
    ]
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_products.py tests/test_contracts.py -v`
Expected: FAIL — `KeyError: 'price_change_pct'`/`'is_at_lowest'`, `recent_prices` mismatches, `min_price` present, query count grows, and the schema contract test fails.

- [ ] **Step 5: Update the schemas in `backend/src/schemas/product.py`**

Replace `ProductDashboardSummary` and `ProductDetailResponse` with:

```python
class ProductDashboardSummary(BaseModel):
    """Summary of a product for the dashboard view.

    Price statistics follow ``src/services/price_stats.py`` over the
    configured historical window (in days). Field names are pinned by
    ``contracts/api-fields.json``.
    """

    id: int
    name: str
    url: str
    category_id: int
    category_name: str
    category_color: str
    priority: str
    current_price: float | None
    price_change_pct: float | None
    is_in_stock: bool | None
    is_at_lowest: bool
    currency: str
    store_id: int | None
    store_name: str | None
    store_domain: str | None
    store_has_favicon: bool
    recent_prices: list[float]
    last_checked_at: int | None
```

```python
class ProductDetailResponse(BaseModel):
    """Full product detail including the whole price history.

    Range statistics are computed by the frontend from ``price_history``.
    Field names are pinned by ``contracts/api-fields.json``.
    """

    id: int
    name: str
    url: str
    priority: str
    category_id: int
    category_name: str
    category_color: str
    description: str
    current_price: float | None
    is_in_stock: bool | None
    price_history: list[ProductHistResponse]
    currency: str
    store_id: int | None
    store_name: str | None
    store_domain: str | None
    store_has_favicon: bool
    last_checked_at: int | None
```

- [ ] **Step 6: Rewrite the aggregation in `backend/src/services/product_service.py`**

Replace the module docstring's second paragraph with: `Dashboard price statistics are delegated to ``price_stats``.` Update the imports:

```python
import time
from collections import defaultdict

from fastapi import HTTPException
from sqlalchemy import and_, func
from sqlmodel import Session, col, select
from src.core.config import get_config_value, get_hist_window_size
from src.models.database_models import Category, Product, ProductHist, Store
from src.schemas.product import (
    ProductCreate,
    ProductDashboardSummary,
    ProductDetailResponse,
    ProductHistResponse,
    ProductInfoRequest,
    ProductInfoResponse,
    ProductUpdate,
)
from src.services import store_service
from src.services.price_stats import SECONDS_PER_DAY, compute_window_stats
from src.stagehand_utils import get_product_info
```

Replace `_store_fields` with:

```python
def _store_fields(store: Store | None) -> dict:
    """Return the store fields shared by the summary and detail responses.

    Args:
        store (Store | None): The product's store, if any.

    Returns:
        dict: ``store_id``, ``store_name``, ``store_domain`` and
            ``store_has_favicon`` (empty values when there is no store).
    """
    return {
        "store_id": store.id if store else None,
        "store_name": store.name if store else None,
        "store_domain": store.domain if store else None,
        "store_has_favicon": bool(store and store.favicon),
    }
```

Replace everything from `# --- Dashboard and detail aggregation ---` down to (not including) `# --- AI extraction ---` with:

```python
# --- Dashboard and detail aggregation ---


def _by_id(session: Session, model, ids: set) -> dict:
    """Load the rows of ``model`` whose id is in ``ids``, in one query.

    Args:
        session (Session): Active database session.
        model: A SQLModel table class with an ``id`` column.
        ids (set): Ids to load (``None`` values are ignored).

    Returns:
        dict: Rows keyed by id.
    """
    wanted = {row_id for row_id in ids if row_id is not None}
    rows = session.exec(select(model).where(col(model.id).in_(wanted))).all()
    return {row.id: row for row in rows}


def _window_records(session: Session, cutoff: int) -> dict[int, list[ProductHist]]:
    """Load every history record at or after ``cutoff``, grouped by product.

    Args:
        session (Session): Active database session.
        cutoff (int): Oldest Unix timestamp to include.

    Returns:
        dict[int, list[ProductHist]]: Records per product id, oldest first.
    """
    rows = session.exec(
        select(ProductHist)
        .where(ProductHist.timestamp >= cutoff)
        .order_by(ProductHist.product_id, ProductHist.timestamp, ProductHist.id)
    ).all()
    grouped: dict[int, list[ProductHist]] = defaultdict(list)
    for row in rows:
        grouped[row.product_id].append(row)
    return grouped


def _latest_records(session: Session) -> dict[int, ProductHist]:
    """Load the newest history record of every product, in one query.

    It may be older than the window (e.g. when the cronjob stopped), so it
    is loaded separately from ``_window_records``.

    Args:
        session (Session): Active database session.

    Returns:
        dict[int, ProductHist]: Newest record per product id (the highest
            id wins when two records share the newest timestamp).
    """
    newest = (
        select(
            ProductHist.product_id,
            func.max(ProductHist.timestamp).label("max_timestamp"),
        )
        .group_by(ProductHist.product_id)
        .subquery()
    )
    rows = session.exec(
        select(ProductHist)
        .join(
            newest,
            and_(
                ProductHist.product_id == newest.c.product_id,
                ProductHist.timestamp == newest.c.max_timestamp,
            ),
        )
        .order_by(ProductHist.id)
    ).all()
    return {row.product_id: row for row in rows}


def get_dashboard_summary(
    session: Session, now: int | None = None
) -> list[ProductDashboardSummary]:
    """Build the enriched dashboard summary for all products.

    Runs a constant number of queries regardless of the number of
    products. Price statistics follow ``price_stats`` over the configured
    historical window (in days).

    Args:
        session (Session): Active database session.
        now (int | None): Reference Unix timestamp; defaults to the
            current time.

    Returns:
        List[ProductDashboardSummary]: Enriched product summaries.
    """
    now = int(time.time()) if now is None else now
    cutoff = now - get_hist_window_size(session) * SECONDS_PER_DAY

    products = session.exec(select(Product)).all()
    categories = _by_id(session, Category, {p.category_id for p in products})
    stores = _by_id(session, Store, {p.store_id for p in products})
    windows = _window_records(session, cutoff)
    latest = _latest_records(session)

    summary_list: list[ProductDashboardSummary] = []
    for product in products:
        category = categories.get(product.category_id)
        current = latest.get(product.id)
        window = windows.get(product.id, [])
        stats = compute_window_stats(window, current)

        summary_list.append(
            ProductDashboardSummary(
                id=product.id,
                name=product.name,
                url=product.url,
                category_id=product.category_id,
                category_name=category.name if category else "Unknown",
                category_color=category.color if category else "gray",
                priority=product.priority,
                current_price=current.price if current else None,
                price_change_pct=stats.price_change_pct,
                is_in_stock=current.is_in_stock if current else None,
                is_at_lowest=stats.is_at_lowest,
                currency=product.currency,
                **_store_fields(stores.get(product.store_id)),
                recent_prices=[record.price for record in window],
                last_checked_at=current.timestamp if current else None,
            )
        )

    return summary_list


def get_detail(session: Session, product_id: int) -> ProductDetailResponse:
    """Build the full product detail response including price history.

    Args:
        session (Session): Active database session.
        product_id (int): The product's primary key.

    Returns:
        ProductDetailResponse: Complete product details.

    Raises:
        HTTPException: 404 if the product does not exist.
    """
    product = session.get(Product, product_id)
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    category = session.get(Category, product.category_id)
    store = (
        session.get(Store, product.store_id) if product.store_id is not None else None
    )

    # Chronological order for charts
    product_history = session.exec(
        select(ProductHist)
        .where(ProductHist.product_id == product_id)
        .order_by(ProductHist.timestamp, ProductHist.id)
    ).all()
    current = product_history[-1] if product_history else None

    return ProductDetailResponse(
        id=product.id,
        name=product.name,
        url=product.url,
        priority=product.priority,
        category_id=product.category_id,
        category_name=category.name if category else "Unknown",
        category_color=category.color if category else "gray",
        description=product.description,
        current_price=current.price if current else None,
        is_in_stock=current.is_in_stock if current else None,
        price_history=[
            ProductHistResponse(
                price=record.price,
                is_in_stock=record.is_in_stock,
                timestamp=record.timestamp,
            )
            for record in product_history
        ],
        currency=product.currency,
        **_store_fields(store),
        last_checked_at=current.timestamp if current else None,
    )
```

`get_config_value` is still used by `extract_product_info`; keep that import.

- [ ] **Step 7: Run the backend suite and lint**

Run: `cd backend && uv run pytest -v && uv run ruff check . && uv run ruff format --check .`
Expected: all pass, no lint errors.

- [ ] **Step 8: Commit**

```bash
git add contracts/api-fields.json backend/src/schemas/product.py backend/src/services/product_service.py backend/tests/test_contracts.py backend/tests/test_products.py
git commit -m "refactor(backend)!: compute dashboard price stats by days with constant queries

BREAKING CHANGE: price_change_60d is renamed to price_change_pct, the
dashboard summary gains is_at_lowest and the detail drops min_price."
```

---

### Task 4: Cronjob validation, one record per day, stock-aware alerts and TZ

**Files:**
- Modify: `backend/src/product_status_cronjob.py`
- Create: `backend/tests/test_cronjob.py`
- Modify: `Dockerfile:25-40`
- Modify: `justfile` (variables and `docker-run`)

**Interfaces:**
- Produces: `product_status_cronjob.fetch_and_store_product_status(now: datetime | None = None) -> None` (naive local `datetime`)
- Produces: `product_status_cronjob._is_valid_price(price) -> bool`
- Consumes: `stagehand_utils.ProductStatusExtraction(price: float, is_in_stock: bool)`; `send_price_drop_alert(**kwargs)` / `send_stock_alert(**kwargs)` keyword signatures from `src/telegram_utils.py`.

- [ ] **Step 1: Write the failing tests `backend/tests/test_cronjob.py`**

```python
"""Tests for the daily price tracking cronjob.

Stagehand and Telegram are replaced by fakes; the cronjob's own
``Session(engine)`` is pointed at the in-memory test database.
"""

import asyncio
import math
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import select
from src import product_status_cronjob as cronjob
from src.models.database_models import Category, Config, Product, ProductHist
from src.stagehand_utils import ProductStatusExtraction

NOW = datetime(2026, 9, 26, 12, 0)  # Naive local time, like datetime.now()


def _ts(moment: datetime) -> int:
    return int(moment.timestamp())


@pytest.fixture
def cron(session, monkeypatch):
    """Configure alerts, fake Stagehand/Telegram and return the recorders."""
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    for key, value in {
        "google_api_key": "key",
        "telegram_bot_token": "token",
        "telegram_bot_chat_id": "chat",
        "is_price_drop_alert": "true",
        "is_stock_change_alert": "true",
    }.items():
        session.add(Config(key=key, value=value))
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    product = Product(
        name="Widget",
        url="https://example.com/widget",
        priority="medium",
        category_id=category.id,
        description="A widget",
        currency="EUR",
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    product_id, product_url = product.id, product.url
    session.commit()  # Release the connection before the cronjob uses it.

    env = SimpleNamespace(
        product_id=product_id,
        product_url=product_url,
        status=ProductStatusExtraction(price=100.0, is_in_stock=True),
        scraped=[],
        price_drop_alerts=[],
        stock_alerts=[],
    )

    async def fake_get_product_status(api_key, url):
        env.scraped.append(url)
        return env.status

    async def fake_price_drop_alert(**kwargs):
        env.price_drop_alerts.append(kwargs)

    async def fake_stock_alert(**kwargs):
        env.stock_alerts.append(kwargs)

    monkeypatch.setattr(cronjob, "get_product_status", fake_get_product_status)
    monkeypatch.setattr(cronjob, "send_price_drop_alert", fake_price_drop_alert)
    monkeypatch.setattr(cronjob, "send_stock_alert", fake_stock_alert)
    return env


def _add(session, product_id, price, is_in_stock, moment):
    session.add(
        ProductHist(
            product_id=product_id,
            price=price,
            is_in_stock=is_in_stock,
            timestamp=_ts(moment),
        )
    )
    session.commit()


def _history(session, product_id):
    session.expire_all()
    return session.exec(
        select(ProductHist)
        .where(ProductHist.product_id == product_id)
        .order_by(ProductHist.timestamp)
    ).all()


def _run():
    asyncio.run(cronjob.fetch_and_store_product_status(now=NOW))


def test_stores_a_valid_status(session, cron):
    _run()

    history = _history(session, cron.product_id)
    assert [(h.price, h.is_in_stock, h.timestamp) for h in history] == [
        (100.0, True, _ts(NOW))
    ]


@pytest.mark.parametrize("price", [0.0, -1.0, math.nan, math.inf])
def test_invalid_price_is_not_stored_and_sends_no_alert(session, cron, price):
    _add(session, cron.product_id, 120.0, True, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=price, is_in_stock=True)

    _run()

    assert len(_history(session, cron.product_id)) == 1
    assert cron.price_drop_alerts == []
    assert cron.stock_alerts == []


def test_skips_a_product_already_checked_today(session, cron):
    _add(session, cron.product_id, 100.0, True, NOW.replace(hour=1))

    _run()

    assert cron.scraped == []
    assert len(_history(session, cron.product_id)) == 1


def test_a_record_from_yesterday_late_night_does_not_block_today(session, cron):
    yesterday_late = datetime.combine(NOW.date(), datetime.min.time()) - timedelta(
        minutes=1
    )
    _add(session, cron.product_id, 100.0, True, yesterday_late)

    _run()

    assert cron.scraped == [cron.product_url]
    assert len(_history(session, cron.product_id)) == 2


def test_price_drop_compares_with_the_last_in_stock_price(session, cron):
    _add(session, cron.product_id, 120.0, True, NOW - timedelta(days=2))
    _add(session, cron.product_id, 90.0, False, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=True)

    _run()

    assert [(a["old_price"], a["new_price"]) for a in cron.price_drop_alerts] == [
        (120.0, 100.0)
    ]


def test_no_price_drop_alert_when_the_new_status_is_out_of_stock(session, cron):
    _add(session, cron.product_id, 120.0, True, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=False)

    _run()

    assert cron.price_drop_alerts == []
    assert len(_history(session, cron.product_id)) == 2


def test_back_in_stock_without_previous_in_stock_price(session, cron):
    # Review focus: nothing to compare the price with, but stock came back.
    _add(session, cron.product_id, 90.0, False, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=True)

    _run()

    assert cron.price_drop_alerts == []
    assert len(cron.stock_alerts) == 1
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_cronjob.py -v`
Expected: FAIL — `TypeError: fetch_and_store_product_status() got an unexpected keyword argument 'now'`.

- [ ] **Step 3: Update `backend/src/product_status_cronjob.py`**

Update the module docstring's list to:

```python
"""
Daily price tracking cronjob script.

This script should be run every hour via cron. It will:
1. Check if the current hour matches the configured analysis hour
2. If it matches, fetch prices for every product not yet checked today and
   store them in the database (invalid prices are discarded)
3. Send Telegram alerts if price drops or stock changes are detected (if configured)

"Today" and the analysis hour use the process local time, set with the
``TZ`` environment variable (the Docker image defaults to UTC).
"""
```

Replace the imports with:

```python
import asyncio
import logging
import math
import sys
from datetime import datetime, timedelta
from datetime import time as dt_time

from sqlmodel import Session, select
from src.core.config import get_config_value
from src.core.database import engine
from src.models.database_models import Product, ProductHist
from src.stagehand_utils import get_product_status
from src.telegram_utils import send_price_drop_alert, send_stock_alert
```

Replace `_check_price_drop` with:

```python
async def _check_price_drop(
    product,
    product_status,
    last_in_stock_hist,
    telegram_bot_token,
    telegram_bot_chat_id,
    selected_language,
):
    """Send a Telegram alert if the price dropped while in stock.

    Only prices you could actually buy are compared: the new status must be
    in stock and cheaper than the most recent in-stock record.

    Args:
        product: The Product record.
        product_status: Freshly scraped (and validated) status.
        last_in_stock_hist: The most recent in-stock ProductHist record,
            or None if the product was never in stock.
        telegram_bot_token (str): Bot token.
        telegram_bot_chat_id (str): Chat ID.
        selected_language (str): Language code.
    """
    if not product_status.is_in_stock or last_in_stock_hist is None:
        return
    if product_status.price < last_in_stock_hist.price:
        logger.info(
            f"Price drop detected for {product.name}: "
            f"{last_in_stock_hist.price} -> {product_status.price} {product.currency}"
        )
        try:
            await send_price_drop_alert(
                bot_token=telegram_bot_token,
                chat_id=telegram_bot_chat_id,
                product_name=product.name,
                product_url=product.url,
                old_price=last_in_stock_hist.price,
                new_price=product_status.price,
                lang=selected_language,
                currency=product.currency,
            )
            logger.info(f"Price drop alert sent for {product.name}")
        except Exception as e:
            logger.error(
                f"Failed to send price drop alert for {product.name}: {str(e)}"
            )
```

Add these helpers after `_load_telegram_settings`:

```python
def _is_valid_price(price) -> bool:
    """Whether a scraped price can be stored (finite and positive).

    Args:
        price: The scraped price.

    Returns:
        bool: True for a finite number greater than zero.
    """
    return (
        isinstance(price, int | float)
        and not isinstance(price, bool)
        and math.isfinite(price)
        and price > 0
    )


def _local_day_bounds(now: datetime) -> tuple[int, int]:
    """Return the Unix timestamps of the start of ``now``'s local day and the next.

    Args:
        now (datetime): A naive local datetime.

    Returns:
        tuple[int, int]: ``(start, end)`` with ``start <= t < end`` for
            every timestamp ``t`` of that day.
    """
    start = datetime.combine(now.date(), dt_time.min)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp())


def _has_record_between(session: Session, product_id: int, start: int, end: int) -> bool:
    """Whether the product already has a history record in ``[start, end)``."""
    return (
        session.exec(
            select(ProductHist.id).where(
                ProductHist.product_id == product_id,
                ProductHist.timestamp >= start,
                ProductHist.timestamp < end,
            )
        ).first()
        is not None
    )


def _last_record(session: Session, product_id: int, in_stock_only: bool = False):
    """Return the most recent history record (optionally only in-stock ones)."""
    query = select(ProductHist).where(ProductHist.product_id == product_id)
    if in_stock_only:
        query = query.where(ProductHist.is_in_stock == True)  # noqa: E712
    return session.exec(
        query.order_by(ProductHist.timestamp.desc(), ProductHist.id.desc())
    ).first()
```

Replace `fetch_and_store_product_status` with:

```python
async def fetch_and_store_product_status(now: datetime | None = None):
    """Fetch product status for all products and store them in the database.

    Products already checked today are skipped, invalid prices are not
    stored, and Telegram alerts are sent when price drops or stock changes
    are detected (when configured).

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    logger.info("Starting product status fetch process...")

    with Session(engine) as session:
        # Google API key
        google_api_key = get_config_value(session, "google_api_key")
        if not google_api_key:
            logger.error("Google API key not configured in database. Exiting.")
            return

        # Telegram settings
        tg = _load_telegram_settings(session)

        if tg["enabled"]:
            logger.info("Telegram notifications enabled")
            logger.info(
                f"Price drop alerts: {tg['price_drop']}, "
                f"Stock change alerts: {tg['stock_change']}"
            )
        else:
            logger.info("Telegram notifications disabled (credentials not configured)")

        # Products
        products = session.exec(select(Product)).all()
        if not products:
            logger.info("No products found in database. Exiting.")
            return

        logger.info(f"Found {len(products)} products to process")
        current_timestamp = int(now.timestamp())
        day_start, day_end = _local_day_bounds(now)

        success_count = 0
        skipped_count = 0
        error_count = 0

        for product in products:
            try:
                if _has_record_between(session, product.id, day_start, day_end):
                    logger.info(
                        f"Skipping {product.name} (ID: {product.id}): already checked today"
                    )
                    skipped_count += 1
                    continue

                logger.info(
                    f"Fetching product status for: {product.name} (ID: {product.id})"
                )
                product_status = await get_product_status(google_api_key, product.url)

                if not _is_valid_price(product_status.price):
                    logger.error(
                        f"Invalid price {product_status.price!r} for {product.name} "
                        f"(ID: {product.id}); nothing stored"
                    )
                    error_count += 1
                    continue

                # Conditional alerts
                if tg["enabled"]:
                    if tg["price_drop"]:
                        await _check_price_drop(
                            product,
                            product_status,
                            _last_record(session, product.id, in_stock_only=True),
                            tg["token"],
                            tg["chat_id"],
                            tg["language"],
                        )
                    last_product_hist = _last_record(session, product.id)
                    if tg["stock_change"] and last_product_hist:
                        await _check_stock_change(
                            product,
                            product_status,
                            last_product_hist,
                            tg["token"],
                            tg["chat_id"],
                            tg["language"],
                        )

                # Store new history record
                session.add(
                    ProductHist(
                        product_id=product.id,
                        price=product_status.price,
                        is_in_stock=product_status.is_in_stock,
                        timestamp=current_timestamp,
                    )
                )
                session.commit()

                logger.info(
                    f"Stored price {product_status.price} / stock {product_status.is_in_stock} "
                    f"for {product.name}"
                )
                success_count += 1

            except Exception as e:
                logger.error(
                    f"Error processing {product.name} (ID: {product.id}): {str(e)}"
                )
                error_count += 1
                continue

        logger.info(
            f"Process completed. Success: {success_count}, "
            f"Skipped: {skipped_count}, Errors: {error_count}"
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_cronjob.py -v && uv run pytest && uv run ruff check . && uv run ruff format --check .`
Expected: 10 cronjob tests pass (7 functions, one parametrized ×4), full suite passes, no lint errors.

- [ ] **Step 5: Install `tzdata` and default `TZ` in the `Dockerfile`**

In the runtime stage `apt-get install` list add `tzdata \` after `chromium \`, and add `TZ=UTC \` as the first line of the `ENV` block:

```dockerfile
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    cron \
    chromium \
    tzdata \
    && rm -f /etc/nginx/sites-enabled/default \
    && rm -rf /var/lib/apt/lists/*
```

```dockerfile
ENV TZ=UTC \
    CHROME_PATH=/usr/bin/chromium \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/backend/.venv/bin:$PATH"
```

Add a comment above the `ENV` block: `# TZ sets the local time used for the analysis hour and "one record per day" (override with -e TZ=Europe/Madrid).`

- [ ] **Step 6: Pass `TZ` through `just docker-run`**

In `justfile` add after `port := "7755"`:

```just
tz := env("TZ", "UTC")
```

and add `-e TZ={{ tz }} \` to `docker-run` right after the `-p` line. Check the syntax with `just --list` (expected: lists recipes, no parse error).

- [ ] **Step 7: Verify the image timezone (optional, needs Docker)**

Run: `docker build -t wishlist-tracker:tz-check . && docker run --rm -e TZ=Europe/Madrid --entrypoint date wishlist-tracker:tz-check +%Z`
Expected: `CEST` or `CET` (not `UTC`). Skip if Docker is unavailable and say so in the task report.

- [ ] **Step 8: Commit**

```bash
git add backend/src/product_status_cronjob.py backend/tests/test_cronjob.py Dockerfile justfile
git commit -m "feat(backend): validate scraped prices, store one record per day and alert on in-stock drops"
```

---

### Task 5: Frontend historical window constant and settings

**Files:**
- Create: `frontend/src/lib/histWindow.js`
- Create: `frontend/src/test/contracts.js`
- Create: `frontend/src/lib/contracts.test.js`
- Modify: `frontend/src/lib/productHistory.js:1-60` (`RANGE_OPTIONS`, `resolveDefaultRange`)
- Modify: `frontend/src/lib/productHistory.test.js:18-46`
- Modify: `frontend/src/components/settings/AnalysisSection.jsx`
- Modify: `frontend/src/components/settings/AnalysisSection.test.jsx`
- Modify: `frontend/src/pages/ProductPage.jsx:60-62`
- Modify: `frontend/src/i18n/english.json:321-324`, `frontend/src/i18n/spanish.json:321-324`

**Interfaces:**
- Produces: `histWindow.HIST_WINDOW_OPTIONS: number[]`, `histWindow.DEFAULT_HIST_WINDOW: number`, `histWindow.resolveHistWindow(value) -> number` (value if it is an option, else the default)
- Produces: `productHistory.RANGE_OPTIONS: string[]` (derived), `productHistory.resolveDefaultRange(histWindowSize) -> string`
- Produces: `test/contracts.readContract(name: string) -> object`
- `productHistory.js` must import `./histWindow` with a **relative** path (Task 7's Playwright fixtures import it from Node, where the `@` alias does not exist).

- [ ] **Step 1: Create `frontend/src/test/contracts.js`**

```js
import { readFileSync } from 'node:fs';

/**
 * Reads one of the shared frontend/backend contracts in the repository's
 * top-level `contracts/` directory (see `contracts/README.md`). Tests only:
 * application code must never import the contracts.
 *
 * @param {string} name - File name inside `contracts/`.
 * @returns {any} The parsed JSON document.
 */
export const readContract = (name) =>
  JSON.parse(
    readFileSync(new URL(`../../../contracts/${name}`, import.meta.url), 'utf8')
  );
```

- [ ] **Step 2: Write the failing contract test `frontend/src/lib/contracts.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import { DEFAULT_HIST_WINDOW, HIST_WINDOW_OPTIONS } from './histWindow';
import { RANGE_OPTIONS } from './productHistory';

// Frontend side of the shared contracts (see `contracts/README.md`); the
// backend side lives in `backend/tests/test_contracts.py`.

const HIST_WINDOW = readContract('hist-window.json');

describe('hist-window contract', () => {
  it('pins the window options', () => {
    expect(HIST_WINDOW_OPTIONS).toEqual(HIST_WINDOW.options);
  });

  it('pins the default window', () => {
    expect(DEFAULT_HIST_WINDOW).toBe(HIST_WINDOW.default);
  });

  it('offers exactly the window options as chart ranges', () => {
    expect(RANGE_OPTIONS.map(Number)).toEqual(HIST_WINDOW.options);
  });
});
```

- [ ] **Step 3: Replace the `resolveDefaultRange` tests in `frontend/src/lib/productHistory.test.js`**

Replace the whole `describe('resolveDefaultRange', ...)` block with:

```js
describe('resolveDefaultRange', () => {
  it('returns the configured window when it is one of the options', () => {
    for (const option of RANGE_OPTIONS) {
      expect(resolveDefaultRange(Number(option))).toBe(option);
    }
  });

  it('falls back to the default window for any other value', () => {
    for (const value of [45, 1, 1000, null, undefined, NaN]) {
      expect(resolveDefaultRange(value)).toBe('60');
    }
  });
});
```

- [ ] **Step 4: Add the failing settings test to `AnalysisSection.test.jsx`**

```js
  it('selects the default window when the stored value is not an option', () => {
    // Review focus: a value saved before the options were enforced.
    renderWithProviders(
      <AnalysisSection {...baseProps} histWindowSize={45} />
    );

    expect(screen.getByRole('radio', { name: '60 days' })).toBeChecked();
  });
```

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/contracts.test.js src/lib/productHistory.test.js src/components/settings/AnalysisSection.test.jsx`
Expected: FAIL — `Failed to resolve import "./histWindow"`, `resolveDefaultRange(45)` returns `'30'`, no radio checked for 45.

- [ ] **Step 6: Create `frontend/src/lib/histWindow.js`**

```js
/**
 * The historical window options, in days, shared by the settings page and
 * the product chart's range selector. Mirrored by the backend
 * (`backend/src/core/config.py`) and pinned for both sides by
 * `contracts/hist-window.json`.
 * @type {number[]}
 */
export const HIST_WINDOW_OPTIONS = [30, 60, 90, 180];

/** The window used when none (or an unknown one) is configured. */
export const DEFAULT_HIST_WINDOW = 60;

/**
 * @param {unknown} value - A configured `hist_window_size`.
 * @returns {number} `value` when it is one of `HIST_WINDOW_OPTIONS`,
 *   otherwise `DEFAULT_HIST_WINDOW`.
 */
export const resolveHistWindow = (value) =>
  HIST_WINDOW_OPTIONS.includes(value) ? value : DEFAULT_HIST_WINDOW;
```

- [ ] **Step 7: Derive the range options in `frontend/src/lib/productHistory.js`**

Add at the top of the file (after the module JSDoc): `import { HIST_WINDOW_OPTIONS, resolveHistWindow } from './histWindow';`

Replace the `RANGE_OPTIONS` declaration and its JSDoc with:

```js
/**
 * The day-count range options offered by the chart's range selector: the
 * historical window options (`./histWindow.js`) as strings (the values
 * `SegmentedControl` needs), from shortest to longest.
 * @type {string[]}
 */
export const RANGE_OPTIONS = HIST_WINDOW_OPTIONS.map(String);
```

Replace `resolveDefaultRange` (and its JSDoc) with:

```js
/**
 * The chart's default range: the app's configured `hist_window_size` when
 * it is one of the options, otherwise the default window.
 *
 * @param {number|null|undefined} histWindowSize
 * @returns {string} One of `RANGE_OPTIONS`.
 */
export function resolveDefaultRange(histWindowSize) {
  return String(resolveHistWindow(histWindowSize));
}
```

- [ ] **Step 8: Use the constant in `AnalysisSection.jsx`**

Add `import { HIST_WINDOW_OPTIONS, resolveHistWindow } from '@/lib/histWindow';`, delete `const HIST_WINDOW_VALUES = [30, 60, 90, 180];`, replace `HIST_WINDOW_VALUES.map` with `HIST_WINDOW_OPTIONS.map`, and at the top of the component body add:

```js
  // A stored value outside the options (saved before they were enforced)
  // shows the default as selected until the user saves a valid one.
  const selectedHistWindow = resolveHistWindow(histWindowSize).toString();
```

Use `selectedHistWindow` for both `value={...}` props of the history-window `SegmentedControl` and `SelectRoot` (`value={selectedHistWindow}` and `value={[selectedHistWindow]}`). Update the component JSDoc's `histWindowSize` param to: `@param {number} props.histWindowSize - In days; see `HIST_WINDOW_OPTIONS`.`

- [ ] **Step 9: Use the default in `ProductPage.jsx`**

Add `import { DEFAULT_HIST_WINDOW } from '@/lib/histWindow';` and replace `const histWindowSize = config?.hist_window_size ?? 60;` with `const histWindowSize = config?.hist_window_size ?? DEFAULT_HIST_WINDOW;`. Update the comment above `useState(() => resolveDefaultRange(...))` from "(rounded to the nearest offered option)" to "(or the default window when it is not an offered option)".

- [ ] **Step 10: Update the settings copy**

`frontend/src/i18n/english.json`:

```json
        "historicalWindow": {
          "label": "Historical window size",
          "helper": "Number of days used for price trends, averages and lowest prices. Out-of-stock checks are ignored in these statistics."
        },
```

`frontend/src/i18n/spanish.json`:

```json
        "historicalWindow": {
          "label": "Ventana histórica",
          "helper": "Número de días usados para las tendencias, promedios y precios mínimos. Las comprobaciones sin stock no cuentan en estas estadísticas."
        },
```

- [ ] **Step 11: Run the frontend suite and lint**

Run: `cd frontend && npm test && npm run lint && npm run format:check`
Expected: all pass. (Any snapshot/text test asserting the old helper string must be updated to the new copy.)

- [ ] **Step 12: Commit**

```bash
git add frontend/src/lib/histWindow.js frontend/src/test/contracts.js frontend/src/lib/contracts.test.js frontend/src/lib/productHistory.js frontend/src/lib/productHistory.test.js frontend/src/components/settings/AnalysisSection.jsx frontend/src/components/settings/AnalysisSection.test.jsx frontend/src/pages/ProductPage.jsx frontend/src/i18n/english.json frontend/src/i18n/spanish.json
git commit -m "feat(frontend): share the historical window options with the backend contract"
```

---

### Task 6: Frontend detail stats mirror

**Files:**
- Create: `frontend/src/lib/productHistory.contract.test.js`
- Modify: `frontend/src/lib/productHistory.js` (`computeRangeStats`, new `getCurrentRecord`, `computeYDomain`)
- Modify: `frontend/src/lib/productHistory.test.js` (`computeRangeStats`, `computeYDomain` blocks)
- Modify: `frontend/src/pages/ProductPage.jsx:149-152`
- Modify: `frontend/src/pages/ProductPage.test.jsx`, `ProductPage.edit.test.jsx`, `ProductPage.delete.test.jsx` (drop `min_price`)
- Modify: `frontend/src/components/product/PriceHistoryChart.jsx:233-242`

**Interfaces:**
- Consumes: `readContract` (Task 5)
- Produces: `productHistory.getCurrentRecord(priceHistory) -> PriceHistoryRecord|null`
- Produces: `productHistory.computeRangeStats(filteredHistory, current) -> { lowest: {price, timestamp}|null, average: number|null, currentVsAverage: number|null, isAtLowest: boolean }` — `current` is a history record (or `null`), no longer a number.

- [ ] **Step 1: Write the failing contract test `frontend/src/lib/productHistory.contract.test.js`**

```js
import { describe, expect, it } from 'vitest';
import { readContract } from '@/test/contracts';
import {
  RANGE_ALL,
  computeRangeStats,
  filterPriceHistoryByRange,
  getCurrentRecord
} from './productHistory';

// The same cases (`contracts/price-stats-cases.json`) run against the
// backend's `price_stats.py` in `test_price_stats_contract.py`, so the two
// implementations cannot drift apart silently.

const { tolerance, cases } = readContract('price-stats-cases.json');

const expectClose = (actual, expected) => {
  if (expected === null) {
    expect(actual).toBeNull();
    return;
  }
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
};

describe('price-stats contract', () => {
  it.each(cases.map((testCase) => [testCase.name, testCase]))(
    '%s',
    (_name, { history, now, window_days: windowDays, expected }) => {
      const range = windowDays === null ? RANGE_ALL : String(windowDays);
      const window = filterPriceHistoryByRange(history, range, now);
      const stats = computeRangeStats(window, getCurrentRecord(history));

      expect(window).toHaveLength(expected.window_prices.length);
      window.forEach((record, index) =>
        expectClose(record.price, expected.window_prices[index])
      );
      expectClose(stats.average, expected.average);
      expectClose(stats.currentVsAverage, expected.price_change_pct);
      if (expected.lowest === null) {
        expect(stats.lowest).toBeNull();
      } else {
        expectClose(stats.lowest.price, expected.lowest.price);
        expect(stats.lowest.timestamp).toBe(expected.lowest.timestamp);
      }
      expect(stats.isAtLowest).toBe(expected.is_at_lowest);
    }
  );
});
```

- [ ] **Step 2: Replace the JS-only unit tests in `productHistory.test.js`**

Add `getCurrentRecord` to the import list. Replace the whole `describe('computeRangeStats', ...)` block with:

```js
describe('getCurrentRecord', () => {
  it('returns null for missing/empty history', () => {
    expect(getCurrentRecord(null)).toBeNull();
    expect(getCurrentRecord([])).toBeNull();
  });

  it('returns the newest record regardless of input order', () => {
    const newest = { timestamp: 3, price: 30, is_in_stock: false };
    expect(
      getCurrentRecord([
        { timestamp: 2, price: 20, is_in_stock: true },
        newest,
        { timestamp: 1, price: 10, is_in_stock: true }
      ])
    ).toBe(newest);
  });
});

// The shared formulas are pinned by `productHistory.contract.test.js`; these
// cases only cover JavaScript-specific inputs.
describe('computeRangeStats', () => {
  const empty = {
    lowest: null,
    average: null,
    currentVsAverage: null,
    isAtLowest: false
  };

  it('returns empty stats for missing input', () => {
    expect(computeRangeStats(null, null)).toEqual(empty);
    expect(computeRangeStats(undefined, undefined)).toEqual(empty);
  });

  it('averages every in-stock record when there is no current record', () => {
    const history = [
      { timestamp: 1, price: 10, is_in_stock: true },
      { timestamp: 2, price: 20, is_in_stock: true }
    ];
    const stats = computeRangeStats(history, null);
    expect(stats.average).toBeCloseTo(15);
    expect(stats.currentVsAverage).toBeNull();
    expect(stats.isAtLowest).toBe(false);
  });

  it('ignores records with a non-finite price', () => {
    const current = { timestamp: 3, price: 10, is_in_stock: true };
    const history = [
      { timestamp: 1, price: NaN, is_in_stock: true },
      { timestamp: 2, price: 20, is_in_stock: true },
      current
    ];
    const stats = computeRangeStats(history, current);
    expect(stats.average).toBeCloseTo(20);
    expect(stats.lowest).toEqual({ price: 10, timestamp: 3 });
  });

  it('has no change for a current record with a non-finite price', () => {
    const current = { timestamp: 2, price: NaN, is_in_stock: true };
    const history = [{ timestamp: 1, price: 20, is_in_stock: true }, current];
    const stats = computeRangeStats(history, current);
    expect(stats.currentVsAverage).toBeNull();
    expect(stats.isAtLowest).toBe(false);
  });
});
```

In the `computeYDomain` block, replace the test `'pads a flat range of 0 with a fixed amount instead of 0'` with:

```js
  it('pads a flat range of 0 upward only (never below zero)', () => {
    const history = [{ timestamp: 1, price: 0, is_in_stock: true }];
    const [min, max] = computeYDomain(history);
    expect(min).toBe(0);
    expect(max).toBeGreaterThan(0);
  });

  it('never extends the domain below zero', () => {
    const history = [
      { timestamp: 1, price: 5, is_in_stock: true },
      { timestamp: 2, price: 100, is_in_stock: true }
    ];
    const [min] = computeYDomain(history, 0.1);
    expect(min).toBe(0);
  });
```

- [ ] **Step 3: Add the failing page test (Review focus 5) to `ProductPage.test.jsx`**

In the three `ProductPage*.test.jsx` files delete the `min_price: 80,` line from `buildProduct`. Then add to `ProductPage.test.jsx`:

```js
  it('ignores out-of-stock records in the stats and shows N/A when the current one is out of stock', async () => {
    const now = Date.now() / 1000;
    productsApi.get.mockResolvedValue(
      buildProduct({
        current_price: 70,
        is_in_stock: false,
        price_history: [
          { timestamp: now - 10 * DAY, price: 100, is_in_stock: true },
          { timestamp: now - 2 * DAY, price: 80, is_in_stock: true },
          { timestamp: now - DAY, price: 70, is_in_stock: false }
        ]
      })
    );

    renderProductPage();

    const stat = async (label) =>
      (await screen.findByText(label)).parentElement;
    expect(await stat('Lowest in range')).toHaveTextContent('$80.00');
    expect(await stat('Average in range')).toHaveTextContent('$90.00');
    expect(await stat('Current vs average')).toHaveTextContent('N/A');
  });
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/productHistory.contract.test.js src/lib/productHistory.test.js src/pages/ProductPage.test.jsx`
Expected: FAIL — `getCurrentRecord` is not exported, contract cases fail (average includes current, no `isAtLowest`), the page shows `$70.00` as lowest.

- [ ] **Step 5: Implement the mirror in `frontend/src/lib/productHistory.js`**

Update the module JSDoc's first sentence to: `Pure computations for the product detail page's price history chart and stats row. `computeRangeStats` mirrors the backend's `price_stats.py`; both are pinned by `contracts/price-stats-cases.json`.`

Replace `computeRangeStats` (and its JSDoc) with:

```js
/**
 * The newest record of a product's full price history (the "current" one,
 * which may fall outside the selected range). Ties on the timestamp resolve
 * to the last one in input order, like the backend.
 *
 * @param {PriceHistoryRecord[]|null|undefined} priceHistory
 * @returns {PriceHistoryRecord|null}
 */
export function getCurrentRecord(priceHistory) {
  if (!Array.isArray(priceHistory) || priceHistory.length === 0) return null;
  return priceHistory.reduce((latest, record) =>
    record.timestamp >= latest.timestamp ? record : latest
  );
}

/**
 * Compute the stats row's range-dependent numbers, mirroring the backend's
 * `price_stats.compute_window_stats` (see `contracts/README.md`):
 * - only in-stock records count;
 * - `average` is the mean of the in-stock records other than `current`;
 * - `currentVsAverage` compares `current` with that average, and is `null`
 *   when `current` is missing or out of stock, or the average is not > 0;
 * - `lowest` is the cheapest in-stock record (the most recent on ties);
 * - `isAtLowest` is whether an in-stock `current` is not above `lowest`.
 *
 * @param {PriceHistoryRecord[]|null|undefined} filteredHistory - The
 *   selected range, ascending by timestamp.
 * @param {PriceHistoryRecord|null|undefined} current - The newest record of
 *   the full history, see `getCurrentRecord`.
 * @returns {{
 *   lowest: {price: number, timestamp: number}|null,
 *   average: number|null,
 *   currentVsAverage: number|null,
 *   isAtLowest: boolean
 * }}
 */
export function computeRangeStats(filteredHistory, current) {
  const window = Array.isArray(filteredHistory) ? filteredHistory : [];
  const valid = window.filter(
    (record) => record.is_in_stock === true && isFiniteNumber(record.price)
  );
  const baseline = current
    ? valid.filter((record) => record.timestamp !== current.timestamp)
    : valid;
  const average =
    baseline.length > 0
      ? baseline.reduce((sum, record) => sum + record.price, 0) /
        baseline.length
      : null;

  const currentIsUsable =
    Boolean(current) &&
    current.is_in_stock === true &&
    isFiniteNumber(current.price);
  const currentVsAverage =
    currentIsUsable && average !== null && average > 0
      ? ((current.price - average) / average) * 100
      : null;

  let lowest = null;
  // Ascending, so "<=" keeps the most recent record on ties.
  for (const record of valid) {
    if (lowest === null || record.price <= lowest.price) lowest = record;
  }

  return {
    lowest: lowest ? { price: lowest.price, timestamp: lowest.timestamp } : null,
    average,
    currentVsAverage,
    isAtLowest: currentIsUsable && lowest !== null && current.price <= lowest.price
  };
}
```

In `computeYDomain`, update the JSDoc sentence to "…so the line never touches the chart's top/bottom edge, never starts at a forced zero baseline and never extends below zero." and change both `return` statements that build a numeric domain to clamp the lower bound:

```js
    return [Math.max(0, min - padding), max + padding];
```

- [ ] **Step 6: Pass the current record from `ProductPage.jsx`**

Add `getCurrentRecord` to the `@/lib/productHistory` import and replace the stats memo with:

```js
  const currentRecord = useMemo(
    () => getCurrentRecord(rawHistory),
    [rawHistory]
  );
  const { lowest, average, currentVsAverage } = useMemo(
    () => computeRangeStats(filteredHistory, currentRecord),
    [filteredHistory, currentRecord]
  );
```

- [ ] **Step 7: Draw the chart as steps in `PriceHistoryChart.jsx`**

In the `<Line>` change `type="monotone"` to `type="stepAfter"` and add above it the comment `{/* Prices change at discrete checks, so draw steps rather than a smoothed curve. */}`. Update the component JSDoc's `average` param to `@param {number|null} props.average - Average of the range's in-stock records other than the current one (see `computeRangeStats`).`

- [ ] **Step 8: Run the frontend suite and lint**

Run: `cd frontend && npm test && npm run lint && npm run format:check`
Expected: all pass (14 contract cases included).

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/productHistory.js frontend/src/lib/productHistory.test.js frontend/src/lib/productHistory.contract.test.js frontend/src/pages/ProductPage.jsx frontend/src/pages/ProductPage.test.jsx frontend/src/pages/ProductPage.edit.test.jsx frontend/src/pages/ProductPage.delete.test.jsx frontend/src/components/product/PriceHistoryChart.jsx
git commit -m "feat(frontend): mirror the backend price-stats formulas on the product detail page"
```

---

### Task 7: Frontend dashboard fields and API-fields contract

**Files:**
- Modify: `frontend/src/lib/dashboardSummary.js`, `frontend/src/lib/dashboardSummary.test.js`
- Modify: `frontend/src/lib/productFilters.js:19-24,114-121,148-149`, `frontend/src/lib/productFilters.test.js`
- Modify: `frontend/src/components/dashboard/ProductTable.jsx:79`, `ProductCardList.jsx:62`
- Modify: `frontend/src/components/dashboard/DashboardSummary.test.jsx`, `ProductTable.test.jsx`, `ProductCardList.test.jsx`, `frontend/src/pages/DashboardPage.filters.test.jsx`
- Modify: `frontend/e2e/fixtures/products.js`, `frontend/e2e/support/apiMock.js:263,281`
- Modify: `frontend/src/lib/contracts.test.js`

**Interfaces:**
- Consumes: `getCurrentRecord`, `filterPriceHistoryByRange`, `computeRangeStats` (Task 6); `readContract` (Task 5); `contracts/api-fields.json` (Task 3)
- Produces: dashboard products expose `price_change_pct` and `is_at_lowest`; `isAtLowestPrice` no longer exists.

- [ ] **Step 1: Add the failing API-fields contract test to `frontend/src/lib/contracts.test.js`**

Add the import `import { buildDashboardProduct, buildHistoryPoint, buildProductDetail } from '../../e2e/fixtures/products';` and append:

```js
const API_FIELDS = readContract('api-fields.json');

const sortedKeys = (object) => Object.keys(object).sort();

describe('api-fields contract', () => {
  // The e2e fixtures stand in for the backend responses in every
  // Playwright spec, so they must have exactly the backend schema fields.
  it('matches the dashboard summary fields', () => {
    expect(sortedKeys(buildDashboardProduct())).toEqual(
      [...API_FIELDS.ProductDashboardSummary].sort()
    );
  });

  it('matches the product detail fields', () => {
    expect(sortedKeys(buildProductDetail())).toEqual(
      [...API_FIELDS.ProductDetailResponse].sort()
    );
  });

  it('matches the price history record fields', () => {
    expect(sortedKeys(buildHistoryPoint())).toEqual(
      [...API_FIELDS.ProductHistResponse].sort()
    );
  });
});
```

Run: `cd frontend && npx vitest run src/lib/contracts.test.js`
Expected: FAIL — the fixtures still have `price_change_60d`/`min_price` and lack `is_at_lowest`.

- [ ] **Step 2: Rename the field in every unit test fixture**

Run: `cd frontend && sed -i 's/price_change_60d/price_change_pct/g' src/lib/dashboardSummary.test.js src/lib/productFilters.test.js src/components/dashboard/DashboardSummary.test.jsx src/components/dashboard/ProductTable.test.jsx src/components/dashboard/ProductCardList.test.jsx src/pages/DashboardPage.filters.test.jsx`

Then in each of those files' base product fixture add `is_at_lowest: false,` right after the `price_change_pct` line, and change the test title `'counts only products whose 60-day price change is negative as price drops'` to `'counts only products whose price change is negative as price drops'`.

- [ ] **Step 3: Replace the at-lowest unit tests**

In `dashboardSummary.test.js` delete the four tests `'counts a product as "at lowest" when its current price equals the minimum of its recent prices'`, `'does not count a product as "at lowest" when its own recent_prices is missing or empty'`, `'hides the at-lowest stat when no product has any usable recent_prices'` and `'ignores non-finite numbers within recent_prices when computing the minimum'`, and add:

```js
  it('counts the products the backend flags as at their lowest price', () => {
    const summary = computeDashboardSummary([
      product({ is_at_lowest: true }),
      product({ is_at_lowest: false }),
      product({ is_at_lowest: true })
    ]);
    expect(summary.atLowestCount).toBe(2);
  });

  it('hides the at-lowest stat when no product has any history', () => {
    const summary = computeDashboardSummary([
      product({ current_price: null, is_at_lowest: false }),
      product({ current_price: undefined, is_at_lowest: false })
    ]);
    expect(summary.atLowestCount).toBeNull();
  });
```

In `productFilters.test.js` replace the body of `'keeps only products at their lowest recent price when atLowest is on'` (renamed to `'keeps only products flagged at their lowest price when atLowest is on'`) with:

```js
    const products = [
      product({ id: 1, is_at_lowest: true }),
      product({ id: 2, is_at_lowest: false }),
      product({ id: 3, is_at_lowest: undefined })
    ];
    expect(ids(filterProducts(products, filters({ atLowest: true })))).toEqual([
      1
    ]);
```

In `DashboardSummary.test.jsx`, in `'renders every stat when all are computable, with no console errors'` add `is_at_lowest: true` to the first product; in `'hides the price-drops and at-lowest stats when neither is computable'` change the product to `product({ current_price: null, price_change_pct: null, recent_prices: [] })`.

- [ ] **Step 4: Update the e2e fixtures and mock**

In `frontend/e2e/support/apiMock.js`: replace `price_change_60d: null,` with `price_change_pct: null,` followed by `is_at_lowest: false,`, and delete `min_price: null,`.

In `frontend/e2e/fixtures/products.js`:

1. Add at the top: `import { computeRangeStats, filterPriceHistoryByRange, getCurrentRecord } from '../../src/lib/productHistory.js';` and the constant

```js
/** The `hist_window_size` of the config fixtures (`./config.js`), which the
 * dashboard-summary rows below are computed over, like the backend does. */
const SUMMARY_WINDOW_DAYS = 60;
```

2. In `buildDashboardProduct` replace `price_change_60d: -5.2,` with `price_change_pct: -5.2,` and add `is_at_lowest: true,` after `is_in_stock: true,`.
3. Delete `min_price` from `buildProductDetail`, `buildSinglePointDetail` and `buildLongHistoryDetail`.
4. Delete the `computePriceChange` function and its JSDoc.
5. In `buildManyProducts` replace `const current = history[history.length - 1];` with:

```js
    const current = getCurrentRecord(history);
    const window = filterPriceHistoryByRange(
      history,
      String(SUMMARY_WINDOW_DAYS),
      nowSeconds()
    );
    const stats = computeRangeStats(window, current);
```

and replace the three fields `price_change_60d: computePriceChange(history, 60),`, `is_in_stock: current.is_in_stock,`, `recent_prices: history.slice(-5).map((point) => point.price),` with:

```js
      price_change_pct: stats.currentVsAverage,
      is_in_stock: current.is_in_stock,
      is_at_lowest: stats.isAtLowest,
      recent_prices: window.map((point) => point.price),
```

6. Update `buildManyProducts`' JSDoc: "`current_price`, `price_change_pct`, `is_in_stock`, `is_at_lowest` and `recent_prices` are all derived from that same series with the frontend's mirror of the backend formulas (`src/lib/productHistory.js`, pinned by `contracts/price-stats-cases.json`) over a `SUMMARY_WINDOW_DAYS` window, so they are internally consistent the way a real backend response would be." Also fix the `buildHistorySeries` JSDoc reference to `price_change_60d` if any remains (`grep -n 60d frontend/e2e` must print nothing).

- [ ] **Step 5: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/contracts.test.js src/lib/dashboardSummary.test.js src/lib/productFilters.test.js`
Expected: the api-fields contract now passes; the `dashboardSummary`/`productFilters` tests FAIL (the code still reads `price_change_60d` and `recent_prices`).

- [ ] **Step 6: Switch the dashboard code to the new fields**

`frontend/src/lib/dashboardSummary.js`: update the typedef to

```js
 * @property {number|null|undefined} price_change_pct
 * @property {boolean|undefined} is_at_lowest
```

(remove the `recent_prices` property line), delete `isAtLowestPrice` and its JSDoc, replace `price_change_60d` with `price_change_pct`, and replace the `productsWithRecentPrices`/`atLowestCount` block with:

```js
  // "At lowest" is decided by the backend (`is_at_lowest`, see
  // `backend/src/services/price_stats.py`); hidden when no product has any
  // history yet (no current price).
  const productsWithHistory = products.filter((product) =>
    isFiniteNumber(product.current_price)
  );
  const atLowestCount =
    productsWithHistory.length === 0
      ? null
      : productsWithHistory.filter((product) => product.is_at_lowest === true)
          .length;
```

`frontend/src/lib/productFilters.js`: delete `import { isAtLowestPrice } from './dashboardSummary';`, replace every `price_change_60d` with `price_change_pct` (JSDoc, filter and `change_asc` comparator), and replace `if (filters.atLowest && !isAtLowestPrice(product)) return false;` with `if (filters.atLowest && product.is_at_lowest !== true) return false;`. Update the `atLowest` property JSDoc to `Only products the backend flags as at their lowest price (`is_at_lowest`).`

`ProductTable.jsx` and `ProductCardList.jsx`: replace `product.price_change_60d` with `product.price_change_pct`.

- [ ] **Step 7: Verify nothing references the old names**

Run: `cd frontend && grep -rn -E "price_change_60d|min_price|isAtLowestPrice" src e2e`
Expected: no output.

- [ ] **Step 8: Run the frontend suite and lint**

Run: `cd frontend && npm test && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add frontend/src frontend/e2e/fixtures/products.js frontend/e2e/support/apiMock.js
git commit -m "refactor(frontend)!: read price_change_pct and is_at_lowest from the dashboard summary

BREAKING CHANGE: requires the backend's renamed dashboard fields."
```

---

### Task 8: E2E expectations and visual snapshots

**Files:**
- Modify: `frontend/e2e/product-detail.spec.js:20-131`
- Modify: `frontend/e2e/visual.spec.js-snapshots/*` (regenerated)

**Interfaces:**
- Consumes: the fixtures from Task 7.

- [ ] **Step 1: Update the range-selector expectations**

In `buildRangeHistory`'s JSDoc replace the three bullet lines with:

```js
 * decreasing prices chosen so each range option's average is distinct and
 * easy to assert on (see the range selector test below). The newest point
 * (50, 1 day ago) is the current price, which the average excludes:
 * - within the last 30 days: 100, [50] -> average 100
 * - within the last 60 days (the fixture's `hist_window_size`, so this is
 *   also the page's default range): 150, 100, [50] -> average 125
 * - all 6 points ("All"): 300, 250, 200, 150, 100, [50] -> average 200
```

In the test, change the expected texts: `'$100.00'` (60 days) → `'$125.00'`, `'$75.00'` (30 days) → `'$100.00'`, `'$175.00'` (All) → `'$200.00'`. Change the comment `// Default range: the option closest to \`hist_window_size\` (60).` to `// Default range: the configured \`hist_window_size\` (60).`

- [ ] **Step 2: Update the long-history expectations**

Replace the `prices`/`expectedAverage`/`expectedLowest` block with:

```js
    // Computed directly from the fixture with the spec's rules (in-stock
    // records only; the average excludes the current, newest record), not
    // with the app's own helpers.
    const history = detail.price_history;
    const current = history[history.length - 1];
    const inStock = history.filter((point) => point.is_in_stock);
    const baseline = inStock.filter(
      (point) => point.timestamp !== current.timestamp
    );
    const expectedAverage =
      baseline.reduce((sum, point) => sum + point.price, 0) / baseline.length;
    const expectedLowest = Math.min(...inStock.map((point) => point.price));
```

and update the comment "they must agree with each other, and with a plain average/min computed directly over the whole fixture in this test." to "they must agree with each other, and with the average/min computed directly from the fixture above."

- [ ] **Step 3: Run the e2e suite (non-visual)**

Run: `cd frontend && npx playwright test --ignore-snapshots`
Expected: all pass (snapshot comparisons are skipped until Step 4).

- [ ] **Step 4: Regenerate and review the visual snapshots**

Run: `cd frontend && npx playwright test visual.spec.js --update-snapshots`
Then run `git status frontend/e2e/visual.spec.js-snapshots` and open every changed PNG (Read tool) to confirm the only differences are: stepped detail chart lines, detail stats values, longer dashboard sparklines and dashboard trend values/at-lowest counts. Anything else (layout shifts, missing elements) is a regression to fix before continuing.

- [ ] **Step 5: Run the whole e2e suite**

Run: `cd frontend && npm run test:e2e`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/e2e
git commit -m "test(frontend): update e2e expectations and snapshots for the shared price stats"
```

---

### Task 9: Documentation

**Files:**
- Modify: `README.md` (project tree, config table ~line 234, API table ~line 271, Docker section ~line 362-388, Key Features if it mentions the trend)
- Modify: `backend/README.md:14-18`
- Modify: `frontend/README.md` (only if it documents `price_change_60d`, `min_price` or the chart/stats rules; `grep -n -E "60d|min_price|average|lowest" frontend/README.md`)

- [ ] **Step 1: Root `README.md`**

1. Project tree: add under the root entries

```
├── contracts/                        # Shared frontend/backend test contracts (formulas, window options, API fields)
```

and under `services/` add `│       │   ├── price_stats.py        # Pure price statistics (window, average, change, lowest)`.

2. Config table row:

```
| `hist_window_size`      | `60`      | Days of history used for price trends, averages and lowest prices (30, 60, 90 or 180) |
```

(re-align the table columns).

3. API table: dashboard-summary description → "Get enriched product list for dashboard view (`url`, current price, `price_change_pct`, stock, `is_at_lowest`, `recent_prices` for the sparkline, `last_checked_at`, store fields)".

4. Add a short subsection after the config table:

```markdown
**How price statistics are computed** (dashboard and product detail):

- The window covers the last *N* calendar days (`hist_window_size` on the
  dashboard, the selected range on the detail page).
- Only in-stock checks count for averages, lowest prices, price changes,
  "at lowest" and price-drop alerts; out-of-stock checks are still drawn on
  the charts.
- The price change compares the current price with the average of the
  previous in-stock checks in the window.
- The daily job stores at most one check per product per day and discards
  invalid prices (zero, negative or not a number).

The same rules are implemented in the backend and the frontend and pinned
by the shared fixtures in [`contracts/`](contracts/README.md).
```

5. Docker section: add `-e TZ=Europe/Madrid \` to the `docker run` example (after `-p 7755:7755 \`) and a bullet: "- **`TZ`** (default `UTC`) sets the local time used for the analysis hour and for \"one check per product per day\"; set it to your own time zone. `just docker-run` forwards your shell's `TZ`."

- [ ] **Step 2: `backend/README.md`**

Change "`url`, `recent_prices` and `last_checked_at` on the product endpoints" to "`url`, `recent_prices`, `price_change_pct`, `is_at_lowest` and `last_checked_at` on the product endpoints", and add a sentence to that paragraph: "The price statistics formulas (`src/services/price_stats.py`), window options and product response fields are also pinned by the shared contracts in `../contracts/` (`test_price_stats_contract.py`, `test_contracts.py`); the cronjob is covered by `test_cronjob.py`."

- [ ] **Step 3: Verify docs mention no removed names**

Run: `grep -rn -E "price_change_60d|min_price|records used for trend" README.md backend/README.md frontend/README.md docs/superpowers/specs/2026-09-26-price-history-consistency-design.md`
Expected: matches only inside the spec (which documents the rename), none in the READMEs.

- [ ] **Step 4: Final full verification**

Run: `just test && cd frontend && npm run lint && npm run test:e2e`
Expected: backend and frontend suites, lint and e2e all pass.

- [ ] **Step 5: Commit**

```bash
git add README.md backend/README.md frontend/README.md
git commit -m "docs: document day-based price statistics, shared contracts and TZ"
```
