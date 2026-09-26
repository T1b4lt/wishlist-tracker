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
