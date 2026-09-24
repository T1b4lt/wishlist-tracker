"""Tests for dashboard summary / detail enrichment added in Task 8:

``recent_prices`` and ``last_checked_at`` on the dashboard summary,
``last_checked_at`` on the detail response, and the ``description``
field on partial product updates.
"""

from src.models.database_models import Category, Config, Product, ProductHist


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


def test_dashboard_summary_recent_prices_window_smaller_than_history(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)
    entries = [(10.0 * i, True, 100 * i) for i in range(1, 6)]  # 5 records
    _add_history(session, product.id, entries)
    _set_hist_window_size(session, 3)

    response = client.get("/products/dashboard-summary")
    data = response.json()[0]

    assert data["recent_prices"] == [30.0, 40.0, 50.0]
    assert data["last_checked_at"] == 500


def test_dashboard_summary_recent_prices_window_larger_than_history(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)
    entries = [(float(i), True, i) for i in range(1, 4)]  # 3 records
    _add_history(session, product.id, entries)
    # Default hist_window_size is 60, well above the 3 available records.

    response = client.get("/products/dashboard-summary")
    data = response.json()[0]

    assert data["recent_prices"] == [1.0, 2.0, 3.0]
    assert data["last_checked_at"] == 3


def test_dashboard_summary_includes_product_url(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)

    response = client.get("/products/dashboard-summary")
    data = response.json()[0]

    assert data["url"] == product.url


def test_dashboard_summary_recent_prices_capped_at_60(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)
    entries = [(float(i), True, i) for i in range(1, 66)]  # 65 records
    _add_history(session, product.id, entries)
    _set_hist_window_size(session, 180)  # window bigger than the 60-point cap

    response = client.get("/products/dashboard-summary")
    data = response.json()[0]

    assert len(data["recent_prices"]) == 60
    assert data["recent_prices"][0] == 6.0
    assert data["recent_prices"][-1] == 65.0
    assert data["last_checked_at"] == 65


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


# --- Update: description ---


def test_update_product_description(client, session):
    category = _make_category(session)
    product = _make_product(session, category.id)

    response = client.patch(
        f"/products/{product.id}", json={"description": "Updated description"}
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated description"
