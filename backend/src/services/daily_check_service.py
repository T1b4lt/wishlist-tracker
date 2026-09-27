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
    Offer,
    OfferHist,
    PendingStatusRetry,
)
from src.schemas.daily_check import DailyCheckStatusResponse


@dataclass(frozen=True)
class DailyCounts:
    """Offers recorded today and offers still pending a quota retry."""

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
    """Count existing offers recorded today and today's pending retries.

    Args:
        session (Session): Active database session.
        now (datetime): Naive local time.

    Returns:
        DailyCounts: The counts for ``now``'s local day.
    """
    day_start, day_end = local_day_bounds(now)
    recorded = session.exec(
        select(func.count(func.distinct(OfferHist.offer_id)))
        .join(Offer, Offer.id == OfferHist.offer_id)
        .where(OfferHist.timestamp >= day_start, OfferHist.timestamp < day_end)
    ).one()
    pending = session.exec(
        select(func.count())
        .select_from(PendingStatusRetry)
        .where(PendingStatusRetry.day_start == day_start)
    ).one()
    return DailyCounts(recorded=recorded, pending=pending)


def get_status(
    session: Session, now: datetime | None = None
) -> DailyCheckStatusResponse:
    """Build today's status for the dashboard.

    Args:
        session (Session): Active database session.
        now (datetime | None): Naive local time; defaults to ``datetime.now()``.

    Returns:
        DailyCheckStatusResponse: The snapshot (null before the full run)
            and the live number of pending offers.
    """
    now = now or datetime.now()
    day_start, _ = local_day_bounds(now)
    run = get_today_run(session, now)
    return DailyCheckStatusResponse(
        day_start=day_start,
        started_at=run.started_at if run else None,
        total_offers=run.total_offers if run else None,
        limit_reached_at=run.limit_reached_at if run else None,
        pending_at_limit=run.pending_at_limit if run else None,
        pending_now=count_today(session, now).pending,
    )
