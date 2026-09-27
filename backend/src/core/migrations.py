"""
Database schema migrations (Alembic), applied on startup.

``migrate_database`` brings a database file to the latest schema: it creates
a new database by running every migration from scratch, and upgrades an
existing one after copying it to ``db/backups/``. The setup script calls it,
so the container entrypoint migrates the mounted database before the API and
the cronjob start, and updating the app is just running the new image.

The migration scripts live in ``backend/migrations/versions``; see
``backend/migrations/README.md`` for how to write one.
"""

import os
import sqlite3
from datetime import datetime
from pathlib import Path

from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.config import Config
from alembic.runtime.migration import MigrationContext
from alembic.script import ScriptDirectory
from sqlalchemy import Engine, create_engine, inspect
from sqlmodel import SQLModel
from src.models import database_models  # noqa: F401  (registers the tables)

ALEMBIC_INI = Path(__file__).resolve().parents[2] / "alembic.ini"
BACKUP_DIR_NAME = "backups"


class SchemaMismatchError(RuntimeError):
    """An unversioned database whose tables do not match the models."""


def _alembic_config() -> Config:
    """Return the Alembic configuration of the backend (``alembic.ini``)."""
    return Config(str(ALEMBIC_INI))


def get_head_revision() -> str | None:
    """Return the revision of the latest migration script."""
    return ScriptDirectory.from_config(_alembic_config()).get_current_head()


def get_current_revision(engine: Engine) -> str | None:
    """Return the revision stored in the database, or None if unversioned."""
    with engine.connect() as connection:
        return MigrationContext.configure(connection).get_current_revision()


def is_up_to_date(engine: Engine) -> bool:
    """Return whether the database is at the latest migration."""
    return get_current_revision(engine) == get_head_revision()


def backup_database(db_path: str, label: str) -> str:
    """Copy the database into ``<db dir>/backups/`` and return the copy's path.

    Uses SQLite's online backup API, so the copy is consistent even if
    another process has the database open.

    Args:
        db_path (str): Path to the database file.
        label (str): Text included in the file name (e.g. the revision).

    Returns:
        str: Path to the backup file.
    """
    backup_dir = os.path.join(os.path.dirname(db_path), BACKUP_DIR_NAME)
    os.makedirs(backup_dir, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
    backup_path = os.path.join(backup_dir, f"database-{label}-{stamp}.db")

    source = sqlite3.connect(db_path)
    target = sqlite3.connect(backup_path)
    try:
        source.backup(target)
    finally:
        target.close()
        source.close()
    return backup_path


def _adopt_unversioned_database(engine: Engine, config: Config) -> None:
    """Mark a database created before migrations existed as up to date.

    Such a database (created with ``SQLModel.metadata.create_all``) has the
    tables but no ``alembic_version``. If its schema matches the models it
    is stamped with the latest revision; otherwise it cannot be upgraded
    safely and must be recreated.

    Raises:
        SchemaMismatchError: If the tables differ from the models.
    """
    with engine.begin() as connection:
        diffs = compare_metadata(
            MigrationContext.configure(connection, opts={"compare_type": True}),
            SQLModel.metadata,
        )
        if diffs:
            details = "\n".join(f"  - {diff}" for diff in diffs)
            raise SchemaMismatchError(
                "The database has no migration history and its tables do not "
                f"match the current models:\n{details}\n"
                "Back up and recreate it (just db-reset)."
            )
        config.attributes["connection"] = connection
        command.stamp(config, "head")


def migrate_database(db_path: str) -> bool:
    """Create or upgrade the database at ``db_path`` to the latest schema.

    - Missing (or empty) database: every migration runs from scratch.
    - Database behind the latest migration: it is backed up to
      ``db/backups/`` and then upgraded.
    - Unversioned database from before migrations: stamped as up to date if
      its tables match the models (see ``_adopt_unversioned_database``).
    - Up to date: nothing happens.

    Args:
        db_path (str): Path to the SQLite database file.

    Returns:
        bool: True if the database was created (it had no tables).

    Raises:
        SchemaMismatchError: If an unversioned database does not match the
            models.
    """
    os.makedirs(os.path.dirname(db_path) or ".", exist_ok=True)
    config = _alembic_config()
    head = get_head_revision()
    # A plain engine: foreign keys stay off while migrations recreate tables.
    engine = create_engine(f"sqlite:///{db_path}")

    try:
        created = not inspect(engine).get_table_names()
        current = get_current_revision(engine)

        if not created and current is None:
            print("Database has no migration history, checking its schema...")
            _adopt_unversioned_database(engine, config)
            print(f"✓ Database schema matches, marked as revision {head}")
            return False

        if current == head:
            print(f"✓ Database schema is up to date (revision {head})")
            return False

        if created:
            print("Creating database schema...")
        else:
            backup_path = backup_database(db_path, current)
            print(f"✓ Database backed up to: {backup_path}")
            print(f"Upgrading database schema from {current} to {head}...")

        with engine.begin() as connection:
            config.attributes["connection"] = connection
            command.upgrade(config, "head")
        print(f"✓ Database schema at revision {head}")
        return created
    finally:
        engine.dispose()
