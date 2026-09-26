"""
Script to set up the backend database and optionally populate it with test data.

Usage (from backend/ directory):
    python -m src.setup_backend              # Create database and tables only
    python -m src.setup_backend --populate   # Create database, tables, and add test data
    python -m src.setup_backend -p           # Short form
"""

import argparse
import os
import random
import sys
from datetime import datetime, timedelta

from sqlmodel import Session, SQLModel, create_engine, select
from src.core.config import CONFIG_DEFAULTS
from src.models.database_models import Category, Config, Product, ProductHist, Store


def check_database_exists(db_path: str) -> bool:
    """Check if the database file already exists.

    Args:
        db_path (str): Path to the database file.

    Returns:
        bool: True if the database file exists, False otherwise.
    """
    return os.path.exists(db_path)


def create_database_and_tables(db_path: str, sqlite_url: str):
    """Create the database file and all tables.

    Args:
        db_path (str): Path to the database file.
        sqlite_url (str): SQLite database URL.

    Returns:
        engine: The SQLModel engine connected to the database.
    """
    print(f"Creating database at: {db_path}")

    # Ensure the db directory exists
    db_dir = os.path.dirname(db_path)
    os.makedirs(db_dir, exist_ok=True)

    # Create engine and tables
    connect_args = {"check_same_thread": False}
    engine = create_engine(sqlite_url, connect_args=connect_args)

    print("Creating tables...")
    SQLModel.metadata.create_all(engine)
    print("✓ Tables created successfully")

    return engine


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

        # Create product
        print("Creating product...")
        producto = Product(
            name="Millenium MPS-850 E-Drum Set Bundle",
            url="https://www.thomann.es/millenium_mps_850_e_drum_set_bundle.htm",
            category_id=electronica.id,
            priority="high",
            description="Set de batería electrónica Millenium MPS-850 con todo lo necesario para empezar a tocar.",
            currency="EUR",
            store_id=thomann.id,
        )

        session.add(producto)
        session.commit()
        session.refresh(producto)

        print(f"  ✓ Created product: {producto.name} (ID: {producto.id})")
        print(f"    Category: {electronica.name}")
        print(f"    Priority: {producto.priority}")

        # Same product in a second store, with its own prices
        producto_amazon = Product(
            name="Millenium MPS-850 E-Drum Set Bundle",
            url="https://www.amazon.es/dp/B07MPS850",
            category_id=electronica.id,
            priority="high",
            description="Set de batería electrónica Millenium MPS-850 con todo lo necesario para empezar a tocar.",
            currency="EUR",
            store_id=amazon.id,
        )
        session.add(producto_amazon)
        session.commit()
        session.refresh(producto_amazon)
        print(
            f"  ✓ Created product: {producto_amazon.name} (ID: {producto_amazon.id}, store: {amazon.name})"
        )

        # Create 60 days of price history for each product
        print("Creating price history (60 days)...")
        current_date = datetime.now()

        for product, base_price in ((producto, 599.99), (producto_amazon, 629.99)):
            for days_ago in range(59, -1, -1):  # From 59 days ago to today
                record_date = current_date - timedelta(days=days_ago)
                timestamp = int(record_date.timestamp())

                # Realistic price fluctuation
                price_variation = random.uniform(-50, 30)
                price = round(base_price + price_variation, 2)

                # 80% chance of being in stock
                is_in_stock = random.random() < 0.8

                price_hist = ProductHist(
                    product_id=product.id,
                    price=price,
                    is_in_stock=is_in_stock,
                    timestamp=timestamp,
                )
                session.add(price_hist)

        session.commit()
        print("  ✓ Created 60 price history records per product")

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

    # Check if database already exists
    if check_database_exists(db_path):
        print(f"⚠ Database already exists at: {db_path}")
        print(
            "If you want to recreate it, please delete the existing database file first."
        )
        sys.exit(0)

    try:
        # Create database and tables
        engine = create_database_and_tables(db_path, sqlite_url)

        # Initialize configuration
        initialize_config(engine)

        # Populate with test data if requested
        if args.populate:
            populate_test_data(engine)

        print("\n=== Setup completed successfully! ===")
        if not args.populate:
            print("\nTo populate with test data, run:")
            print("  python -m src.setup_backend --populate")
        print("\nYou can now start the API with:")
        print("  uvicorn src.api:app --reload")

    except Exception as e:
        print(f"\n✗ Error during setup: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
