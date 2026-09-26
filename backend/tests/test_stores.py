"""Tests for the store service and the store favicon endpoint."""

import pytest
from fastapi import HTTPException
from sqlmodel import select
from src.models.database_models import Store
from src.services import store_service

# --- normalize_domain ---


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("https://www.amazon.es/dp/B0?ref=1", "amazon.es"),
        ("https://WWW.Amazon.ES:443/dp/x", "amazon.es"),
        ("http://amazon.es./dp/x", "amazon.es"),
        ("https://es.aliexpress.com/item/1.html", "es.aliexpress.com"),
        ("https://www.pccomponentes.com/x", "pccomponentes.com"),
    ],
)
def test_normalize_domain_variants(url, expected):
    assert store_service.normalize_domain(url) == expected


@pytest.mark.parametrize("url", ["", "   ", "amazon.es/dp/x", "not a url"])
def test_normalize_domain_rejects_urls_without_host(url):
    with pytest.raises(HTTPException) as exc_info:
        store_service.normalize_domain(url)
    assert exc_info.value.status_code == 422


# --- derive_name ---


@pytest.mark.parametrize(
    ("domain", "expected"),
    [
        ("pccomponentes.com", "Pccomponentes"),
        ("es.aliexpress.com", "Aliexpress"),
        ("amazon.co.uk", "Amazon"),
        ("localhost", "Localhost"),
    ],
)
def test_derive_name(domain, expected):
    assert store_service.derive_name(domain) == expected


# --- get_or_create ---


def test_get_or_create_creates_store_with_given_name_and_favicon(session):
    store = store_service.get_or_create(
        session,
        "https://www.decathlon.es/p/1",
        name="  Decathlon  ",
        favicon=b"\x89PNG",
        favicon_mime="image/png",
    )

    assert store.id is not None
    assert store.domain == "decathlon.es"
    assert store.name == "Decathlon"
    assert store.favicon == b"\x89PNG"
    assert store.favicon_mime == "image/png"


def test_get_or_create_falls_back_to_derived_name(session):
    store = store_service.get_or_create(
        session, "https://pccomponentes.com/x", name="  "
    )

    assert store.name == "Pccomponentes"
    assert store.favicon is None
    assert store.favicon_mime is None


def test_get_or_create_drops_mime_without_favicon(session):
    store = store_service.get_or_create(
        session, "https://a.com/x", name="A", favicon=None, favicon_mime="image/png"
    )

    assert store.favicon_mime is None


def test_get_or_create_reuses_existing_store_unchanged(session):
    first = store_service.get_or_create(session, "https://amazon.es/a", name="Amazon")
    second = store_service.get_or_create(
        session,
        "https://www.amazon.es/b",
        name="Amazon Spain",
        favicon=b"x",
        favicon_mime="image/png",
    )

    assert second.id == first.id
    assert second.name == "Amazon"
    assert second.favicon is None
    assert len(session.exec(select(Store)).all()) == 1


def test_get_or_create_recovers_from_unique_race(session, monkeypatch):
    existing = Store(domain="amazon.es", name="Amazon")
    session.add(existing)
    session.commit()

    real_get_by_domain = store_service.get_by_domain
    calls = {"count": 0}

    def stale_first_lookup(session_, domain):
        # Simulates another request inserting the row between our lookup
        # and our insert: the first lookup misses, later ones see it.
        calls["count"] += 1
        if calls["count"] == 1:
            return None
        return real_get_by_domain(session_, domain)

    monkeypatch.setattr(store_service, "get_by_domain", stale_first_lookup)

    store = store_service.get_or_create(session, "https://amazon.es/x", name="Other")

    assert store.id == existing.id
    assert store.name == "Amazon"


# --- get_favicon ---


def test_get_favicon_returns_bytes_and_mime(session):
    store = store_service.get_or_create(
        session, "https://a.com", name="A", favicon=b"ico", favicon_mime="image/x-icon"
    )

    assert store_service.get_favicon(session, store.id) == (b"ico", "image/x-icon")


def test_get_favicon_404_when_store_missing_or_without_favicon(session):
    store = store_service.get_or_create(session, "https://a.com", name="A")

    for store_id in (store.id, 999):
        with pytest.raises(HTTPException) as exc_info:
            store_service.get_favicon(session, store_id)
        assert exc_info.value.status_code == 404


# --- to_response ---


def test_to_response_reports_favicon_presence(session):
    with_icon = store_service.get_or_create(
        session, "https://a.com", name="A", favicon=b"x", favicon_mime="image/png"
    )
    without_icon = store_service.get_or_create(session, "https://b.com", name="B")

    assert store_service.to_response(with_icon).model_dump() == {
        "id": with_icon.id,
        "name": "A",
        "domain": "a.com",
        "has_favicon": True,
    }
    assert store_service.to_response(without_icon).has_favicon is False


# --- GET /stores/{id}/favicon ---


def test_favicon_endpoint_returns_bytes_with_stored_mime(client, session):
    store = store_service.get_or_create(
        session,
        "https://a.com",
        name="A",
        favicon=b"<svg/>",
        favicon_mime="image/svg+xml",
    )

    response = client.get(f"/stores/{store.id}/favicon")

    assert response.status_code == 200
    assert response.content == b"<svg/>"
    assert response.headers["content-type"] == "image/svg+xml"


def test_favicon_endpoint_sets_cache_and_security_headers(client, session):
    store = store_service.get_or_create(
        session,
        "https://a.com",
        name="A",
        favicon=b"<svg/>",
        favicon_mime="image/svg+xml",
    )

    response = client.get(f"/stores/{store.id}/favicon")

    assert response.headers["cache-control"] == "public, max-age=604800"
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["content-security-policy"] == (
        "default-src 'none'; style-src 'unsafe-inline'; sandbox"
    )


def test_favicon_endpoint_404(client, session):
    store = store_service.get_or_create(session, "https://a.com", name="A")

    assert client.get(f"/stores/{store.id}/favicon").status_code == 404
    assert client.get("/stores/999/favicon").status_code == 404
