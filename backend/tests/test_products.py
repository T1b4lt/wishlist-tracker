"""Tests for the dashboard summary and product detail responses.

Covers the day-based window (``recent_prices``, ``price_change_pct``,
``is_at_lowest``), ``last_checked_at``, the absence of ``min_price``, the
dashboard's constant query count, and partial product updates.
"""

import time

import pytest
from sqlalchemy import event
from sqlmodel import select
from src.models.database_models import Config, Offer, OfferHist, Store
from src.services import offer_service, product_service
from tests.factories import add_history, make_category, make_offer, make_product

DAY = 60 * 60 * 24


def _make_product(session, category_id, name="Widget", currency="USD"):
    """Create a product with a single offer (the common case in these tests)."""
    product = make_product(session, category_id, name=name)
    make_offer(session, product.id, currency=currency)
    return product


def _add_history(session, product_id, entries):
    """Insert history for the only offer of ``product_id``."""
    (offer,) = offer_service.offers_of(session, product_id)
    add_history(session, offer.id, entries)


def _set_hist_window_size(session, value):
    session.add(Config(key="hist_window_size", value=str(value)))
    session.commit()


# --- Dashboard summary: recent_prices / last_checked_at ---


def test_dashboard_summary_empty_history_has_empty_recent_prices_and_no_last_checked(
    client, session
):
    category = make_category(session)
    _make_product(session, category.id)

    response = client.get("/products/dashboard-summary")

    assert response.status_code == 200
    data = response.json()[0]
    assert data["recent_prices"] == []
    assert data["offers"][0]["last_checked_at"] is None
    assert data["price_change_pct"] is None
    assert data["is_at_lowest"] is False


def test_dashboard_summary_includes_the_offer_url(client, session):
    category = make_category(session)
    _make_product(session, category.id)

    response = client.get("/products/dashboard-summary")
    data = response.json()[0]

    assert data["offers"][0]["url"] == "https://example.com/widget"


def test_dashboard_summary_recent_prices_follow_the_day_window(client, session):
    now = int(time.time())
    category = make_category(session)
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
    category = make_category(session)
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
    category = make_category(session)
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
    category = make_category(session)
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
    category = make_category(session)
    product = _make_product(session, category.id)
    old_timestamp = now - 100 * DAY
    _add_history(session, product.id, [(50.0, True, old_timestamp)])
    _set_hist_window_size(session, 60)

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["current_price"] == 50.0
    assert data["is_in_stock"] is True
    assert data["offers"][0]["last_checked_at"] == old_timestamp
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
        category = make_category(session, name=f"Category {index}")
        store = Store(domain=f"store{index}.com", name=f"Store {index}")
        session.add(store)
        session.commit()
        product = _make_product(session, category.id, name=f"Product {index}")
        (offer,) = offer_service.offers_of(session, product.id)
        offer.store_id = store.id
        session.add(offer)
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
    category = make_category(session)
    product = _make_product(session, category.id)

    response = client.get(f"/products/{product.id}")

    assert response.status_code == 200
    assert response.json()["offers"][0]["last_checked_at"] is None


def test_product_detail_last_checked_at_is_newest_history_timestamp(client, session):
    category = make_category(session)
    product = _make_product(session, category.id)
    _add_history(session, product.id, [(10.0, True, 100), (20.0, True, 200)])

    response = client.get(f"/products/{product.id}")

    assert response.status_code == 200
    assert response.json()["offers"][0]["last_checked_at"] == 200


def test_product_detail_has_no_min_price(client, session):
    category = make_category(session)
    product = _make_product(session, category.id)
    _add_history(session, product.id, [(10.0, True, 100)])

    data = client.get(f"/products/{product.id}").json()

    assert "min_price" not in data
    assert data["offers"][0]["price_history"] == [
        {"price": 10.0, "is_in_stock": True, "timestamp": 100}
    ]


# --- Update: description ---


def test_update_product_description(client, session):
    category = make_category(session)
    product = _make_product(session, category.id)

    response = client.patch(
        f"/products/{product.id}", json={"description": "Updated description"}
    )

    assert response.status_code == 200
    assert response.json()["description"] == "Updated description"


# --- Offers: dashboard summary and detail ---

NOW = 10_000_000


