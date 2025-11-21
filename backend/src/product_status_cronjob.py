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
from sqlmodel import Session, create_engine, select

from stagehand_utils import get_product_status
from database_models import Config, Product, ProductHist
from telegram_utils import send_price_drop_alert, send_stock_alert


# Database setup
sqlite_file_name = "db/database.db"
sqlite_url = f"sqlite:///{sqlite_file_name}"
connect_args = {"check_same_thread": False}
engine = create_engine(sqlite_url, connect_args=connect_args)


# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)


async def fetch_and_store_product_status():
    """
    Fetch product status for all products and store them in the database.
    Send Telegram alerts if price drops or stock changes are detected (if configured).
    """
    logger.info("Starting product status fetch process...")

    with Session(engine) as session:
        # Get Google API key from config
        google_api_key_config = session.exec(select(Config).where(Config.key == "google_api_key")).first()
        if not google_api_key_config or not google_api_key_config.value:
            logger.error("Google API key not configured in database. Exiting.")
            return
        google_api_key = google_api_key_config.value

        # Get Telegram configuration
        telegram_bot_token_config = session.exec(select(Config).where(Config.key == "telegram_bot_token")).first()
        telegram_bot_chat_id_config = session.exec(select(Config).where(Config.key == "telegram_bot_chat_id")).first()
        is_price_drop_alert_config = session.exec(select(Config).where(Config.key == "is_price_drop_alert")).first()
        is_stock_change_alert_config = session.exec(select(Config).where(Config.key == "is_stock_change_alert")).first()
        selected_language_config = session.exec(select(Config).where(Config.key == "selected_language")).first()

        # Extract Telegram settings with defaults
        telegram_bot_token = telegram_bot_token_config.value if telegram_bot_token_config else ""
        telegram_bot_chat_id = telegram_bot_chat_id_config.value if telegram_bot_chat_id_config else ""
        is_price_drop_alert = is_price_drop_alert_config.value.lower() == "true" if is_price_drop_alert_config else False
        is_stock_change_alert = is_stock_change_alert_config.value.lower() == "true" if is_stock_change_alert_config else False
        selected_language = selected_language_config.value if selected_language_config else "english"

        # Check if Telegram is properly configured
        telegram_enabled = bool(telegram_bot_token and telegram_bot_chat_id)

        if telegram_enabled:
            logger.info("Telegram notifications enabled")
            logger.info(f"Price drop alerts: {is_price_drop_alert}, Stock change alerts: {is_stock_change_alert}")
        else:
            logger.info("Telegram notifications disabled (credentials not configured)")

        # Get all products from the database
        products = session.exec(select(Product)).all()

        if not products:
            logger.info("No products found in database. Exiting.")
            return

        logger.info(f"Found {len(products)} products to process")

        # Get current timestamp (Unix timestamp in seconds)
        current_timestamp = int(datetime.now().timestamp())

        # Process each product
        success_count = 0
        error_count = 0

        for product in products:
            try:
                logger.info(f"Fetching product status for product: {product.name} (ID: {product.id})")

                # Fetch the product status using stagehand
                product_status = await get_product_status(google_api_key, product.url)

                # Get the most recent product history record for comparison
                last_product_hist = session.exec(
                    select(ProductHist)
                    .where(ProductHist.product_id == product.id)
                    .order_by(ProductHist.timestamp.desc())
                ).first()

                # Check for price drop alert
                if telegram_enabled and is_price_drop_alert and last_product_hist:
                    if product_status.price < last_product_hist.price:
                        logger.info(
                            f"Price drop detected for {product.name}: "
                            f"{last_product_hist.price}€ -> {product_status.price}€"
                        )
                        try:
                            await send_price_drop_alert(
                                bot_token=telegram_bot_token,
                                chat_id=telegram_bot_chat_id,
                                product_name=product.name,
                                product_url=product.url,
                                old_price=last_product_hist.price,
                                new_price=product_status.price,
                                lang=selected_language,
                                currency=product.currency
                            )
                            logger.info(f"Price drop alert sent for {product.name}")
                        except Exception as e:
                            logger.error(f"Failed to send price drop alert for {product.name}: {str(e)}")

                # Check for stock change alert (out of stock -> in stock)
                if telegram_enabled and is_stock_change_alert and last_product_hist:
                    if not last_product_hist.is_in_stock and product_status.is_in_stock:
                        logger.info(f"Stock availability detected for {product.name}: now in stock")
                        try:
                            await send_stock_alert(
                                bot_token=telegram_bot_token,
                                chat_id=telegram_bot_chat_id,
                                product_name=product.name,
                                product_url=product.url,
                                current_price=product_status.price,
                                lang=selected_language,
                                currency=product.currency
                            )
                            logger.info(f"Stock alert sent for {product.name}")
                        except Exception as e:
                            logger.error(f"Failed to send stock alert for {product.name}: {str(e)}")

                # Create a new product history record
                product_hist = ProductHist(
                    product_id=product.id,
                    price=product_status.price,
                    is_in_stock=product_status.is_in_stock,
                    timestamp=current_timestamp
                )

                session.add(product_hist)
                session.commit()

                logger.info(
                    f"Successfully stored price {product_status.price} and stock status {product_status.is_in_stock} for product {product.name}")
                success_count += 1

            except Exception as e:
                logger.error(f"Error processing product {product.name} (ID: {product.id}): {str(e)}")
                error_count += 1
                # Continue with next product even if one fails
                continue

        logger.info(f"Product status process completed. Success: {success_count}, Errors: {error_count}")


def should_run_analysis() -> bool:
    """
    Check if the current hour matches the configured analysis hour.

    Returns:
        bool: True if analysis should run, False otherwise
    """
    current_hour = datetime.now().hour

    with Session(engine) as session:
        # Get the configured analysis hour
        analysys_hour_config = session.exec(
            select(Config).where(Config.key == "analysys_hour")
        ).first()

        if not analysys_hour_config:
            logger.warning("analysys_hour not found in Config. Using default value 12.")
            configured_hour = 12
        else:
            configured_hour = int(analysys_hour_config.value)

        logger.info(f"Current hour: {current_hour}, Configured analysis hour: {configured_hour}")

        return current_hour == configured_hour


async def main():
    """
    Main entry point for the cronjob.
    """
    logger.info("=== Product Status Tracking Cronjob Started ===")

    # Check if we should run the analysis
    if should_run_analysis():
        logger.info("Current hour matches configured analysis hour. Starting product status fetch...")
        await fetch_and_store_product_status()
    else:
        logger.info("Current hour does not match configured analysis hour. Skipping product status fetch.")

    logger.info("=== Product Status Tracking Cronjob Completed ===")


if __name__ == "__main__":
    # Run the main function
    asyncio.run(main())
