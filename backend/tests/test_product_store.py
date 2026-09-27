"""Tests for linking offers to stores and exposing store fields."""

from sqlmodel import select
from src.models.database_models import Category, Offer, Product, Store
from src.services import store_service


def _category(session):
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def _payload(category_id, url="https://www.amazon.es/dp/1", **offer_overrides):
    return {
        "name": "Widget",
        "priority": "medium",
        "category_id": category_id,
        "description": "A widget",
        "offer": {"url": url, "currency": "EUR", **offer_overrides},
    }


def _store_id(response):
    return response.json()["offers"][0]["store_id"]


# --- create ---


def test_create_uses_matching_store_id(client, session):
    category = _category(session)
    store = store_service.get_or_create(session, "https://amazon.es", name="Amazon")

    response = client.post("/products/", json=_payload(category.id, store_id=store.id))

    assert response.status_code == 200
    assert _store_id(response) == store.id


def test_create_without_store_id_resolves_store_from_url(client, session):
    category = _category(session)

    response = client.post("/products/", json=_payload(category.id))

    store = session.get(Store, _store_id(response))
    assert store.domain == "amazon.es"
    assert store.name == "Amazon"


def test_create_ignores_store_id_of_another_domain(client, session):
    category = _category(session)
    other = store_service.get_or_create(
        session, "https://decathlon.es", name="Decathlon"
    )

    response = client.post("/products/", json=_payload(category.id, store_id=other.id))

    assert _store_id(response) != other.id
    assert session.get(Store, _store_id(response)).domain == "amazon.es"


def test_create_ignores_unknown_store_id(client, session):
    category = _category(session)

    response = client.post("/products/", json=_payload(category.id, store_id=999))

    assert response.status_code == 200
    assert session.get(Store, _store_id(response)).domain == "amazon.es"


def test_create_with_invalid_url_returns_422(client, session):
    category = _category(session)

    response = client.post(
        "/products/", json=_payload(category.id, url="amazon.es/dp/1")
    )

    assert response.status_code == 422
    assert session.exec(select(Product)).all() == []


# --- dashboard summary / detail ---


def test_summary_and_detail_include_store_fields(client, session):
    category = _category(session)
    store = store_service.get_or_create(
        session,
        "https://amazon.es",
        name="Amazon",
        favicon=b"x",
        favicon_mime="image/png",
    )
    product = client.post(
        "/products/", json=_payload(category.id, store_id=store.id)
    ).json()

    summary = client.get("/products/dashboard-summary").json()[0]
    detail = client.get(f"/products/{product['id']}").json()

    for data in (summary["offers"][0], detail["offers"][0]):
        assert data["store_id"] == store.id
        assert data["store_name"] == "Amazon"
        assert data["store_domain"] == "amazon.es"
        assert data["store_has_favicon"] is True


def test_summary_store_fields_empty_for_product_without_store(client, session):
    category = _category(session)
    product = Product(
        name="Legacy", priority="low", category_id=category.id, description=""
    )
    session.add(product)
    session.commit()
    session.add(Offer(product_id=product.id, url="https://example.com", currency="EUR"))
    session.commit()

    data = client.get("/products/dashboard-summary").json()[0]["offers"][0]

    assert data["store_id"] is None
    assert data["store_name"] is None
    assert data["store_domain"] is None
    assert data["store_has_favicon"] is False
