"""
Daily price tracking cronjob script.

This script should be run every 10 minutes via cron. It will:
1. On the first run at or after the configured analysis hour each day (no
   ``DailyCheckRun`` row yet), fetch prices for every offer (a product in one
   store) not yet checked today and store them in the database (invalid
   prices are discarded)
2. If the Gemini quota (requests per minute or per day) runs out during that
   run, stop and mark the offers left as pending retries
3. On every later run that day, retry today's pending offers, stopping
   again at the next quota error, until each one gets its record for the day
4. Send Telegram alerts if price drops or stock changes are detected (if configured)
5. Send the Telegram daily check report once per day, per ``daily_check_report``

"Today" and the analysis hour use the process local time, set with the
``TZ`` environment variable (the Docker image defaults to UTC).
"""

import asyncio
import fcntl
import logging
import math
import sys
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from enum import Enum

from sqlalchemy.orm.exc import ObjectDeletedError
from sqlmodel import Session, delete, func, select
from src.core.config import get_config_value, get_daily_check_report
from src.core.database import engine
from src.core.local_day import format_local_time, is_end_of_day, local_day_bounds
from src.models.database_models import (
    DailyCheckRun,
    Offer,
    OfferHist,
    PendingStatusRetry,
    Product,
    Store,
)
from src.services import daily_check_service
from src.stagehand_utils import get_product_status, is_rate_limit_error
from src.telegram_utils import (
    build_daily_done_message,
    build_daily_unchecked_message,
    send_daily_check_report,
    send_price_drop_alert,
    send_stock_alert,
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)


async def _check_price_drop(
    product,
    offer,
    store_name,
    product_status,
    last_in_stock_hist,
    telegram_bot_token,
    telegram_bot_chat_id,
    selected_language,
):
    """Send a Telegram alert if the price dropped while in stock.

    Only prices you could actually buy are compared: the new status must be
    in stock and cheaper than the most recent in-stock record.

    Args:
        product: The Product record.
        offer: The Offer record that was checked.
        store_name (str | None): The offer's store name.
        product_status: Freshly scraped (and validated) status.
        last_in_stock_hist: The most recent in-stock OfferHist record,
            or None if the product was never in stock.
        telegram_bot_token (str): Bot token.
        telegram_bot_chat_id (str): Chat ID.
        selected_language (str): Language code.
    """
    if not product_status.is_in_stock or last_in_stock_hist is None:
        return
    if product_status.price < last_in_stock_hist.price:
        logger.info(
            f"Price drop detected for {product.name}: "
            f"{last_in_stock_hist.price} -> {product_status.price} {offer.currency}"
        )
        try:
            await send_price_drop_alert(
                bot_token=telegram_bot_token,
                chat_id=telegram_bot_chat_id,
                product_name=product.name,
                product_url=offer.url,
                old_price=last_in_stock_hist.price,
                new_price=product_status.price,
                lang=selected_language,
                currency=offer.currency,
                store_name=store_name,
            )
            logger.info(f"Price drop alert sent for {product.name}")
        except Exception as e:
            logger.error(
                f"Failed to send price drop alert for {product.name}: {str(e)}"
            )


async def _check_stock_change(
    product,
    offer,
    store_name,
    product_status,
    last_hist,
    telegram_bot_token,
    telegram_bot_chat_id,
    selected_language,
):
    """Send a Telegram alert if the product came back in stock.

    Args:
        product: The Product record.
        offer: The Offer record that was checked.
        store_name (str | None): The offer's store name.
        product_status: Freshly scraped status.
        last_hist: The most recent OfferHist record.
        telegram_bot_token (str): Bot token.
        telegram_bot_chat_id (str): Chat ID.
        selected_language (str): Language code.
    """
    if not last_hist.is_in_stock and product_status.is_in_stock:
        logger.info(f"Stock availability detected for {product.name}: now in stock")
        try:
            await send_stock_alert(
                bot_token=telegram_bot_token,
                chat_id=telegram_bot_chat_id,
                product_name=product.name,
                product_url=offer.url,
                current_price=product_status.price,
                lang=selected_language,
                currency=offer.currency,
                store_name=store_name,
            )
            logger.info(f"Stock alert sent for {product.name}")
        except Exception as e:
            logger.error(f"Failed to send stock alert for {product.name}: {str(e)}")


