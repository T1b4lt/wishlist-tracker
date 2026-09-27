"""
Script to create or upgrade the backend database, optionally with test data.

Creates the database if it is missing, or applies the pending schema
migrations (backing it up first) if it exists, then adds any missing default
configuration. The container entrypoint runs it on every start.

Usage (from backend/ directory):
    python -m src.setup_backend              # Create or upgrade the database
    python -m src.setup_backend --populate   # Also add test data (new database only)
    python -m src.setup_backend -p           # Short form
"""

import argparse
import random
import sys
from datetime import datetime, timedelta

from sqlmodel import Session, create_engine, select
from src.core.config import CONFIG_DEFAULTS
from src.core.migrations import migrate_database
from src.models.database_models import (
    Category,
    Config,
    Offer,
    OfferHist,
    Product,
    Store,
)


def initialize_config(engine):
    """Initialize default configuration values.

    Uses CONFIG_DEFAULTS from core.config as the single source of truth
    for default values.

    Args:
        engine: The SQLModel engine connected to the database.
    """
    print("Initializing configuration...")

    with Session(engine) as session:
        for key, default_value in CONFIG_DEFAULTS.items():
            existing_config = session.exec(
                select(Config).where(Config.key == key)
            ).first()
            if not existing_config:
                config = Config(key=key, value=default_value)
                session.add(config)
                display_value = default_value if default_value else "NULL"
                print(f"  ✓ Set {key} = {display_value}")

        session.commit()

    print("✓ Configuration initialized")


def populate_test_data(engine):
    """Populate the database with test data.

    Args:
        engine: The SQLModel engine connected to the database.
    """
    print("\nPopulating database with test data...")

    with Session(engine) as session:
        # Create categories
        print("Creating categories...")
        hogar = Category(name="Hogar", color="#FF5733")
        electronica = Category(name="Electrónica", color="#33FF57")

        session.add(hogar)
        session.add(electronica)
        session.commit()
        session.refresh(hogar)
        session.refresh(electronica)

        print(f"  ✓ Created category: {hogar.name} (ID: {hogar.id})")
        print(f"  ✓ Created category: {electronica.name} (ID: {electronica.id})")

        # Create stores (no favicons: they are fetched on real extractions)
        print("Creating stores...")
        thomann = Store(domain="thomann.es", name="Thomann")
        amazon = Store(domain="amazon.es", name="Amazon")
        session.add(thomann)
        session.add(amazon)
        session.commit()
        session.refresh(thomann)
        session.refresh(amazon)
        print(f"  ✓ Created stores: {thomann.name}, {amazon.name}")

        # Create product, tracked in two stores
        print("Creating product...")
        producto = Product(
            name="Millenium MPS-850 E-Drum Set Bundle",
            category_id=electronica.id,
            priority="high",
            description="Set de batería electrónica Millenium MPS-850 con todo lo necesario para empezar a tocar.",
        )
        session.add(producto)
        session.commit()
        session.refresh(producto)

        offer_thomann = Offer(
            product_id=producto.id,
            url="https://www.thomann.es/millenium_mps_850_e_drum_set_bundle.htm",
            store_id=thomann.id,
            currency="EUR",
        )
        offer_amazon = Offer(
            product_id=producto.id,
            url="https://www.amazon.es/dp/B07MPS850",
            store_id=amazon.id,
            currency="EUR",
        )
        session.add(offer_thomann)
        session.add(offer_amazon)
        session.commit()
        session.refresh(offer_thomann)
        session.refresh(offer_amazon)
        print(f"  ✓ Created product: {producto.name} (ID: {producto.id})")
        print(f"    Category: {electronica.name}")
        print(f"    Priority: {producto.priority}")
        print(f"    Stores: {thomann.name}, {amazon.name}")

        # Create 60 days of price history for each store
        print("Creating price history (60 days)...")
        current_date = datetime.now()

        for offer, base_price in ((offer_thomann, 599.99), (offer_amazon, 629.99)):
            for days_ago in range(59, -1, -1):  # From 59 days ago to today
                record_date = current_date - timedelta(days=days_ago)
                timestamp = int(record_date.timestamp())

                # Realistic price fluctuation
                price_variation = random.uniform(-50, 30)
                price = round(base_price + price_variation, 2)

                # 80% chance of being in stock
                is_in_stock = random.random() < 0.8

                price_hist = OfferHist(
                    offer_id=offer.id,
                    price=price,
                    is_in_stock=is_in_stock,
                    timestamp=timestamp,
                )
                session.add(price_hist)

        session.commit()
        print("  ✓ Created 60 price history records per store")

    print("✓ Test data populated successfully")


def main():
    """Main entry point for the setup script."""
    parser = argparse.ArgumentParser(
        description="Set up the backend database and optionally populate it with test data."
    )
    parser.add_argument(
        "-p",
        "--populate",
        action="store_true",
        help="Populate the database with test data after creation",
    )

    args = parser.parse_args()

    # Database configuration
    db_path = "db/database.db"
    sqlite_url = f"sqlite:///{db_path}"

    print("=== Backend Database Setup ===\n")

    try:
        created = migrate_database(db_path)

        engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})
        # Idempotent: also adds the config keys introduced by newer versions
        initialize_config(engine)

        if args.populate:
            if created:
                populate_test_data(engine)
            else:
                print("\n⚠ Test data not added: the database already existed.")
                print("To start over with test data, run: just db-reset --populate")

        print("\n=== Setup completed successfully! ===")
        if created and not args.populate:
            print("\nTo populate with test data, run:")
            print("  python -m src.setup_backend --populate")
        print("\nYou can now start the API with:")
        print("  uvicorn src.api:app --reload")

    except Exception as e:
        print(f"\n✗ Error during setup: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
