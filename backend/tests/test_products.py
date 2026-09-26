"""Tests for the dashboard summary and product detail responses.

Covers the day-based window (``recent_prices``, ``price_change_pct``,
``is_at_lowest``), ``last_checked_at``, the absence of ``min_price``, the
dashboard's constant query count, and partial product updates.
"""

import time

import pytest
from sqlalchemy import event
from src.models.database_models import (
    Category,
    Config,
    Product,
    ProductHist,
    Store,
)
from src.services import product_service

DAY = 60 * 60 * 24


def _make_category(session, name="Electronics", color="#FF0000"):
    category = Category(name=name, color=color)
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def _make_product(session, category_id, name="Widget", currency="USD"):
    product = Product(
        name=name,
        url="https://example.com/widget",
        priority="medium",
        category_id=category_id,
        description="A widget",
        currency=currency,
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    return product


def _add_history(session, product_id, entries):
    """Insert ProductHist rows.

    Args:
        entries: iterable of (price, is_in_stock, timestamp) tuples.
    """
    for price, is_in_stock, timestamp in entries:
        session.add(
            ProductHist(
                product_id=product_id,
                price=price,
                is_in_stock=is_in_stock,
                timestamp=timestamp,
            )
        )
    session.commit()


def _set_hist_window_size(session, value):
    session.add(Config(key="hist_window_size", value=str(value)))
    session.commit()


# --- Dashboard summary: recent_prices / last_checked_at ---


def test_dashboard_summary_empty_history_has_empty_recent_prices_and_no_last_checked(
    client, session
):
    category = _make_category(session)
    _make_product(session, category.id)

    response = client.get("/products/dashboard-summary")

    assert response.status_code == 200
    data = response.json()[0]
    assert data["recent_prices"] == []
    assert data["last_checked_at"] is None
    assert data["price_change_pct"] is None
    assert data["is_at_lowest"] is False


def test_dashboard_summary_includes_product_url(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)

    response = client.get("/products/dashboard-summary")
    data = response.json()[0]

    assert data["url"] == product.url


def test_dashboard_summary_recent_prices_follow_the_day_window(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [
            (1.0, True, now - 40 * DAY),  # Outside the 30-day window
            (2.0, True, now - 20 * DAY),
            (3.0, False, now - 10 * DAY),  # Out of stock: still drawn
            (4.0, True, now - DAY),
        ],
    )
    _set_hist_window_size(session, 30)

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["recent_prices"] == [2.0, 3.0, 4.0]


def test_dashboard_summary_recent_prices_are_not_capped(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [(float(day), True, now - day * DAY) for day in range(100)],
    )
    _set_hist_window_size(session, 180)

    data = client.get("/products/dashboard-summary").json()[0]

    assert len(data["recent_prices"]) == 100


def test_dashboard_summary_price_change_and_at_lowest(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [
            (100.0, True, now - 3 * DAY),
            (100.0, True, now - 2 * DAY),
            (90.0, True, now - DAY),
        ],
    )

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["price_change_pct"] == pytest.approx(-10.0)
    assert data["is_at_lowest"] is True
    assert data["current_price"] == 90.0


def test_dashboard_summary_current_out_of_stock(client, session):
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(
        session,
        product.id,
        [(100.0, True, now - 2 * DAY), (80.0, False, now - DAY)],
    )

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["current_price"] == 80.0
    assert data["is_in_stock"] is False
    assert data["price_change_pct"] is None
    assert data["is_at_lowest"] is False


def test_dashboard_summary_history_older_than_the_window(client, session):
    # Review focus: the cron stopped weeks ago.
    now = int(time.time())
    category = _make_category(session)
    product = _make_product(session, category.id)
    old_timestamp = now - 100 * DAY
    _add_history(session, product.id, [(50.0, True, old_timestamp)])
    _set_hist_window_size(session, 60)

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["current_price"] == 50.0
    assert data["is_in_stock"] is True
    assert data["last_checked_at"] == old_timestamp
    assert data["recent_prices"] == []
    assert data["price_change_pct"] is None
    assert data["is_at_lowest"] is False


def _count_queries(session, action):
    """Run ``action`` and return how many SQL statements it executed."""
    engine = session.get_bind()
    statements = []

    def _record(conn, cursor, statement, parameters, context, executemany):
        statements.append(statement)

    event.listen(engine, "before_cursor_execute", _record)
    try:
        action()
    finally:
        event.remove(engine, "before_cursor_execute", _record)
    return len(statements)


def _seed_products(session, count, start=0):
    now = int(time.time())
    for index in range(start, start + count):
        category = _make_category(session, name=f"Category {index}")
        store = Store(domain=f"store{index}.com", name=f"Store {index}")
        session.add(store)
        session.commit()
        product = _make_product(session, category.id, name=f"Product {index}")
        product.store_id = store.id
        session.add(product)
        session.commit()
        _add_history(
            session,
            product.id,
            [(10.0, True, now - 2 * DAY), (9.0, True, now - DAY)],
        )
    session.expire_all()


def test_dashboard_summary_query_count_does_not_grow_with_products(session):
    _seed_products(session, 1)
    one_product = _count_queries(
        session, lambda: product_service.get_dashboard_summary(session)
    )

    _seed_products(session, 4, start=1)
    five_products = _count_queries(
        session, lambda: product_service.get_dashboard_summary(session)
    )

    assert five_products == one_product


# --- Detail: last_checked_at ---


def test_product_detail_last_checked_at_none_when_no_history(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)

    response = client.get(f"/products/{product.id}")

    assert response.status_code == 200
    assert response.json()["last_checked_at"] is None


def test_product_detail_last_checked_at_is_newest_history_timestamp(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(session, product.id, [(10.0, True, 100), (20.0, True, 200)])

    response = client.get(f"/products/{product.id}")

    assert response.status_code == 200
    assert response.json()["last_checked_at"] == 200


def test_product_detail_has_no_min_price(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)
    _add_history(session, product.id, [(10.0, True, 100)])

    data = client.get(f"/products/{product.id}").json()

    assert "min_price" not in data
    assert data["price_history"] == [
        {"price": 10.0, "is_in_stock": True, "timestamp": 100}
    ]


# --- Update: description ---


def test_update_product_description(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)

    response = client.patch(
        f"/products/{product.id}", json={"description": "Updated description"}
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated description"
