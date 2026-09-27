"""Tests for merging two products into one."""

from sqlmodel import select
from src.models.database_models import Offer, OfferHist, Product
from tests.factories import add_history, make_category, make_offer, make_product


def _two_products(session, source_currency="EUR"):
    category = make_category(session)
    other_category = make_category(session, name="Music", color="#00FF00")
    target = make_product(session, category.id, name="Drum kit", priority="high")
    source = make_product(session, other_category.id, name="E-drums", priority="low")
    target_offer = make_offer(
        session, target.id, url="https://www.thomann.es/kit.htm", currency="EUR"
    )
    source_offer = make_offer(
        session, source.id, url="https://www.amazon.es/dp/KIT", currency=source_currency
    )
    add_history(session, source_offer.id, [(600.0, True, 1_000)])
    return target, source, target_offer, source_offer


def test_merge_moves_offers_keeps_target_fields_and_deletes_source(client, session):
    target, source, target_offer, source_offer = _two_products(session)

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": source.id}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Drum kit"
    assert body["priority"] == "high"
    assert [o["id"] for o in body["offers"]] == [target_offer.id, source_offer.id]
    assert [r["price"] for r in body["offers"][1]["price_history"]] == [600.0]
    session.expire_all()
    assert session.get(Product, source.id) is None
    assert session.get(Offer, source_offer.id).product_id == target.id
    assert len(session.exec(select(OfferHist)).all()) == 1


def test_merge_can_keep_the_source_fields(client, session):
    target, source, _, _ = _two_products(session)

    body = client.post(
        f"/products/{target.id}/merge",
        json={"source_product_id": source.id, "keep": "source"},
    ).json()

    assert body["id"] == target.id
    assert body["name"] == "E-drums"
    assert body["priority"] == "low"
    assert body["category_name"] == "Music"


def test_merge_with_itself_is_400(client, session):
    target, _, _, _ = _two_products(session)

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": target.id}
    )

    assert response.status_code == 400


def test_merge_unknown_product_is_404(client, session):
    target, _, _, _ = _two_products(session)

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": 999}
    )

    assert response.status_code == 404


def test_merge_across_currencies_is_409(client, session):
    target, source, _, _ = _two_products(session, source_currency="USD")

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": source.id}
    )

    assert response.status_code == 409
    session.expire_all()
    assert session.get(Product, source.id) is not None


def test_merge_with_a_shared_url_is_409(client, session):
    target, source, target_offer, source_offer = _two_products(session)
    source_offer.url = target_offer.url
    session.add(source_offer)
    session.commit()

    response = client.post(
        f"/products/{target.id}/merge", json={"source_product_id": source.id}
    )

    assert response.status_code == 409
