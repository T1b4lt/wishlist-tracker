"""
Staleness: offers whose price has not been updated for a while.

The daily check stores one price record per offer per day. When no new
record shows up for several days, the AI agent is probably failing to read
the store page (the site is down, the product was removed, the agent is
blocked...), so the UI warns the user.

Offers that were never checked are not stale: there is nothing to measure
the delay against. Pure functions, no database access.
"""

from src.services.price_stats import SECONDS_PER_DAY

# Days without a new price record after which an offer is stale.
STALE_AFTER_DAYS = 3


def days_since_check(last_checked_at: int | None, now: int) -> int | None:
    """Return the whole days elapsed since the last price check.

    Args:
        last_checked_at (int | None): Unix seconds of the newest record.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        int | None: Whole days, never negative; ``None`` if never checked.
    """
    if last_checked_at is None:
        return None
    return max(0, (now - last_checked_at) // SECONDS_PER_DAY)


def is_stale(last_checked_at: int | None, now: int) -> bool:
    """Return whether the price was not updated for ``STALE_AFTER_DAYS`` days or more.

    Args:
        last_checked_at (int | None): Unix seconds of the newest record.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        bool: ``True`` when the offer is stale.
    """
    days = days_since_check(last_checked_at, now)
    return days is not None and days >= STALE_AFTER_DAYS


def product_stale_days(offers_last_checked: list[int | None], now: int) -> int | None:
    """Return the days of a product's stalest stale offer.

    Args:
        offers_last_checked (list[int | None]): ``last_checked_at`` of each offer.
        now (int): Reference Unix timestamp (seconds).

    Returns:
        int | None: The largest ``days_since_check`` among stale offers, or
            ``None`` when no offer is stale.
    """
    stale_days = [
        days_since_check(checked, now)
        for checked in offers_last_checked
        if is_stale(checked, now)
    ]
    return max(stale_days) if stale_days else None
