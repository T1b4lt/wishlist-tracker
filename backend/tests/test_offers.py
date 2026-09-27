"""Tests for adding, editing, unlinking and deleting offers."""

from sqlmodel import select
from src.models.database_models import Offer, OfferHist, Product
from src.services import store_service
from tests.factories import add_history, make_category, make_offer, make_product


def _product_with_offer(session, currency="EUR"):
    category = make_category(session)
    product = make_product(session, category.id, name="Drum kit")
    url = "https://www.thomann.es/kit.htm"
    store = store_service.get_or_create(session, url, name="Thomann")
    offer = make_offer(
        session, product.id, url=url, currency=currency, store_id=store.id
    )
    return product, offer


def test_add_offer_to_a_product(client, session):
    product, _ = _product_with_offer(session)

    response = client.post(
        f"/products/{product.id}/offers",
        json={"url": "https://www.amazon.es/dp/KIT", "currency": "eur"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["product_id"] == product.id
    assert body["currency"] == "EUR"
    assert body["store_id"] is not None


def test_add_offer_rejects_another_currency(client, session):
    product, _ = _product_with_offer(session, currency="EUR")

    response = client.post(
        f"/products/{product.id}/offers",
        json={"url": "https://www.amazon.com/dp/KIT", "currency": "USD"},
    )

    assert response.status_code == 409


def test_add_offer_rejects_a_duplicate_url(client, session):
    product, offer = _product_with_offer(session)

    response = client.post(
        f"/products/{product.id}/offers",
        json={"url": offer.url, "currency": "EUR"},
    )

    assert response.status_code == 409


def test_add_offer_to_an_unknown_product(client):
    response = client.post(
        "/products/999/offers", json={"url": "https://a.es/x", "currency": "EUR"}
    )

    assert response.status_code == 404


def test_update_offer_url_re_resolves_the_store(client, session):
    product, offer = _product_with_offer(session)
    old_store_id = offer.store_id

    response = client.patch(
        f"/offers/{offer.id}", json={"url": "https://www.amazon.es/dp/KIT"}
    )

    assert response.status_code == 200
    assert response.json()["url"] == "https://www.amazon.es/dp/KIT"
    assert response.json()["store_id"] != old_store_id


def test_update_offer_rejects_a_url_of_a_sibling_offer(client, session):
    product, offer = _product_with_offer(session)
    sibling = make_offer(session, product.id, url="https://www.amazon.es/dp/KIT")

    response = client.patch(f"/offers/{sibling.id}", json={"url": offer.url})

    assert response.status_code == 409


def test_unlink_moves_the_offer_and_its_history_to_a_new_product(client, session):
    product, offer = _product_with_offer(session)
    other = make_offer(session, product.id, url="https://www.amazon.es/dp/KIT")
    add_history(session, other.id, [(600.0, True, 1_000)])

    response = client.post(f"/offers/{other.id}/unlink")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] != product.id
    assert body["name"] == "Drum kit"
    assert [o["id"] for o in body["offers"]] == [other.id]
    session.expire_all()
    assert session.get(Offer, other.id).product_id == body["id"]
    assert len(session.exec(select(OfferHist)).all()) == 1


def test_unlink_the_only_offer_is_rejected(client, session):
    _, offer = _product_with_offer(session)

    assert client.post(f"/offers/{offer.id}/unlink").status_code == 409


def test_delete_offer_deletes_its_history(client, session):
    product, offer = _product_with_offer(session)
    other = make_offer(session, product.id, url="https://www.amazon.es/dp/KIT")
    add_history(session, other.id, [(600.0, True, 1_000)])

    assert client.delete(f"/offers/{other.id}").status_code == 200

    session.expire_all()
    assert session.get(Offer, other.id) is None
    assert session.exec(select(OfferHist)).all() == []
    assert session.get(Product, product.id) is not None


def test_delete_the_only_offer_is_rejected(client, session):
    _, offer = _product_with_offer(session)

    assert client.delete(f"/offers/{offer.id}").status_code == 409


def test_unknown_offer_is_404(client):
    assert (
        client.patch("/offers/999", json={"url": "https://a.es/x"}).status_code == 404
    )
    assert client.post("/offers/999/unlink").status_code == 404
    assert client.delete("/offers/999").status_code == 404


def test_update_offer_url_on_the_same_domain_keeps_the_store(client, session):
    _, offer = _product_with_offer(session)
    store_id = offer.store_id

    response = client.patch(
        f"/offers/{offer.id}", json={"url": "https://www.thomann.es/other.htm"}
    )

    assert response.json()["store_id"] == store_id


def test_update_offer_with_invalid_url_returns_422_and_keeps_the_offer(client, session):
    _, offer = _product_with_offer(session)
    offer_id, url = offer.id, offer.url

    response = client.patch(f"/offers/{offer_id}", json={"url": "nonsense"})

    assert response.status_code == 422
    session.expire_all()
    assert session.get(Offer, offer_id).url == url
