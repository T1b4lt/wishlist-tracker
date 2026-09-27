"""Tests for the staleness rules (``src/services/staleness.py``)."""

from src.services.staleness import (
    STALE_AFTER_DAYS,
    days_since_check,
    is_stale,
    product_stale_days,
)

DAY = 86400
NOW = 1_000 * DAY


def test_threshold_is_three_days():
    assert STALE_AFTER_DAYS == 3


def test_never_checked_is_not_stale():
    assert days_since_check(None, NOW) is None
    assert is_stale(None, NOW) is False


def test_just_under_three_days_is_not_stale():
    checked = NOW - (3 * DAY - 1)

    assert days_since_check(checked, NOW) == 2
    assert is_stale(checked, NOW) is False


def test_exactly_three_days_is_stale():
    checked = NOW - 3 * DAY

    assert days_since_check(checked, NOW) == 3
    assert is_stale(checked, NOW) is True


def test_a_check_in_the_future_counts_as_zero_days():
    checked = NOW + 3600

    assert days_since_check(checked, NOW) == 0
    assert is_stale(checked, NOW) is False


def test_product_stale_days_is_the_stalest_stale_offer():
    checks = [NOW - DAY, NOW - 4 * DAY, NOW - 6 * DAY, None]

    assert product_stale_days(checks, NOW) == 6


def test_product_without_stale_offers_has_no_stale_days():
    assert product_stale_days([NOW - DAY, None], NOW) is None
    assert product_stale_days([], NOW) is None
