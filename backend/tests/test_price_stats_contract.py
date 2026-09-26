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
