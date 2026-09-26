"""Tests for favicon payload parsing and the product-info extraction flow."""

import asyncio
import base64
import json

import pytest
from src import stagehand_utils
from src.models.database_models import Category, Config, Store
from src.services import product_service, store_service
from src.stagehand_utils import (
    MAX_FAVICON_BYTES,
    FaviconData,
    ProductInfoExtraction,
    ProductInfoResult,
    parse_favicon_payload,
)

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 8
ICO = b"\x00\x00\x01\x00" + b"\x00" * 8
SVG = b'<svg xmlns="http://www.w3.org/2000/svg"></svg>'


def _payload(mime="image/png", content=PNG):
    return json.dumps({"mime": mime, "data": base64.b64encode(content).decode()})


# --- parse_favicon_payload ---


def test_parse_favicon_payload_accepts_image():
    assert parse_favicon_payload(_payload()) == FaviconData(
        content=PNG, mime="image/png"
    )


def test_parse_favicon_payload_uses_detected_type_over_claimed_mime():
    # A real ICO file served as "image/png" is stored with its true type.
    result = parse_favicon_payload(_payload(mime="image/png", content=ICO))

    assert result.mime == "image/x-icon"


def test_parse_favicon_payload_accepts_svg_with_xml_prolog():
    content = b'<?xml version="1.0"?>' + SVG
    result = parse_favicon_payload(_payload(mime="image/svg+xml", content=content))

    assert result.mime == "image/svg+xml"


def test_parse_favicon_payload_strips_mime_parameters_and_case():
    result = parse_favicon_payload(
        _payload(mime="Image/SVG+XML; charset=utf-8", content=SVG)
    )

    assert result.mime == "image/svg+xml"


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "not json",
        json.dumps(["list"]),
        json.dumps({"mime": "image/png"}),
        json.dumps({"mime": "image/png", "data": "***not base64***"}),
        _payload(mime="text/html", content=b"<html>404</html>"),
        _payload(mime="application/octet-stream"),
        _payload(content=b""),
        _payload(content=PNG + b"x" * (MAX_FAVICON_BYTES + 1 - len(PNG))),
        # Soft-404s: HTML pages served for /favicon.ico with an image type.
        _payload(mime="image/x-icon", content=b"<!DOCTYPE html><html>404</html>"),
        _payload(mime="image/svg+xml", content=b"<html><body>Not found</body></html>"),
        _payload(mime="image/png", content=b"not an image at all"),
    ],
)
def test_parse_favicon_payload_rejects_invalid(raw):
    assert parse_favicon_payload(raw) is None


def test_parse_favicon_payload_accepts_max_size():
    assert parse_favicon_payload(
        _payload(content=PNG + b"x" * (MAX_FAVICON_BYTES - len(PNG)))
    )


# --- extract_product_info ---


@pytest.fixture
def extraction_setup(session, monkeypatch):
    """Seed the config/categories and replace Stagehand with a fake."""
    session.add(Category(name="Electronics", color="#000"))
    session.add(Config(key="google_api_key", value="key"))
    session.commit()

    calls = []

    async def fake_get_product_info(
        google_api_key, url, language, categories, fetch_favicon=True
    ):
        calls.append({"url": url, "fetch_favicon": fetch_favicon})
        return ProductInfoResult(
            info=ProductInfoExtraction(
                name="Widget",
                category="Electronics",
                currency="EUR",
                description="A widget",
                store_name="Amazon",
            ),
            favicon=FaviconData(content=b"ico", mime="image/x-icon")
            if fetch_favicon
            else None,
        )

    monkeypatch.setattr(product_service, "get_product_info", fake_get_product_info)
    return calls


def test_extract_new_domain_fetches_favicon_and_creates_store(
    client, session, extraction_setup
):
    response = client.post(
        "/extract-product-info/", json={"url": "https://www.amazon.es/dp/1"}
    )

    assert response.status_code == 200
    assert extraction_setup == [
        {"url": "https://www.amazon.es/dp/1", "fetch_favicon": True}
    ]
    body = response.json()
    assert body["name"] == "Widget"
    store = session.get(Store, body["store"]["id"])
    assert body["store"] == {
        "id": store.id,
        "name": "Amazon",
        "domain": "amazon.es",
        "has_favicon": True,
    }
    assert store.favicon == b"ico"
    assert store.favicon_mime == "image/x-icon"


def test_extract_known_domain_skips_favicon_and_reuses_store(
    client, session, extraction_setup
):
    existing = store_service.get_or_create(
        session, "https://amazon.es", name="Amazon.es"
    )

    response = client.post(
        "/extract-product-info/", json={"url": "https://amazon.es/dp/2"}
    )

    assert extraction_setup[0]["fetch_favicon"] is False
    assert response.json()["store"]["id"] == existing.id
    assert response.json()["store"]["name"] == "Amazon.es"


def test_extract_invalid_url_returns_422_without_scraping(client, extraction_setup):
    response = client.post("/extract-product-info/", json={"url": "amazon.es"})

    assert response.status_code == 422
    assert extraction_setup == []


# --- _fetch_favicon ---


class _StalledPage:
    """A page whose ``evaluate`` never finishes (e.g. a tarpitted icon host)."""

    async def evaluate(self, expression):
        await asyncio.sleep(60)


def test_fetch_favicon_times_out_to_none(monkeypatch):
    monkeypatch.setattr(stagehand_utils, "FAVICON_TIMEOUT_SECONDS", 0.05)

    result = asyncio.run(
        asyncio.wait_for(stagehand_utils._fetch_favicon(_StalledPage()), timeout=5)
    )

    assert result is None