def _load_telegram_settings(session: Session) -> dict:
    """Read all Telegram-related settings from the Config table.

    Args:
        session (Session): Active database session.

    Returns:
        dict: Keys ``token``, ``chat_id``, ``price_drop``, ``stock_change``,
              ``language``, and ``enabled``.
    """
    token = get_config_value(session, "telegram_bot_token")
    chat_id = get_config_value(session, "telegram_bot_chat_id")
    is_price_drop = (
        get_config_value(session, "is_price_drop_alert", "false").lower() == "true"
    )
    is_stock_change = (
        get_config_value(session, "is_stock_change_alert", "false").lower() == "true"
    )
    language = get_config_value(session, "selected_language", "english")

    return {
        "token": token,
        "chat_id": chat_id,
        "price_drop": is_price_drop,
        "stock_change": is_stock_change,
        "language": language,
        "enabled": bool(token and chat_id),
    }


def _is_valid_price(price) -> bool:
    """Whether a scraped price can be stored (finite and positive).

    Args:
        price: The scraped price.

    Returns:
        bool: True for a finite number greater than zero.
    """
    return (
        isinstance(price, int | float)
        and not isinstance(price, bool)
        and math.isfinite(price)
        and price > 0
    )


def _has_record_between(session: Session, offer_id: int, start: int, end: int) -> bool:
    """Whether the offer already has a history record in ``[start, end)``."""
    return (
        session.exec(
            select(OfferHist.id).where(
                OfferHist.offer_id == offer_id,
                OfferHist.timestamp >= start,
                OfferHist.timestamp < end,
            )
        ).first()
        is not None
    )


def _last_record(session: Session, offer_id: int, in_stock_only: bool = False):
    """Return the offer's most recent record (optionally only in-stock ones)."""
    query = select(OfferHist).where(OfferHist.offer_id == offer_id)
    if in_stock_only:
        query = query.where(OfferHist.is_in_stock == True)  # noqa: E712
    return session.exec(
        query.order_by(OfferHist.timestamp.desc(), OfferHist.id.desc())
    ).first()


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


class _CheckOutcome(Enum):
    """Result of checking one offer."""

    STORED = "stored"  # A new history record was stored.
    SKIPPED = "skipped"  # The offer already had a record today.
    FAILED = "failed"  # Invalid price or non-quota error; nothing stored.
    RATE_LIMITED = "rate_limited"  # The Gemini quota ran out.


async def _check_offer(
    session: Session,
    offer: Offer,
    google_api_key: str,
    tg: dict,
    now: datetime,
) -> _CheckOutcome:
    """Fetch, validate and store one offer's status, sending alerts.

    Args:
        session (Session): Active database session.
        offer (Offer): The offer (a product in one store) to check.
        google_api_key (str): Google API key for Stagehand.
        tg (dict): Telegram settings from ``_load_telegram_settings``.
        now (datetime): Naive local time of the run.

    Returns:
        _CheckOutcome: What happened to the offer.
    """
    # The user may remove a store (or its product) while a long run is in
    # progress: skip it instead of stopping the whole run.
    try:
        product = session.get(Product, offer.product_id)
    except ObjectDeletedError:
        product = None
    if product is None:
        logger.warning("Skipping an offer that was deleted during the run")
        return _CheckOutcome.SKIPPED
    store = session.get(Store, offer.store_id) if offer.store_id is not None else None
    store_name = store.name if store else None
    label = f"{product.name} @ {store_name or offer.url} (offer ID: {offer.id})"
    day_start, day_end = local_day_bounds(now)
    try:
        if _has_record_between(session, offer.id, day_start, day_end):
            logger.info(f"Skipping {label}: already checked today")
            return _CheckOutcome.SKIPPED

        logger.info(f"Fetching product status for: {label}")
        product_status = await get_product_status(google_api_key, offer.url)

        if not _is_valid_price(product_status.price):
            logger.error(
                f"Invalid price {product_status.price!r} for {label}; nothing stored"
            )
            return _CheckOutcome.FAILED

        # Conditional alerts
        if tg["enabled"]:
            if tg["price_drop"]:
                await _check_price_drop(
                    product,
                    offer,
                    store_name,
                    product_status,
                    _last_record(session, offer.id, in_stock_only=True),
                    tg["token"],
                    tg["chat_id"],
                    tg["language"],
                )
            last_offer_hist = _last_record(session, offer.id)
            if tg["stock_change"] and last_offer_hist:
                await _check_stock_change(
                    product,
                    offer,
                    store_name,
                    product_status,
                    last_offer_hist,
                    tg["token"],
                    tg["chat_id"],
                    tg["language"],
                )

        # Store new history record
        session.add(
            OfferHist(
                offer_id=offer.id,
                price=product_status.price,
                is_in_stock=product_status.is_in_stock,
                timestamp=int(now.timestamp()),
            )
        )
        session.commit()

        logger.info(
            f"Stored price {product_status.price} / stock {product_status.is_in_stock} "
            f"for {label}"
        )
        return _CheckOutcome.STORED

    except Exception as e:
        if is_rate_limit_error(e):
            logger.warning(f"Gemini quota exhausted while checking {label}: {str(e)}")
            return _CheckOutcome.RATE_LIMITED
        logger.error(f"Error processing {label}: {str(e)}")
        return _CheckOutcome.FAILED


