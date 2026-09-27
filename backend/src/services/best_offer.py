"""
Best-offer rules: which offer represents a product tracked in several stores.

Pure functions, no database access. Mirrored by
``frontend/src/lib/bestOffer.js``; both are pinned by
``contracts/best-offer-cases.json`` (see ``contracts/README.md``).

Definitions (per offer, *current* is the newest record of its history):
    * best offer: among offers with history, the one ranked first by
      (current in stock first, lower price, newer current, lower offer id).
    * product in stock: any current record in stock (``None`` without history).
    * product at lowest: the best offer's current record is in stock and not
      above the lowest in-stock price of any offer inside the window.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from src.services.price_stats import filter_window


@dataclass(frozen=True)
class OfferHistory:
    """An offer id with its price-history records (any order)."""

    offer_id: int
    history: list


@dataclass(frozen=True)
class ProductOfferStats:
    """Product-level results of the best-offer rules."""

    best_offer_id: int | None
    is_in_stock: bool | None
    is_at_lowest: bool


def current_record(history: Iterable) -> Any | None:
    """Return the newest record (the last one in input order on ties).

    Args:
        history (Iterable): Price-history records.

    Returns:
        Any | None: The newest record, or ``None`` for an empty history.
    """
    current = None
    for record in history:
        if current is None or record.timestamp >= current.timestamp:
            current = record
    return current


def _rank(offer_id: int, current: Any) -> tuple:
    """Sort key: in stock first, then cheaper, then newer, then lower id."""
    return (
        0 if current.is_in_stock else 1,
        current.price,
        -current.timestamp,
        offer_id,
    )


def select_best_offer(offers: list[OfferHistory]) -> int | None:
    """Return the id of the offer that represents the product.

    Args:
        offers (list[OfferHistory]): The product's offers.

    Returns:
        int | None: The best offer's id, or ``None`` when no offer has history.
    """
    ranked = [
        _rank(offer.offer_id, current)
        for offer in offers
        if (current := current_record(offer.history)) is not None
    ]
    return min(ranked)[3] if ranked else None


def compute_product_offer_stats(
    offers: list[OfferHistory], window_days: int | None, now: int
) -> ProductOfferStats:
    """Apply the best-offer rules to a product's offers.

    Args:
        offers (list[OfferHistory]): The product's offers. Each history must
            include the offer's newest record even if it is outside the window.
        window_days (int | None): Window length in days; ``None`` keeps
            the full history.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        ProductOfferStats: Best offer id, product stock and at-lowest flag.
    """
    currents = {offer.offer_id: current_record(offer.history) for offer in offers}
    with_history = [current for current in currents.values() if current is not None]
    is_in_stock = (
        any(current.is_in_stock for current in with_history) if with_history else None
    )

    best_offer_id = select_best_offer(offers)
    is_at_lowest = False
    if best_offer_id is not None and currents[best_offer_id].is_in_stock:
        in_stock_prices = [
            record.price
            for offer in offers
            for record in filter_window(offer.history, window_days, now)
            if record.is_in_stock
        ]
        is_at_lowest = bool(in_stock_prices) and (
            currents[best_offer_id].price <= min(in_stock_prices)
        )

    return ProductOfferStats(
        best_offer_id=best_offer_id,
        is_in_stock=is_in_stock,
        is_at_lowest=is_at_lowest,
    )
