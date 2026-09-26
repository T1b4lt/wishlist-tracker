"""
Daily price tracking cronjob script.

This script should be run every 10 minutes via cron. It will:
1. On the first run at or after the configured analysis hour each day (no
   ``DailyCheckRun`` row yet), fetch prices for every product not yet checked
   today and store them in the database (invalid prices are discarded)
2. If the Gemini quota (requests per minute or per day) runs out during that
   run, stop and mark the products left as pending retries
3. On every later run that day, retry today's pending products, stopping
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

from sqlmodel import Session, delete, func, select
from src.core.config import get_config_value, get_daily_check_report
from src.core.database import engine
from src.core.local_day import format_local_time, is_end_of_day, local_day_bounds
from src.models.database_models import (
    DailyCheckRun,
    PendingStatusRetry,
    Product,
    ProductHist,
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
        product_status: Freshly scraped (and validated) status.
        last_in_stock_hist: The most recent in-stock ProductHist record,
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
            f"{last_in_stock_hist.price} -> {product_status.price} {product.currency}"
        )
        try:
            await send_price_drop_alert(
                bot_token=telegram_bot_token,
                chat_id=telegram_bot_chat_id,
                product_name=product.name,
                product_url=product.url,
                old_price=last_in_stock_hist.price,
                new_price=product_status.price,
                lang=selected_language,
                currency=product.currency,
            )
            logger.info(f"Price drop alert sent for {product.name}")
        except Exception as e:
            logger.error(
                f"Failed to send price drop alert for {product.name}: {str(e)}"
            )


async def _check_stock_change(
    product,
    product_status,
    last_hist,
    telegram_bot_token,
    telegram_bot_chat_id,
    selected_language,
):
    """Send a Telegram alert if the product came back in stock.

    Args:
        product: The Product record.
        product_status: Freshly scraped status.
        last_hist: The most recent ProductHist record.
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
                product_url=product.url,
                current_price=product_status.price,
                lang=selected_language,
                currency=product.currency,
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


def _has_record_between(
    session: Session, product_id: int, start: int, end: int
) -> bool:
    """Whether the product already has a history record in ``[start, end)``."""
    return (
        session.exec(
            select(ProductHist.id).where(
                ProductHist.product_id == product_id,
                ProductHist.timestamp >= start,
                ProductHist.timestamp < end,
            )
        ).first()
        is not None
    )


def _last_record(session: Session, product_id: int, in_stock_only: bool = False):
    """Return the most recent history record (optionally only in-stock ones)."""
    query = select(ProductHist).where(ProductHist.product_id == product_id)
    if in_stock_only:
        query = query.where(ProductHist.is_in_stock == True)  # noqa: E712
    return session.exec(
        query.order_by(ProductHist.timestamp.desc(), ProductHist.id.desc())
    ).first()


# Held for the whole run, so a run that outlasts the 10-minute schedule (a
# full check of many products) never overlaps with the next one. Next to the
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
    """Result of checking one product."""

    STORED = "stored"  # A new history record was stored.
    SKIPPED = "skipped"  # The product already had a record today.
    FAILED = "failed"  # Invalid price or non-quota error; nothing stored.
    RATE_LIMITED = "rate_limited"  # The Gemini quota ran out.


async def _check_product(
    session: Session,
    product: Product,
    google_api_key: str,
    tg: dict,
    now: datetime,
) -> _CheckOutcome:
    """Fetch, validate and store one product's status, sending alerts.

    Args:
        session (Session): Active database session.
        product (Product): The product to check.
        google_api_key (str): Google API key for Stagehand.
        tg (dict): Telegram settings from ``_load_telegram_settings``.
        now (datetime): Naive local time of the run.

    Returns:
        _CheckOutcome: What happened to the product.
    """
    day_start, day_end = local_day_bounds(now)
    try:
        if _has_record_between(session, product.id, day_start, day_end):
            logger.info(
                f"Skipping {product.name} (ID: {product.id}): already checked today"
            )
            return _CheckOutcome.SKIPPED

        logger.info(f"Fetching product status for: {product.name} (ID: {product.id})")
        product_status = await get_product_status(google_api_key, product.url)

        if not _is_valid_price(product_status.price):
            logger.error(
                f"Invalid price {product_status.price!r} for {product.name} "
                f"(ID: {product.id}); nothing stored"
            )
            return _CheckOutcome.FAILED

        # Conditional alerts
        if tg["enabled"]:
            if tg["price_drop"]:
                await _check_price_drop(
                    product,
                    product_status,
                    _last_record(session, product.id, in_stock_only=True),
                    tg["token"],
                    tg["chat_id"],
                    tg["language"],
                )
            last_product_hist = _last_record(session, product.id)
            if tg["stock_change"] and last_product_hist:
                await _check_stock_change(
                    product,
                    product_status,
                    last_product_hist,
                    tg["token"],
                    tg["chat_id"],
                    tg["language"],
                )

        # Store new history record
        session.add(
            ProductHist(
                product_id=product.id,
                price=product_status.price,
                is_in_stock=product_status.is_in_stock,
                timestamp=int(now.timestamp()),
            )
        )
        session.commit()

        logger.info(
            f"Stored price {product_status.price} / stock {product_status.is_in_stock} "
            f"for {product.name}"
        )
        return _CheckOutcome.STORED

    except Exception as e:
        if is_rate_limit_error(e):
            logger.warning(
                f"Gemini quota exhausted while checking {product.name} "
                f"(ID: {product.id}): {str(e)}"
            )
            return _CheckOutcome.RATE_LIMITED
        logger.error(f"Error processing {product.name} (ID: {product.id}): {str(e)}")
        return _CheckOutcome.FAILED


