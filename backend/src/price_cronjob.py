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

from stagehand_utils import get_product_status
from database_models import Config, Product, ProductHist


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


async def fetch_and_store_product_status():
    """
    Fetch product status for all products and store them in the database.
    """
    logger.info("Starting product status fetch process...")

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
                logger.info(f"Fetching product status for product: {product.name} (ID: {product.id})")

                # Fetch the product status using stagehand
                product_status = await get_product_status(product.url)

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
    # Load environment variables
    load_dotenv(override=True)

    # Run the main function
    asyncio.run(main())
