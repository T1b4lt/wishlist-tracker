"""Tests for linking products to stores and exposing store fields."""

from sqlmodel import select
from src.models.database_models import Category, Product, Store
from src.services import store_service


def _category(session):
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    session.refresh(category)
    return category


def _payload(category_id, url="https://www.amazon.es/dp/1", **overrides):
    return {
        "name": "Widget",
        "url": url,
        "priority": "medium",
        "category_id": category_id,
        "description": "A widget",
        "currency": "EUR",
        **overrides,
    }


# --- create ---


def test_create_uses_matching_store_id(client, session):
    category = _category(session)
    store = store_service.get_or_create(session, "https://amazon.es", name="Amazon")

    response = client.post("/products/", json=_payload(category.id, store_id=store.id))

    assert response.status_code == 200
    assert response.json()["store_id"] == store.id


def test_create_without_store_id_resolves_store_from_url(client, session):
    category = _category(session)

    response = client.post("/products/", json=_payload(category.id))

    store = session.get(Store, response.json()["store_id"])
    assert store.domain == "amazon.es"
    assert store.name == "Amazon"


def test_create_ignores_store_id_of_another_domain(client, session):
    category = _category(session)
    other = store_service.get_or_create(
        session, "https://decathlon.es", name="Decathlon"
    )

    response = client.post("/products/", json=_payload(category.id, store_id=other.id))

    assert response.json()["store_id"] != other.id
    assert session.get(Store, response.json()["store_id"]).domain == "amazon.es"


def test_create_ignores_unknown_store_id(client, session):
    category = _category(session)

    response = client.post("/products/", json=_payload(category.id, store_id=999))

    assert response.status_code == 200
    assert session.get(Store, response.json()["store_id"]).domain == "amazon.es"


def test_create_with_invalid_url_returns_422(client, session):
    category = _category(session)

    response = client.post(
        "/products/", json=_payload(category.id, url="amazon.es/dp/1")
    )

    assert response.status_code == 422
    assert session.exec(select(Product)).all() == []


# --- update ---


def _created(client, session):
    category = _category(session)
    return client.post("/products/", json=_payload(category.id)).json()


def test_update_same_domain_keeps_store(client, session):
    product = _created(client, session)

    response = client.patch(
        f"/products/{product['id']}", json={"url": "https://amazon.es/dp/2"}
    )

    assert response.json()["store_id"] == product["store_id"]


def test_update_new_domain_switches_store(client, session):
    product = _created(client, session)

    response = client.patch(
        f"/products/{product['id']}", json={"url": "https://www.decathlon.es/p/9"}
    )

    new_store = session.get(Store, response.json()["store_id"])
    assert new_store.domain == "decathlon.es"
    assert new_store.id != product["store_id"]


def test_update_without_url_keeps_store(client, session):
    product = _created(client, session)

    response = client.patch(f"/products/{product['id']}", json={"name": "Renamed"})

    assert response.json()["store_id"] == product["store_id"]


def test_update_with_invalid_url_returns_422_and_keeps_product(client, session):
    product = _created(client, session)

    response = client.patch(f"/products/{product['id']}", json={"url": "nonsense"})

    assert response.status_code == 422
    stored = session.get(Product, product["id"])
    session.refresh(stored)
    assert stored.url == "https://www.amazon.es/dp/1"
    assert stored.store_id == product["store_id"]


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

    for data in (summary, detail):
        assert data["store_id"] == store.id
        assert data["store_name"] == "Amazon"
        assert data["store_domain"] == "amazon.es"
        assert data["store_has_favicon"] is True


def test_summary_store_fields_empty_for_product_without_store(client, session):
    category = _category(session)
    session.add(
        Product(
            name="Legacy",
            url="https://example.com",
            priority="low",
            category_id=category.id,
            description="",
            currency="EUR",
        )
    )
    session.commit()

    data = client.get("/products/dashboard-summary").json()[0]

    assert data["store_id"] is None
    assert data["store_name"] is None
    assert data["store_domain"] is None
    assert data["store_has_favicon"] is False
