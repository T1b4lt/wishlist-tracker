"""
Script to set up the backend database and optionally populate it with test data.

Usage:
    python src/setup_backend.py              # Create database and tables only
    python src/setup_backend.py --populate   # Create database, tables, and add test data
    python src/setup_backend.py -p           # Short form
"""

import os
import sys
import argparse

from sqlmodel import Session, SQLModel, create_engine, select

from database_models import Config, Category, Product


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
    Args:
        engine: The SQLModel engine connected to the database.
    """
    print("Initializing configuration...")

    config_keys = ["analysys_hour", "hist_window_size", "is_price_drop_alert",
                   "is_stock_change_alert", "telegram_bot_connection_string", "selected_language"]
    default_values = {
        "analysys_hour": "12",
        "hist_window_size": "60",
        "is_price_drop_alert": "false",
        "is_stock_change_alert": "false",
        "telegram_bot_connection_string": "",
        "selected_language": "spanish"
    }

    with Session(engine) as session:
        for key in config_keys:
            existing_config = session.exec(select(Config).where(Config.key == key)).first()
            if not existing_config:
                config = Config(key=key, value=default_values[key])
                session.add(config)
                display_value = default_values[key] if default_values[key] else "NULL"
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

        # Create product
        print("Creating product...")
        producto = Product(
            name="Millenium MPS-850 E-Drum Set Bundle",
            url="https://www.thomann.es/millenium_mps_850_e_drum_set_bundle.htm",
            category_id=electronica.id,
            priority="high",
            description="Set de batería electrónica Millenium MPS-850 con todo lo necesario para empezar a tocar."
        )

        session.add(producto)
        session.commit()
        session.refresh(producto)

        print(f"  ✓ Created product: {producto.name} (ID: {producto.id})")
        print(f"    Category: {electronica.name}")
        print(f"    Priority: {producto.priority}")

    print("✓ Test data populated successfully")


def main():
    parser = argparse.ArgumentParser(
        description="Set up the backend database and optionally populate it with test data."
    )
    parser.add_argument(
        "-p", "--populate",
        action="store_true",
        help="Populate the database with test data after creation"
    )

    args = parser.parse_args()

    # Database configuration
    db_path = "db/database.db"
    sqlite_url = f"sqlite:///{db_path}"

    print("=== Backend Database Setup ===\n")

    # Check if database already exists
    if check_database_exists(db_path):
        print(f"⚠ Database already exists at: {db_path}")
        print("If you want to recreate it, please delete the existing database file first.")
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
            print("  python src/setup_backend.py --populate")
        print("\nYou can now start the API with:")
        print("  uvicorn src.api:app --reload")

    except Exception as e:
        print(f"\n✗ Error during setup: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