def test_dashboard_counts_a_product_with_two_offers_once_at_its_best_price(
    client, session
):
    category = make_category(session)
    product = make_product(session, category.id)
    amazon = make_offer(session, product.id, url="https://amazon.es/w")
    thomann = make_offer(session, product.id, url="https://thomann.es/w")
    add_history(session, amazon.id, [(700.0, True, NOW - DAY), (689.0, True, NOW)])
    add_history(session, thomann.id, [(690.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.best_offer_id == amazon.id
    assert summary.current_price == 689.0
    assert summary.recent_prices == [700.0, 689.0]
    assert [offer.id for offer in summary.offers] == [amazon.id, thomann.id]
    assert summary.offers[1].current_price == 690.0


def test_best_offer_follows_the_prices(session):
    category = make_category(session)
    product = make_product(session, category.id)
    first = make_offer(session, product.id, url="https://a.es/w")
    second = make_offer(session, product.id, url="https://b.es/w")
    add_history(session, first.id, [(100.0, True, NOW - DAY)])
    add_history(session, second.id, [(120.0, True, NOW - DAY), (90.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.best_offer_id == second.id
    assert summary.recent_prices == [120.0, 90.0]


def test_dashboard_product_is_in_stock_if_any_offer_is(session):
    category = make_category(session)
    product = make_product(session, category.id)
    out = make_offer(session, product.id, url="https://a.es/w")
    in_stock = make_offer(session, product.id, url="https://b.es/w")
    add_history(session, out.id, [(80.0, False, NOW)])
    add_history(session, in_stock.id, [(95.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.is_in_stock is True
    assert summary.best_offer_id == in_stock.id


def test_new_offer_without_history_is_listed_but_not_best(session):
    category = make_category(session)
    product = make_product(session, category.id)
    checked = make_offer(session, product.id, url="https://a.es/w")
    new = make_offer(session, product.id, url="https://b.es/w")
    add_history(session, checked.id, [(100.0, True, NOW)])

    (summary,) = product_service.get_dashboard_summary(session, now=NOW)

    assert summary.best_offer_id == checked.id
    new_summary = next(offer for offer in summary.offers if offer.id == new.id)
    assert new_summary.current_price is None
    assert new_summary.last_checked_at is None


def test_detail_lists_every_offer_with_its_history(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    first = make_offer(session, product.id, url="https://a.es/w", currency="EUR")
    second = make_offer(session, product.id, url="https://b.es/w", currency="EUR")
    add_history(session, first.id, [(100.0, True, NOW - DAY), (90.0, True, NOW)])
    add_history(session, second.id, [(95.0, False, NOW)])

    body = client.get(f"/products/{product.id}").json()

    assert body["currency"] == "EUR"
    assert [offer["id"] for offer in body["offers"]] == [first.id, second.id]
    assert [r["price"] for r in body["offers"][0]["price_history"]] == [100.0, 90.0]
    assert body["offers"][1]["is_in_stock"] is False


def test_create_product_creates_its_first_offer(client, session):
    category = make_category(session)

    response = client.post(
        "/products/",
        json={
            "name": "Drum kit",
            "priority": "high",
            "category_id": category.id,
            "description": "",
            "offer": {"url": "https://www.thomann.es/kit.htm", "currency": "eur"},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Drum kit"
    (offer,) = body["offers"]
    assert offer["url"] == "https://www.thomann.es/kit.htm"
    assert offer["currency"] == "EUR"
    assert offer["store_id"] is not None


def test_update_changes_only_shared_fields(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    make_offer(session, product.id)

    response = client.patch(f"/products/{product.id}", json={"name": "Renamed"})

    assert response.status_code == 200
    assert response.json()["name"] == "Renamed"
    assert response.json()["offers"][0]["url"] == "https://example.com/widget"


def test_delete_product_deletes_offers_and_history(client, session):
    category = make_category(session)
    product = make_product(session, category.id)
    offer_id = make_offer(session, product.id).id
    add_history(session, offer_id, [(1.0, True, NOW)])

    assert client.delete(f"/products/{product.id}").status_code == 200

    session.expire_all()
    assert session.get(Offer, offer_id) is None
    assert session.exec(select(OfferHist)).all() == []
