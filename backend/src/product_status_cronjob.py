"""
Daily price tracking cronjob script.

This script should be run every hour via cron. It will:
1. Check if the current hour matches the configured analysis hour
2. If it matches, fetch prices for all products and store them in the database
3. Send Telegram alerts if price drops or stock changes are detected (if configured)
"""

import asyncio
import logging
import sys
from datetime import datetime

from sqlmodel import Session, select

from src.core.config import get_config_value
from src.core.database import engine
from src.models.database_models import Product, ProductHist
from src.stagehand_utils import get_product_status
from src.telegram_utils import send_price_drop_alert, send_stock_alert


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


async def _check_price_drop(
    product, product_status, last_hist, telegram_bot_token, telegram_bot_chat_id, selected_language
):
    """Send a Telegram alert if the price dropped.

    Args:
        product: The Product record.
        product_status: Freshly scraped status.
        last_hist: The most recent ProductHist record.
        telegram_bot_token (str): Bot token.
        telegram_bot_chat_id (str): Chat ID.
        selected_language (str): Language code.
    """
    if product_status.price < last_hist.price:
        logger.info(
            f"Price drop detected for {product.name}: "
            f"{last_hist.price}€ -> {product_status.price}€"
        )
        try:
            await send_price_drop_alert(
                bot_token=telegram_bot_token,
                chat_id=telegram_bot_chat_id,
                product_name=product.name,
                product_url=product.url,
                old_price=last_hist.price,
                new_price=product_status.price,
                lang=selected_language,
                currency=product.currency,
            )
            logger.info(f"Price drop alert sent for {product.name}")
        except Exception as e:
            logger.error(
                f"Failed to send price drop alert for {product.name}: {str(e)}")


async def _check_stock_change(
    product, product_status, last_hist, telegram_bot_token, telegram_bot_chat_id, selected_language
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
        logger.info(
            f"Stock availability detected for {product.name}: now in stock")
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
            logger.error(
                f"Failed to send stock alert for {product.name}: {str(e)}")


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
    is_price_drop = get_config_value(
        session, "is_price_drop_alert", "false").lower() == "true"
    is_stock_change = get_config_value(
        session, "is_stock_change_alert", "false").lower() == "true"
    language = get_config_value(session, "selected_language", "english")

    return {
        "token": token,
        "chat_id": chat_id,
        "price_drop": is_price_drop,
        "stock_change": is_stock_change,
        "language": language,
        "enabled": bool(token and chat_id),
    }


async def fetch_and_store_product_status():
    """Fetch product status for all products and store them in the database.

    Send Telegram alerts if price drops or stock changes are detected
    (when configured).
    """
    logger.info("Starting product status fetch process...")

    with Session(engine) as session:
        # Google API key
        google_api_key = get_config_value(session, "google_api_key")
        if not google_api_key:
            logger.error(
                "Google API key not configured in database. Exiting.")
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
            logger.info(
                "Telegram notifications disabled (credentials not configured)")

        # Products
        products = session.exec(select(Product)).all()
        if not products:
            logger.info("No products found in database. Exiting.")
            return

        logger.info(f"Found {len(products)} products to process")
        current_timestamp = int(datetime.now().timestamp())

        success_count = 0
        error_count = 0

        for product in products:
            try:
                logger.info(
                    f"Fetching product status for: {product.name} (ID: {product.id})")

                product_status = await get_product_status(google_api_key, product.url)

                # Most recent history for comparison
                last_product_hist = session.exec(
                    select(ProductHist)
                    .where(ProductHist.product_id == product.id)
                    .order_by(ProductHist.timestamp.desc())
                ).first()

                # Conditional alerts
                if tg["enabled"] and last_product_hist:
                    if tg["price_drop"]:
                        await _check_price_drop(
                            product, product_status, last_product_hist,
                            tg["token"], tg["chat_id"], tg["language"],
                        )
                    if tg["stock_change"]:
                        await _check_stock_change(
                            product, product_status, last_product_hist,
                            tg["token"], tg["chat_id"], tg["language"],
                        )

                # Store new history record
                product_hist = ProductHist(
                    product_id=product.id,
                    price=product_status.price,
                    is_in_stock=product_status.is_in_stock,
                    timestamp=current_timestamp,
                )
                session.add(product_hist)
                session.commit()

                logger.info(
                    f"Stored price {product_status.price} / stock {product_status.is_in_stock} "
                    f"for {product.name}"
                )
                success_count += 1

            except Exception as e:
                logger.error(
                    f"Error processing {product.name} (ID: {product.id}): {str(e)}")
                error_count += 1
                continue

        logger.info(
            f"Process completed. Success: {success_count}, Errors: {error_count}")


def should_run_analysis() -> bool:
    """Check if the current hour matches the configured analysis hour.

    Returns:
        bool: True if analysis should run, False otherwise.
    """
    current_hour = datetime.now().hour

    with Session(engine) as session:
        configured_hour = int(
            get_config_value(session, "analysis_hour", "12"))

        logger.info(
            f"Current hour: {current_hour}, Configured analysis hour: {configured_hour}")

        return current_hour == configured_hour


async def main():
    """Main entry point for the cronjob."""
    logger.info("=== Product Status Tracking Cronjob Started ===")

    if should_run_analysis():
        logger.info(
            "Current hour matches configured analysis hour. Starting product status fetch...")
        await fetch_and_store_product_status()
    else:
        logger.info(
            "Current hour does not match configured analysis hour. Skipping.")

    logger.info("=== Product Status Tracking Cronjob Completed ===")


if __name__ == "__main__":
    asyncio.run(main())
