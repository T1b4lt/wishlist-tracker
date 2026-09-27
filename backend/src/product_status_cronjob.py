"""
Daily price tracking cronjob script.

This script should be run every 10 minutes via cron. It will:
1. On the first run at or after the configured analysis hour each day (no
   ``DailyCheckRun`` row yet), fetch prices for every offer (a product in one
   store) not yet checked today and store them in the database (invalid
   prices are discarded)
2. If the AI provider stops that run (the Gemini quota runs out, or the
   provider, e.g. Ollama, cannot be reached), stop and mark the offers left
   as pending retries
3. On every later run that day, retry today's pending offers, stopping
   again at the next provider-wide stop, until each one gets its record for
   the day
4. Send Telegram alerts if price drops or stock changes are detected (if configured)
5. Send a Telegram alert when the AI provider cannot be reached, and another
   once it is back and nothing is pending (at most once each per day)
6. Send the Telegram daily check report once per day, per ``daily_check_report``

"Today" and the analysis hour use the process local time, set with the
``TZ`` environment variable (the Docker image defaults to UTC).
"""

import asyncio
import fcntl
import logging
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime

from sqlmodel import Session, delete, func, select
from src.ai.base import AIProvider, ProviderUnavailableError
from src.ai.factory import load_ai_provider
from src.core.config import get_config_value, get_daily_check_report
from src.core.database import engine
from src.core.local_day import format_local_time, is_end_of_day, local_day_bounds
from src.models.database_models import (
    DailyCheckRun,
    Offer,
    OfferHist,
    PendingStatusRetry,
)
from src.services import daily_check_service
from src.services.offer_check_service import (
    LIMIT_REASON_QUOTA,
    LIMIT_REASON_UNAVAILABLE,
    CheckOutcome,
    check_offer,
    has_record_between,
    load_telegram_settings,
)
from src.telegram_utils import (
    build_daily_done_message,
    build_daily_unchecked_message,
    build_provider_recovered_message,
    build_provider_unavailable_message,
    send_daily_check_report,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


# Held for the whole run, so a run that outlasts the 10-minute schedule (a
# full check of many offers) never overlaps with the next one. Next to the
# database, relative to the backend directory the cronjob runs from.
RUN_LOCK_FILE = "db/cronjob.lock"


@contextmanager
def _run_lock() -> Iterator[bool]:
    """Try to take the exclusive cronjob lock without waiting.

    The OS releases the lock when the process ends, even if it crashes, so a
    stale lock never blocks later runs.

    Yields:
        bool: True if this run holds the lock, False if another run does.
    """
    with open(RUN_LOCK_FILE, "a") as lock_file:
        try:
            fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
            return
        try:
            yield True
        finally:
            fcntl.flock(lock_file, fcntl.LOCK_UN)


def _current_timestamp() -> int:
    """Return the current Unix time; a seam so tests can pin quota-error times."""
    return int(time.time())


async def _check_offers(
    session: Session,
    offers: list[Offer],
    provider: AIProvider,
    now: datetime,
) -> tuple[list[int], int | None, str | None]:
    """Check offers in order, stopping at the first provider-wide stop.

    Once the Gemini quota runs out or the provider cannot be reached, every
    later call would fail too, so the rest of the offers are left for a
    retry instead of spending more requests.

    Args:
        session (Session): Active database session.
        offers (list[Offer]): The offers to check, in order.
        provider (AIProvider): The active AI provider.
        now (datetime): Naive local time of the run.

    Returns:
        tuple[list[int], int | None, str | None]: IDs of the offers still
            without a record today because of the stop (the one that hit it
            and every offer after it; offers already checked today are left
            out), the Unix time of the stop and its reason (``"quota"`` /
            ``"unavailable"``), or None for both if the pass never stopped.
    """
    tg = load_telegram_settings(session)
    if tg["enabled"]:
        logger.info("Telegram notifications enabled")
        logger.info(
            f"Price drop alerts: {tg['price_drop']}, "
            f"Stock change alerts: {tg['stock_change']}"
        )
    else:
        logger.info("Telegram notifications disabled (credentials not configured)")

    counts = {outcome: 0 for outcome in CheckOutcome}
    pending_ids: list[int] = []
    limit_reached_at: int | None = None
    limit_reason: str | None = None
    for index, offer in enumerate(offers):
        outcome = await check_offer(session, offer, provider, tg, now)
        counts[outcome] += 1
        if outcome.stops_run:
            limit_reached_at = _current_timestamp()
            limit_reason = outcome.limit_reason
            day_start, day_end = local_day_bounds(now)
            pending_ids = [offer.id] + [
                o.id
                for o in offers[index + 1 :]
                if not has_record_between(session, o.id, day_start, day_end)
            ]
            logger.warning(
                f"Stopping ({limit_reason}): {len(pending_ids)} offer(s) left "
                "for a retry on the next run"
            )
            break

    logger.info(
        f"Process completed. Success: {counts[CheckOutcome.STORED]}, "
        f"Skipped: {counts[CheckOutcome.SKIPPED]}, "
        f"Errors: {counts[CheckOutcome.FAILED]}, "
        f"Pending retry: {len(pending_ids)}"
    )
    return pending_ids, limit_reached_at, limit_reason


async def _run_pass(
    session: Session, offers: list[Offer], provider: AIProvider, now: datetime
) -> tuple[list[int], int | None, str | None]:
    """Check ``offers`` after making sure the provider can be reached.

    When the preflight fails (e.g. Ollama is switched off) nothing is
    scraped, so Chrome is not launched every 10 minutes just to fail: every
    offer without a record today is left pending.

    Args:
        session (Session): Active database session.
        offers (list[Offer]): The offers to check, in order.
        provider (AIProvider): The active AI provider.
        now (datetime): Naive local time of the run.

    Returns:
        tuple[list[int], int | None, str | None]: Same as ``_check_offers``.
    """
    try:
        await provider.preflight()
    except ProviderUnavailableError as error:
        logger.warning(f"{provider.describe()} unavailable: {error}")
        day_start, day_end = local_day_bounds(now)
        pending_ids = [
            o.id
            for o in offers
            if not has_record_between(session, o.id, day_start, day_end)
        ]
        return pending_ids, _current_timestamp(), LIMIT_REASON_UNAVAILABLE
    return await _check_offers(session, offers, provider, now)


def _offers_least_recently_checked_first(session: Session) -> list[Offer]:
    """Return every offer, the ones without a recent record first.

    Offers never checked come first, then by the timestamp of their last
    record (oldest first), then by ID. When the daily quota cannot cover
    every offer, the ones left out one day are checked first the next, so
    coverage rotates instead of always missing the last offers added.

    Args:
        session (Session): Active database session.

    Returns:
        list[Offer]: All offers in checking order.
    """
    last_checked = (
        select(
            OfferHist.offer_id,
            func.max(OfferHist.timestamp).label("last_timestamp"),
        )
        .group_by(OfferHist.offer_id)
        .subquery()
    )
    return session.exec(
        select(Offer)
        .outerjoin(last_checked, last_checked.c.offer_id == Offer.id)
        .order_by(last_checked.c.last_timestamp.asc().nulls_first(), Offer.id)
    ).all()


async def fetch_and_store_product_status(now: datetime | None = None):
    """Fetch the status of every offer and store it in the database.

    Offers already checked today are skipped, invalid prices are not
    stored, and Telegram alerts are sent when price drops or stock changes
    are detected (when configured). If the AI provider stops the run (Gemini
    quota or provider unavailable), the offers left are saved as pending
    retries for today, replacing any previous pending retries.

    Creates today's ``DailyCheckRun`` (only once an API key and at least one
    offer exist, so a run that cannot start is attempted again on the next
    tick) and records the first provider-wide stop (time, offers left and
    reason) in it.

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    logger.info("Starting product status fetch process...")

    with Session(engine) as session:
        provider = load_ai_provider(session)
        if not provider.is_configured():
            logger.error(f"{provider.label} not configured in database. Exiting.")
            return

        # This run checks every offer, so older retries are superseded.
        session.exec(delete(PendingStatusRetry))
        session.commit()

        offers = _offers_least_recently_checked_first(session)
        if not offers:
            logger.info("No offers found in database. Exiting.")
            return

        logger.info(f"Found {len(offers)} offers to process")
        day_start, _ = local_day_bounds(now)
        daily_run = DailyCheckRun(
            day_start=day_start,
            started_at=int(now.timestamp()),
            total_offers=len(offers),
        )
        session.add(daily_run)
        session.commit()

        pending_ids, limit_reached_at, limit_reason = await _run_pass(
            session, offers, provider, now
        )

        for offer_id in pending_ids:
            session.add(PendingStatusRetry(offer_id=offer_id, day_start=day_start))
        if limit_reached_at is not None:
            daily_run.limit_reached_at = limit_reached_at
            daily_run.pending_at_limit = len(pending_ids)
            daily_run.limit_reason = limit_reason
            session.add(daily_run)
        session.commit()


async def retry_rate_limited_products(now: datetime | None = None):
    """Retry today's offers whose check hit a provider-wide stop.

    Pending retries from a previous day are deleted without retrying them.
    An offer leaves the pending list once it is checked, whether its record
    is stored or it fails for another reason; an offer that hits the quota
    or finds the provider unavailable again stays pending (with every offer
    after it) until the next run.

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    day_start, _ = local_day_bounds(now)

    with Session(engine) as session:
        session.exec(
            delete(PendingStatusRetry).where(PendingStatusRetry.day_start != day_start)
        )
        session.commit()

        pending_ids = set(session.exec(select(PendingStatusRetry.offer_id)).all())
        offers = [
            offer
            for offer in _offers_least_recently_checked_first(session)
            if offer.id in pending_ids
        ]
        if not offers:
            logger.info("No pending retries for today.")
            return

        provider = load_ai_provider(session)
        if not provider.is_configured():
            logger.error(f"{provider.label} not configured in database. Exiting.")
            return

        logger.info(f"Retrying {len(offers)} rate-limited offer(s)")
        # The day's snapshot of the first quota error is never overwritten.
        still_pending, _, _ = await _run_pass(session, offers, provider, now)

        session.exec(
            delete(PendingStatusRetry).where(
                PendingStatusRetry.offer_id.not_in(still_pending)
            )
        )
        session.commit()


def _build_daily_report(
    session: Session, run: DailyCheckRun, now: datetime
) -> str | None:
    """Return today's report text if it is due, else None.

    "Done" is due once nothing is pending; "left unchecked" only from
    ``END_OF_DAY`` with offers still pending.

    Args:
        session (Session): Active database session.
        run (DailyCheckRun): Today's daily check.
        now (datetime): Naive local time of the run.

    Returns:
        str | None: The message to send, or None if nothing is due yet.
    """
    counts = daily_check_service.count_today(session, now)
    lang = get_config_value(session, "selected_language", "english")
    provider_label = load_ai_provider(session).label
    reason = run.limit_reason or LIMIT_REASON_QUOTA
    limit_time = (
        format_local_time(run.limit_reached_at) if run.limit_reached_at else None
    )
    if counts.pending == 0:
        # Nothing is pending, so every offer without a record today failed.
        failed = max(run.total_offers - counts.recorded, 0)
        return build_daily_done_message(
            lang,
            counts.recorded,
            run.total_offers,
            failed,
            limit_time,
            run.pending_at_limit,
            limit_reason=reason,
            provider_label=provider_label,
        )
    if is_end_of_day(now) and limit_time is not None:
        return build_daily_unchecked_message(
            lang,
            counts.pending,
            run.total_offers,
            limit_time,
            run.pending_at_limit,
            limit_reason=reason,
            provider_label=provider_label,
        )
    return None


async def send_provider_alerts_if_due(now: datetime) -> None:
    """Send the Telegram "provider unavailable" / "back online" alerts.

    At most one of each per local day, whenever Telegram is configured
    (independently of the alert switches and of ``daily_check_report``):
    the first when today's run stopped because the provider was unavailable
    and offers are still pending; the second once nothing is pending after
    the first was sent. A flag is set only after a successful send, so a
    failed send is retried by the next run.

    Args:
        now (datetime): Naive local time of the run.
    """
    with Session(engine) as session:
        run = daily_check_service.get_today_run(session, now)
        if run is None or run.recovered_alert_sent:
            return
        tg = load_telegram_settings(session)
        if not tg["enabled"]:
            return
        counts = daily_check_service.count_today(session, now)
        provider = load_ai_provider(session)
        lang = get_config_value(session, "selected_language", "english")

        if not run.unavailable_alert_sent:
            if run.limit_reason != LIMIT_REASON_UNAVAILABLE or counts.pending == 0:
                return
            text = build_provider_unavailable_message(
                lang, provider.describe(), counts.pending
            )
            flag = "unavailable_alert_sent"
        elif counts.pending == 0:
            text = build_provider_recovered_message(
                lang, provider.label, counts.recorded
            )
            flag = "recovered_alert_sent"
        else:
            return

        try:
            await send_daily_check_report(tg["token"], tg["chat_id"], text)
        except Exception as e:
            logger.error(f"Failed to send the provider alert: {str(e)}")
            return
        setattr(run, flag, True)
        session.add(run)
        session.commit()
        logger.info(f"Provider alert sent ({flag})")


async def send_daily_report_if_due(now: datetime) -> None:
    """Send today's Telegram daily check report once, when it is due.

    Follows the ``daily_check_report`` setting: ``off`` never sends,
    ``limit_days`` only on days the Gemini quota ran out, ``every_day``
    always. ``report_sent`` is set only after a successful send, so a failed
    send is retried by the next run of the same day.

    Args:
        now (datetime): Naive local time of the run.
    """
    with Session(engine) as session:
        run = daily_check_service.get_today_run(session, now)
        if run is None or run.report_sent:
            return
        mode = get_daily_check_report(session)
        if mode == "off" or (mode == "limit_days" and run.limit_reached_at is None):
            return
        tg = load_telegram_settings(session)
        if not tg["enabled"]:
            return

        text = _build_daily_report(session, run, now)
        if text is None:
            return
        try:
            await send_daily_check_report(tg["token"], tg["chat_id"], text)
        except Exception as e:
            logger.error(f"Failed to send the daily check report: {str(e)}")
            return

        run.report_sent = True
        session.add(run)
        session.commit()
        logger.info("Daily check report sent")


def _should_start_daily_run(now: datetime) -> bool:
    """Whether this run must start today's full check.

    True on the first run at or after the configured analysis hour of a day
    with no ``DailyCheckRun`` yet, so the full check happens once per day
    even if the scheduled tick was missed (container stopped or restarted).

    Args:
        now (datetime): Naive local time of the run.

    Returns:
        bool: True to run the full check, False to run the retry pass.
    """
    with Session(engine) as session:
        configured_hour = int(get_config_value(session, "analysis_hour", "12"))
        already_started = daily_check_service.get_today_run(session, now) is not None

    logger.info(
        f"Current time: {now:%H:%M}, configured analysis hour: {configured_hour}, "
        f"today's check started: {already_started}"
    )
    return not already_started and now.hour >= configured_hour


async def main(now: datetime | None = None):
    """Main entry point for the cronjob (runs every 10 minutes).

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    logger.info("=== Product Status Tracking Cronjob Started ===")

    with _run_lock() as acquired:
        if not acquired:
            logger.info("Previous run still in progress. Skipping.")
            return

        if _should_start_daily_run(now):
            logger.info("Starting today's product status check...")
            await fetch_and_store_product_status(now=now)
        else:
            logger.info("Checking pending rate-limit retries...")
            await retry_rate_limited_products(now=now)

        await send_provider_alerts_if_due(now)
        await send_daily_report_if_due(now)

    logger.info("=== Product Status Tracking Cronjob Completed ===")


if __name__ == "__main__":
    asyncio.run(main())
