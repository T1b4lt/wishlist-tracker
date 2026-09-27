"""Tests for ``best_offer.lowest_across_offers``."""

from types import SimpleNamespace

from src.services.best_offer import (
    LowestRecord,
    OfferHistory,
    compute_product_offer_stats,
    lowest_across_offers,
)

DAY = 86400
NOW = 100 * DAY


def rec(price, is_in_stock, timestamp):
    return SimpleNamespace(price=price, is_in_stock=is_in_stock, timestamp=timestamp)


def test_ignores_out_of_stock_records():
    offers = [
        OfferHistory(1, [rec(50, False, NOW - DAY), rec(80, True, NOW - 2 * DAY)])
    ]

    assert lowest_across_offers(offers, 30, NOW) == LowestRecord(80, NOW - 2 * DAY, 1)


def test_looks_at_every_offer():
    offers = [
        OfferHistory(1, [rec(90, True, NOW - DAY)]),
        OfferHistory(2, [rec(70, True, NOW - 3 * DAY)]),
    ]

    assert lowest_across_offers(offers, 30, NOW) == LowestRecord(70, NOW - 3 * DAY, 2)


def test_price_tie_keeps_the_most_recent_record():
    offers = [
        OfferHistory(1, [rec(70, True, NOW - 5 * DAY)]),
        OfferHistory(2, [rec(70, True, NOW - 2 * DAY)]),
    ]

    assert lowest_across_offers(offers, 30, NOW) == LowestRecord(70, NOW - 2 * DAY, 2)


def test_respects_the_window():
    offers = [
        OfferHistory(1, [rec(60, True, NOW - 40 * DAY), rec(90, True, NOW - DAY)])
    ]

    assert lowest_across_offers(offers, 30, NOW).price == 90
    assert lowest_across_offers(offers, None, NOW).price == 60


def test_window_start_is_inclusive():
    offers = [
        OfferHistory(1, [rec(60, True, NOW - 30 * DAY), rec(90, True, NOW - DAY)])
    ]

    assert lowest_across_offers(offers, 30, NOW).price == 60


def test_none_without_in_stock_records():
    assert lowest_across_offers([], 30, NOW) is None
    assert (
        lowest_across_offers([OfferHistory(1, [rec(10, False, NOW)])], 30, NOW) is None
    )


def test_at_lowest_uses_the_lowest_across_offers():
    offers = [
        OfferHistory(1, [rec(80, True, NOW - DAY)]),
        OfferHistory(2, [rec(70, True, NOW - 5 * DAY), rec(90, True, NOW - DAY)]),
    ]

    stats = compute_product_offer_stats(offers, 30, NOW)

    assert stats.best_offer_id == 1
    assert stats.is_at_lowest is False
