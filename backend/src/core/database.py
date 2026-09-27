"""
Database engine, session management, and SQLite configuration.

This module is the single source of truth for all database access.
Both the API and the cronjob import from here to avoid duplicating
the engine creation and SQLite pragma setup.
"""

import os
import sys
from contextlib import asynccontextmanager
from typing import Annotated

from fastapi import Depends
from sqlalchemy import event
from sqlmodel import Session, create_engine
from src.core.migrations import is_up_to_date

# --- Database path and engine ---

SQLITE_FILE_NAME = "db/database.db"
SQLITE_URL = f"sqlite:///{SQLITE_FILE_NAME}"
CONNECT_ARGS = {"check_same_thread": False}

engine = create_engine(SQLITE_URL, connect_args=CONNECT_ARGS)


# --- SQLite foreign key enforcement ---
# SQLite does not enforce foreign keys by default.
# This listener enables CASCADE deletes and referential integrity.


@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record):
    """Enable foreign key constraint enforcement on every new connection."""
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


# --- Session dependency for FastAPI ---


def get_session():
    """Yield a SQLModel Session bound to the shared engine.

    Intended for use as a FastAPI dependency.

    Yields:
        Session: An active database session.
    """
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]


# --- Lifespan context manager ---


@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan: verify the database exists and is up to date.

    If the file is missing, or its schema is behind the latest migration,
    the process exits with a helpful message pointing the developer to the
    setup script (which creates or upgrades it).

    Yields:
        None
    """
    if not os.path.exists(SQLITE_FILE_NAME):
        print(f"\n✗ ERROR: Database not found at '{SQLITE_FILE_NAME}'")
        print("\nPlease run the setup script first:")
        print("  python -m src.setup_backend")
        print("\nTo also populate with test data:")
        print("  python -m src.setup_backend --populate\n")
        sys.exit(1)

    if not is_up_to_date(engine):
        print(f"\n✗ ERROR: Database at '{SQLITE_FILE_NAME}' has pending migrations")
        print("\nPlease upgrade it first (a backup is made automatically):")
        print("  python -m src.setup_backend\n")
        sys.exit(1)

    print(f"✓ Database found at '{SQLITE_FILE_NAME}' (schema up to date)")
    yield
    # Shutdown hook – nothing needed for now.