async def _check_offers(
    session: Session,
    offers: list[Offer],
    google_api_key: str,
    now: datetime,
) -> tuple[list[int], int | None]:
    """Check offers in order, stopping at the first Gemini quota error.

    Once the quota runs out every later call would fail too, so the rest of
    the offers are left for a retry instead of spending more requests.

    Args:
        session (Session): Active database session.
        offers (list[Offer]): The offers to check, in order.
        google_api_key (str): Google API key for Stagehand.
        now (datetime): Naive local time of the run.

    Returns:
        tuple[list[int], int | None]: IDs of the offers still without a
            record today because of the quota (the one that hit it and every
            offer after it; offers already checked today are left out), and
            the Unix time of the quota error, or None if the quota never ran
            out.
    """
    tg = _load_telegram_settings(session)
    if tg["enabled"]:
        logger.info("Telegram notifications enabled")
        logger.info(
            f"Price drop alerts: {tg['price_drop']}, "
            f"Stock change alerts: {tg['stock_change']}"
        )
    else:
        logger.info("Telegram notifications disabled (credentials not configured)")

    counts = {outcome: 0 for outcome in _CheckOutcome}
    pending_ids: list[int] = []
    limit_reached_at: int | None = None
    for index, offer in enumerate(offers):
        outcome = await _check_offer(session, offer, google_api_key, tg, now)
        counts[outcome] += 1
        if outcome is _CheckOutcome.RATE_LIMITED:
            limit_reached_at = _current_timestamp()
            day_start, day_end = local_day_bounds(now)
            pending_ids = [offer.id] + [
                o.id
                for o in offers[index + 1 :]
                if not _has_record_between(session, o.id, day_start, day_end)
            ]
            logger.warning(
                f"Stopping: {len(pending_ids)} offer(s) left for a retry on the next run"
            )
            break

    logger.info(
        f"Process completed. Success: {counts[_CheckOutcome.STORED]}, "
        f"Skipped: {counts[_CheckOutcome.SKIPPED]}, "
        f"Errors: {counts[_CheckOutcome.FAILED]}, "
        f"Pending retry: {len(pending_ids)}"
    )
    return pending_ids, limit_reached_at


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
    are detected (when configured). If the Gemini quota runs out, the run
    stops and the offers left are saved as pending retries for today,
    replacing any previous pending retries.

    Creates today's ``DailyCheckRun`` (only once an API key and at least one
    offer exist, so a run that cannot start is attempted again on the next
    tick) and records the first quota error in it.

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    logger.info("Starting product status fetch process...")

    with Session(engine) as session:
        google_api_key = get_config_value(session, "google_api_key")
        if not google_api_key:
            logger.error("Google API key not configured in database. Exiting.")
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

        pending_ids, limit_reached_at = await _check_offers(
            session, offers, google_api_key, now
        )

        for offer_id in pending_ids:
            session.add(PendingStatusRetry(offer_id=offer_id, day_start=day_start))
        if limit_reached_at is not None:
            daily_run.limit_reached_at = limit_reached_at
            daily_run.pending_at_limit = len(pending_ids)
            session.add(daily_run)
        session.commit()


async def retry_rate_limited_products(now: datetime | None = None):
    """Retry today's offers whose check hit the Gemini quota.

    Pending retries from a previous day are deleted without retrying them.
    An offer leaves the pending list once it is checked, whether its record
    is stored or it fails for a reason other than the quota; an offer that
    hits the quota again stays pending (with every offer after it) until the
    next run.

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

        google_api_key = get_config_value(session, "google_api_key")
        if not google_api_key:
            logger.error("Google API key not configured in database. Exiting.")
            return

        logger.info(f"Retrying {len(offers)} rate-limited offer(s)")
        # The day's snapshot of the first quota error is never overwritten.
        still_pending, _ = await _check_offers(session, offers, google_api_key, now)

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
        )
    if is_end_of_day(now) and limit_time is not None:
        return build_daily_unchecked_message(
            lang, counts.pending, run.total_offers, limit_time, run.pending_at_limit
        )
    return None


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
        tg = _load_telegram_settings(session)
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

        await send_daily_report_if_due(now)

    logger.info("=== Product Status Tracking Cronjob Completed ===")


if __name__ == "__main__":
    asyncio.run(main())
