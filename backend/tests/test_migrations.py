"""
Tests for the database schema migrations (``src.core.migrations``).

Each test migrates a throwaway SQLite file under ``tmp_path``. The first
test also guards the migration scripts themselves: it fails when a model
changes without a matching migration (``just db-revision``).
"""

import os
import sqlite3

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.runtime.migration import MigrationContext
from sqlalchemy import create_engine
from sqlmodel import Session, SQLModel, select
from src.core import migrations
from src.core.migrations import (
    SchemaMismatchError,
    get_current_revision,
    get_head_revision,
    migrate_database,
)
from src.models.database_models import Category


@pytest.fixture(name="db_path")
def db_path_fixture(tmp_path):
    """Return the path of a database file (not yet created) in a db/ folder."""
    return str(tmp_path / "db" / "database.db")


@pytest.fixture(name="engine")
def engine_fixture(db_path):
    """Yield an engine for ``db_path``, disposed after the test."""
    os.makedirs(os.path.dirname(db_path), exist_ok=True)
    engine = create_engine(f"sqlite:///{db_path}")
    yield engine
    engine.dispose()


def _schema_diffs(engine):
    """Return the differences between the database tables and the models."""
    with engine.connect() as connection:
        context = MigrationContext.configure(connection, opts={"compare_type": True})
        return compare_metadata(context, SQLModel.metadata)


def test_migrations_create_the_schema_of_the_models(db_path, engine):
    """A new database gets exactly the models' schema at the latest revision.

    If this fails after editing ``database_models.py``, generate the
    migration: ``just db-revision "<what changed>"``.
    """
    assert migrate_database(db_path) is True

    assert _schema_diffs(engine) == []
    assert get_current_revision(engine) == get_head_revision()


def test_up_to_date_database_is_left_untouched(db_path):
    """Running it again neither migrates nor backs up the database."""
    migrate_database(db_path)

    assert migrate_database(db_path) is False
    assert not os.path.exists(os.path.join(os.path.dirname(db_path), "backups"))


def test_unversioned_database_matching_the_models_is_adopted(db_path, engine):
    """A database created with ``create_all`` is stamped and keeps its data."""
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        session.add(Category(name="Hogar", color="#FF5733"))
        session.commit()

    assert migrate_database(db_path) is False

    assert get_current_revision(engine) == get_head_revision()
    with Session(engine) as session:
        assert session.exec(select(Category.name)).all() == ["Hogar"]


def test_unversioned_database_with_another_schema_is_rejected(db_path, engine):
    """A database whose tables differ from the models is not stamped."""
    with engine.begin() as connection:
        connection.exec_driver_sql("CREATE TABLE category (id INTEGER PRIMARY KEY)")

    with pytest.raises(SchemaMismatchError):
        migrate_database(db_path)

    assert get_current_revision(engine) is None


def test_outdated_database_is_backed_up_before_upgrading(db_path, engine, monkeypatch):
    """A database behind the latest revision is copied, then upgraded."""
    migrate_database(db_path)
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO category (name, color) VALUES ('A', '#000')"
        )
        connection.exec_driver_sql("UPDATE alembic_version SET version_num = 'old'")
    upgrades = []
    monkeypatch.setattr(
        migrations.command, "upgrade", lambda config, rev: upgrades.append(rev)
    )

    assert migrate_database(db_path) is False

    assert upgrades == ["head"]
    backup_dir = os.path.join(os.path.dirname(db_path), "backups")
    (backup_name,) = os.listdir(backup_dir)
    assert backup_name.startswith("database-old-")
    backup = sqlite3.connect(os.path.join(backup_dir, backup_name))
    try:
        assert backup.execute("SELECT name FROM category").fetchall() == [("A",)]
    finally:
        backup.close()


def test_every_migration_can_be_downgraded_and_reapplied(db_path, engine):
    """The downgrade scripts undo their upgrades cleanly."""
    migrate_database(db_path)
    config = migrations._alembic_config()

    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.downgrade(config, "base")
    assert _table_names(engine) == {"alembic_version"}

    with engine.begin() as connection:
        config.attributes["connection"] = connection
        command.upgrade(config, "head")
    assert _schema_diffs(engine) == []


def _table_names(engine):
    """Return the names of the tables in the database."""
    with engine.connect() as connection:
        rows = connection.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        )
        return {name for (name,) in rows}
