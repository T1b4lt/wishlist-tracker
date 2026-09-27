"""
Alembic migration environment for the SQLite database.

The target schema is ``SQLModel.metadata``, filled by importing the models.
The database to migrate is resolved in this order:

1. A connection passed in ``config.attributes["connection"]``, used by
   ``src.core.migrations`` (the setup script, the container entrypoint and
   the tests) to migrate a given database file.
2. ``-x db_url=...`` on the command line, e.g. to autogenerate a migration
   against a scratch database.
3. The application database, ``src.core.database.SQLITE_URL``.

Migrations run with ``render_as_batch=True``: SQLite can barely alter tables,
so Alembic recreates a table (copying its rows) to change its columns or
constraints. Foreign keys must stay off while that happens, otherwise
dropping the old table would cascade-delete the rows that reference it. The
engines created here never enable them (only the application engine does).
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine
from sqlmodel import SQLModel
from src.core.database import SQLITE_URL
from src.models import database_models  # noqa: F401  (registers the tables)

config = context.config

target_metadata = SQLModel.metadata


def _database_url() -> str:
    """Return the ``-x db_url=...`` argument, or the application database URL."""
    return context.get_x_argument(as_dictionary=True).get("db_url", SQLITE_URL)


def _configure(**kwargs) -> None:
    """Configure the migration context with the options shared by both modes."""
    context.configure(
        target_metadata=target_metadata,
        render_as_batch=True,
        compare_type=True,
        **kwargs,
    )


def run_migrations_offline() -> None:
    """Emit the migration SQL to stdout (``alembic upgrade --sql``)."""
    _configure(url=_database_url(), literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run the migrations against a live database connection."""
    connection = config.attributes.get("connection")
    if connection is not None:
        _configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
        return

    # Command-line run: set up logging from alembic.ini.
    if config.config_file_name is not None:
        fileConfig(config.config_file_name)

    engine = create_engine(_database_url())
    with engine.begin() as connection:
        _configure(connection=connection)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
