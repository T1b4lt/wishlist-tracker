"""
Daily price tracking cronjob script.

This script should be run every hour via cron. It will:
1. At the configured analysis hour, fetch prices for every product not yet
   checked today and store them in the database (invalid prices are discarded)
2. If the Gemini quota (requests per minute or per day) runs out during that
   run, stop and mark the products left as pending retries
3. At every other hour, retry today's pending products, stopping again at
   the next quota error, until each one gets its record for the day
4. Send Telegram alerts if price drops or stock changes are detected (if configured)

"Today" and the analysis hour use the process local time, set with the
``TZ`` environment variable (the Docker image defaults to UTC).
"""

import asyncio
import logging
import math
import sys
from datetime import datetime, timedelta
from datetime import time as dt_time
from enum import Enum

from sqlmodel import Session, delete, func, select
from src.core.config import get_config_value
from src.core.database import engine
from src.models.database_models import PendingStatusRetry, Product, ProductHist
from src.stagehand_utils import get_product_status, is_rate_limit_error
from src.telegram_utils import send_price_drop_alert, send_stock_alert

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


def _local_day_bounds(now: datetime) -> tuple[int, int]:
    """Return the Unix timestamps of the start of ``now``'s local day and the next.

    Args:
        now (datetime): A naive local datetime.

    Returns:
        tuple[int, int]: ``(start, end)`` with ``start <= t < end`` for
            every timestamp ``t`` of that day.
    """
    start = datetime.combine(now.date(), dt_time.min)
    return int(start.timestamp()), int((start + timedelta(days=1)).timestamp())


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
    day_start, day_end = _local_day_bounds(now)
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
) -> list[int]:
    """Check products in order, stopping at the first Gemini quota error.

    Once the quota runs out every later call would fail too, so the rest of
    the products are left for a retry instead of spending more requests.

    Args:
        session (Session): Active database session.
        products (list[Product]): The products to check, in order.
        google_api_key (str): Google API key for Stagehand.
        now (datetime): Naive local time of the run.

    Returns:
        list[int]: IDs of the products still without a record today because
            of the quota: the one that hit it and every product after it
            (products already checked today are left out).
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
    for index, product in enumerate(products):
        outcome = await _check_product(session, product, google_api_key, tg, now)
        counts[outcome] += 1
        if outcome is _CheckOutcome.RATE_LIMITED:
            day_start, day_end = _local_day_bounds(now)
            pending_ids = [product.id] + [
                p.id
                for p in products[index + 1 :]
                if not _has_record_between(session, p.id, day_start, day_end)
            ]
            logger.warning(
                f"Stopping: {len(pending_ids)} product(s) left for a retry next hour"
            )
            break

    logger.info(
        f"Process completed. Success: {counts[_CheckOutcome.STORED]}, "
        f"Skipped: {counts[_CheckOutcome.SKIPPED]}, "
        f"Errors: {counts[_CheckOutcome.FAILED]}, "
        f"Pending retry: {len(pending_ids)}"
    )
    return pending_ids


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
        pending_ids = await _check_products(session, products, google_api_key, now)

        day_start, _ = _local_day_bounds(now)
        for product_id in pending_ids:
            session.add(PendingStatusRetry(product_id=product_id, day_start=day_start))
        session.commit()


async def retry_rate_limited_products(now: datetime | None = None):
    """Retry today's products whose check hit the Gemini quota.

    Pending retries from a previous day are deleted without retrying them.
    A product leaves the pending list once it is checked, whether its
    record is stored or it fails for a reason other than the quota; a
    product that hits the quota again stays pending (with every product
    after it) until the next hourly run.

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    day_start, _ = _local_day_bounds(now)

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
        still_pending = await _check_products(session, products, google_api_key, now)

        session.exec(
            delete(PendingStatusRetry).where(
                PendingStatusRetry.product_id.not_in(still_pending)
            )
        )
        session.commit()


def should_run_analysis(now: datetime | None = None) -> bool:
    """Check if the current hour matches the configured analysis hour.

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.

    Returns:
        bool: True if analysis should run, False otherwise.
    """
    current_hour = (now or datetime.now()).hour

    with Session(engine) as session:
        configured_hour = int(get_config_value(session, "analysis_hour", "12"))

        logger.info(
            f"Current hour: {current_hour}, Configured analysis hour: {configured_hour}"
        )

        return current_hour == configured_hour


async def main(now: datetime | None = None):
    """Main entry point for the cronjob.

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    logger.info("=== Product Status Tracking Cronjob Started ===")

    if should_run_analysis(now):
        logger.info(
            "Current hour matches configured analysis hour. Starting product status fetch..."
        )
        await fetch_and_store_product_status(now=now)
    else:
        logger.info(
            "Current hour does not match configured analysis hour. "
            "Checking pending rate-limit retries..."
        )
        await retry_rate_limited_products(now=now)

    logger.info("=== Product Status Tracking Cronjob Completed ===")


if __name__ == "__main__":
    asyncio.run(main())
