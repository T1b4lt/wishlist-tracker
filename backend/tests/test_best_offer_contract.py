"""Shared best-offer contract for the backend rules.

The same cases (``contracts/best-offer-cases.json``) run against
``frontend/src/lib/bestOffer.js`` in ``bestOffer.contract.test.js``.
"""

from types import SimpleNamespace

import pytest
from src.services.best_offer import (
    OfferHistory,
    compute_product_offer_stats,
    select_best_offer,
)
from tests.contract_utils import load_contract

CONTRACT = load_contract("best-offer-cases.json")


def _offers(case):
    return [
        OfferHistory(
            offer_id=offer["offer_id"],
            history=[SimpleNamespace(**record) for record in offer["history"]],
        )
        for offer in case["offers"]
    ]


@pytest.mark.parametrize("case", CONTRACT["cases"], ids=lambda case: case["name"])
def test_best_offer_contract(case):
    expected = case["expected"]

    stats = compute_product_offer_stats(_offers(case), case["window_days"], case["now"])

    assert stats.best_offer_id == expected["best_offer_id"]
    assert stats.is_in_stock is expected["is_in_stock"]
    assert stats.is_at_lowest is expected["is_at_lowest"]


def test_select_best_offer_matches_the_stats():
    case = CONTRACT["cases"][2]
    assert select_best_offer(_offers(case)) == case["expected"]["best_offer_id"]
