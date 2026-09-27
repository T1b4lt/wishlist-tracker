"""Table-driven cases (``tests/cases/best-offer-cases.json``) for
``src/services/best_offer.py``.
"""

from types import SimpleNamespace

import pytest
from src.services.best_offer import (
    OfferHistory,
    compute_product_offer_stats,
    select_best_offer,
)
from tests.case_utils import load_cases

CASES = load_cases("best-offer-cases.json")


def _offers(case):
    return [
        OfferHistory(
            offer_id=offer["offer_id"],
            history=[SimpleNamespace(**record) for record in offer["history"]],
        )
        for offer in case["offers"]
    ]


@pytest.mark.parametrize("case", CASES["cases"], ids=lambda case: case["name"])
def test_best_offer_cases(case):
    expected = case["expected"]

    stats = compute_product_offer_stats(_offers(case), case["window_days"], case["now"])

    assert stats.best_offer_id == expected["best_offer_id"]
    assert stats.is_in_stock is expected["is_in_stock"]
    assert stats.is_at_lowest is expected["is_at_lowest"]


def test_select_best_offer_matches_the_stats():
    case = CASES["cases"][2]
    assert select_best_offer(_offers(case)) == case["expected"]["best_offer_id"]
