"""
Daily price tracking cronjob script.

This script should be run every hour via cron. It will:
1. Check if the current hour matches the configured analysis hour
2. If it matches, fetch prices for all products and store them in the database
"""

import asyncio
import logging
import sys
from datetime import datetime
from dotenv import load_dotenv
from sqlmodel import Session, create_engine, select

from stagehand_utils import get_product_price
from database_models import Config, Product, PriceHist


# Database setup
sqlite_file_name = "database.db"
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


async def fetch_and_store_prices():
    """
    Fetch prices for all products and store them in the database.
    """
    logger.info("Starting price fetch process...")

    with Session(engine) as session:
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
                logger.info(f"Fetching price for product: {product.name} (ID: {product.id})")

                # Fetch the price using stagehand
                price = await get_product_price(product.url)

                # Create a new price history record
                price_hist = PriceHist(
                    product_id=product.id,
                    price=price,
                    timestamp=current_timestamp
                )

                session.add(price_hist)
                session.commit()

                logger.info(f"Successfully stored price {price} for product {product.name}")
                success_count += 1

            except Exception as e:
                logger.error(f"Error processing product {product.name} (ID: {product.id}): {str(e)}")
                error_count += 1
                # Continue with next product even if one fails
                continue

        logger.info(f"Price fetch process completed. Success: {success_count}, Errors: {error_count}")


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
    logger.info("=== Price Tracking Cronjob Started ===")

    # Check if we should run the analysis
    if should_run_analysis():
        logger.info("Current hour matches configured analysis hour. Starting price fetch...")
        await fetch_and_store_prices()
    else:
        logger.info("Current hour does not match configured analysis hour. Skipping price fetch.")

    logger.info("=== Price Tracking Cronjob Completed ===")


if __name__ == "__main__":
    # Load environment variables
    load_dotenv(override=True)

    # Run the main function
    asyncio.run(main())
