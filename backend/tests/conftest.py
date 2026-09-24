"""
Shared pytest fixtures for the backend test suite.

Tests run against an isolated in-memory SQLite database so they never touch
``backend/db/database.db`` (the real user data). The FastAPI app is built
without running its lifespan, since the lifespan checks for that database
file on disk and would abort the process if it is missing.
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import event
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool
from src.api import app
from src.core.database import get_session


@pytest.fixture(name="session")
def session_fixture():
    """Yield a Session bound to a fresh in-memory SQLite engine.

    Yields:
        Session: A session with all tables created and foreign key
            enforcement enabled, backed by a single shared in-memory
            connection (via ``StaticPool``) so it persists for the test.
    """
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    SQLModel.metadata.create_all(engine)

    with Session(engine) as session:
        yield session


@pytest.fixture(name="client")
def client_fixture(session):
    """Yield a TestClient with ``get_session`` overridden.

    The client is built without entering it as a context manager, so the
    app's lifespan (which requires ``db/database.db`` to exist) never runs.

    Args:
        session (Session): The in-memory session fixture to inject.

    Yields:
        TestClient: A FastAPI test client wired to the in-memory database.
    """

    def get_session_override():
        return session

    app.dependency_overrides[get_session] = get_session_override

    yield TestClient(app)

    app.dependency_overrides.clear()