async def _check_products(
    session: Session,
    products: list[Product],
    google_api_key: str,
    now: datetime,
) -> tuple[list[int], int | None]:
    """Check products in order, stopping at the first Gemini quota error.

    Once the quota runs out every later call would fail too, so the rest of
    the products are left for a retry instead of spending more requests.

    Args:
        session (Session): Active database session.
        products (list[Product]): The products to check, in order.
        google_api_key (str): Google API key for Stagehand.
        now (datetime): Naive local time of the run.

    Returns:
        tuple[list[int], int | None]: IDs of the products still without a
            record today because of the quota (the one that hit it and every
            product after it; products already checked today are left out),
            and the Unix time of the quota error, or None if the quota never
            ran out.
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
    for index, product in enumerate(products):
        outcome = await _check_product(session, product, google_api_key, tg, now)
        counts[outcome] += 1
        if outcome is _CheckOutcome.RATE_LIMITED:
            limit_reached_at = _current_timestamp()
            day_start, day_end = local_day_bounds(now)
            pending_ids = [product.id] + [
                p.id
                for p in products[index + 1 :]
                if not _has_record_between(session, p.id, day_start, day_end)
            ]
            logger.warning(
                f"Stopping: {len(pending_ids)} product(s) left for a retry on the next run"
            )
            break

    logger.info(
        f"Process completed. Success: {counts[_CheckOutcome.STORED]}, "
        f"Skipped: {counts[_CheckOutcome.SKIPPED]}, "
        f"Errors: {counts[_CheckOutcome.FAILED]}, "
        f"Pending retry: {len(pending_ids)}"
    )
    return pending_ids, limit_reached_at


def _products_least_recently_checked_first(session: Session) -> list[Product]:
    """Return every product, the ones without a recent record first.

    Products never checked come first, then by the timestamp of their last
    record (oldest first), then by ID. When the daily quota cannot cover
    every product, the ones left out one day are checked first the next, so
    coverage rotates instead of always missing the last products added.

    Args:
        session (Session): Active database session.

    Returns:
        list[Product]: All products in checking order.
    """
    last_checked = (
        select(
            ProductHist.product_id,
            func.max(ProductHist.timestamp).label("last_timestamp"),
        )
        .group_by(ProductHist.product_id)
        .subquery()
    )
    return session.exec(
        select(Product)
        .outerjoin(last_checked, last_checked.c.product_id == Product.id)
        .order_by(last_checked.c.last_timestamp.asc().nulls_first(), Product.id)
    ).all()


async def fetch_and_store_product_status(now: datetime | None = None):
    """Fetch product status for all products and store them in the database.

    Products already checked today are skipped, invalid prices are not
    stored, and Telegram alerts are sent when price drops or stock changes
    are detected (when configured). If the Gemini quota runs out, the run
    stops and the products left are saved as pending retries for today,
    replacing any previous pending retries.

    Creates today's ``DailyCheckRun`` (only once an API key and at least one
    product exist, so a run that cannot start is attempted again on the next
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

        # This run checks every product, so older retries are superseded.
        session.exec(delete(PendingStatusRetry))
        session.commit()

        products = _products_least_recently_checked_first(session)
        if not products:
            logger.info("No products found in database. Exiting.")
            return

        logger.info(f"Found {len(products)} products to process")
        day_start, _ = local_day_bounds(now)
        daily_run = DailyCheckRun(
            day_start=day_start,
            started_at=int(now.timestamp()),
            total_products=len(products),
        )
        session.add(daily_run)
        session.commit()

        pending_ids, limit_reached_at = await _check_products(
            session, products, google_api_key, now
        )

        for product_id in pending_ids:
            session.add(PendingStatusRetry(product_id=product_id, day_start=day_start))
        if limit_reached_at is not None:
            daily_run.limit_reached_at = limit_reached_at
            daily_run.pending_at_limit = len(pending_ids)
            session.add(daily_run)
        session.commit()


async def retry_rate_limited_products(now: datetime | None = None):
    """Retry today's products whose check hit the Gemini quota.

    Pending retries from a previous day are deleted without retrying them.
    A product leaves the pending list once it is checked, whether its
    record is stored or it fails for a reason other than the quota; a
    product that hits the quota again stays pending (with every product
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

        pending_ids = set(session.exec(select(PendingStatusRetry.product_id)).all())
        products = [
            product
            for product in _products_least_recently_checked_first(session)
            if product.id in pending_ids
        ]
        if not products:
            logger.info("No pending retries for today.")
            return

        google_api_key = get_config_value(session, "google_api_key")
        if not google_api_key:
            logger.error("Google API key not configured in database. Exiting.")
            return

        logger.info(f"Retrying {len(products)} rate-limited product(s)")
        # The day's snapshot of the first quota error is never overwritten.
        still_pending, _ = await _check_products(session, products, google_api_key, now)

        session.exec(
            delete(PendingStatusRetry).where(
                PendingStatusRetry.product_id.not_in(still_pending)
            )
        )
        session.commit()


def _build_daily_report(
    session: Session, run: DailyCheckRun, now: datetime
) -> str | None:
    """Return today's report text if it is due, else None.

    "Done" is due once nothing is pending; "left unchecked" only from
    ``END_OF_DAY`` with products still pending.

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
        # Nothing is pending, so every product without a record today failed.
        failed = max(run.total_products - counts.recorded, 0)
        return build_daily_done_message(
            lang,
            counts.recorded,
            run.total_products,
            failed,
            limit_time,
            run.pending_at_limit,
        )
    if is_end_of_day(now) and limit_time is not None:
        return build_daily_unchecked_message(
            lang, counts.pending, run.total_products, limit_time, run.pending_at_limit
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
