"""
Daily price tracking cronjob script.

This script should be run every hour via cron. It will:
1. Check if the current hour matches the configured analysis hour
2. If it matches, fetch prices for every product not yet checked today and
   store them in the database (invalid prices are discarded)
3. Send Telegram alerts if price drops or stock changes are detected (if configured)

"Today" and the analysis hour use the process local time, set with the
``TZ`` environment variable (the Docker image defaults to UTC).
"""

import asyncio
import logging
import math
import sys
from datetime import datetime, timedelta
from datetime import time as dt_time

from sqlmodel import Session, select
from src.core.config import get_config_value
from src.core.database import engine
from src.models.database_models import Product, ProductHist
from src.stagehand_utils import get_product_status
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


async def fetch_and_store_product_status(now: datetime | None = None):
    """Fetch product status for all products and store them in the database.

    Products already checked today are skipped, invalid prices are not
    stored, and Telegram alerts are sent when price drops or stock changes
    are detected (when configured).

    Args:
        now (datetime | None): Naive local time of the run; defaults to
            ``datetime.now()``.
    """
    now = now or datetime.now()
    logger.info("Starting product status fetch process...")

    with Session(engine) as session:
        # Google API key
        google_api_key = get_config_value(session, "google_api_key")
        if not google_api_key:
            logger.error("Google API key not configured in database. Exiting.")
            return

        # Telegram settings
        tg = _load_telegram_settings(session)

        if tg["enabled"]:
            logger.info("Telegram notifications enabled")
            logger.info(
                f"Price drop alerts: {tg['price_drop']}, "
                f"Stock change alerts: {tg['stock_change']}"
            )
        else:
            logger.info("Telegram notifications disabled (credentials not configured)")

        # Products
        products = session.exec(select(Product)).all()
        if not products:
            logger.info("No products found in database. Exiting.")
            return

        logger.info(f"Found {len(products)} products to process")
        current_timestamp = int(now.timestamp())
        day_start, day_end = _local_day_bounds(now)

        success_count = 0
        skipped_count = 0
        error_count = 0

        for product in products:
            try:
                if _has_record_between(session, product.id, day_start, day_end):
                    logger.info(
                        f"Skipping {product.name} (ID: {product.id}): already checked today"
                    )
                    skipped_count += 1
                    continue

                logger.info(
                    f"Fetching product status for: {product.name} (ID: {product.id})"
                )
                product_status = await get_product_status(google_api_key, product.url)

                if not _is_valid_price(product_status.price):
                    logger.error(
                        f"Invalid price {product_status.price!r} for {product.name} "
                        f"(ID: {product.id}); nothing stored"
                    )
                    error_count += 1
                    continue

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
                        timestamp=current_timestamp,
                    )
                )
                session.commit()

                logger.info(
                    f"Stored price {product_status.price} / stock {product_status.is_in_stock} "
                    f"for {product.name}"
                )
                success_count += 1

            except Exception as e:
                logger.error(
                    f"Error processing {product.name} (ID: {product.id}): {str(e)}"
                )
                error_count += 1
                continue

        logger.info(
            f"Process completed. Success: {success_count}, "
            f"Skipped: {skipped_count}, Errors: {error_count}"
        )


def should_run_analysis() -> bool:
    """Check if the current hour matches the configured analysis hour.

    Returns:
        bool: True if analysis should run, False otherwise.
    """
    current_hour = datetime.now().hour

    with Session(engine) as session:
        configured_hour = int(get_config_value(session, "analysis_hour", "12"))

        logger.info(
            f"Current hour: {current_hour}, Configured analysis hour: {configured_hour}"
        )

        return current_hour == configured_hour


async def main():
    """Main entry point for the cronjob."""
    logger.info("=== Product Status Tracking Cronjob Started ===")

    if should_run_analysis():
        logger.info(
            "Current hour matches configured analysis hour. Starting product status fetch..."
        )
        await fetch_and_store_product_status()
    else:
        logger.info("Current hour does not match configured analysis hour. Skipping.")

    logger.info("=== Product Status Tracking Cronjob Completed ===")


if __name__ == "__main__":
    asyncio.run(main())
