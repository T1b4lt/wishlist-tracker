"""Tests for the precomputed range statistics of the product detail."""

import pytest
from src.models.database_models import Config
from src.services import product_service
from tests.factories import add_history, make_category, make_offer, make_product

DAY = 86400
NOW = 1_000 * DAY


@pytest.fixture
def two_store_product(session):
    """Store A is the best offer (95 now); store B has the oldest low (85)."""
    category = make_category(session)
    product = make_product(session, category.id)
    a = make_offer(session, product.id, url="https://a.es/x")
    b = make_offer(session, product.id, url="https://b.es/x")
    add_history(
        session,
        a.id,
        [
            (100.0, True, NOW - 40 * DAY),
            (90.0, True, NOW - 10 * DAY),
            (95.0, True, NOW - DAY),
        ],
    )
    add_history(
        session, b.id, [(85.0, True, NOW - 50 * DAY), (99.0, True, NOW - 2 * DAY)]
    )
    return product, a, b


def _by_key(detail):
    return {stats.key: stats for stats in detail.ranges}


def _set_window(session, value):
    session.add(Config(key="hist_window_size", value=value))
    session.commit()


def test_detail_has_every_range_in_order(session, two_store_product):
    product, _, _ = two_store_product

    detail = product_service.get_detail(session, product.id, now=NOW)

    assert [stats.key for stats in detail.ranges] == ["30", "60", "90", "180", "all"]
    assert [stats.window_start for stats in detail.ranges] == [
        NOW - 30 * DAY,
        NOW - 60 * DAY,
        NOW - 90 * DAY,
        NOW - 180 * DAY,
        None,
    ]


def test_detail_values_the_product_by_its_best_offer(session, two_store_product):
    product, a, _ = two_store_product

    detail = product_service.get_detail(session, product.id, now=NOW)
    ranges = _by_key(detail)

    assert detail.best_offer_id == a.id
    assert detail.is_in_stock is True
    assert ranges["30"].average == pytest.approx(90.0)
    assert ranges["30"].price_change_pct == pytest.approx(5.5556, abs=1e-3)
    assert ranges["60"].average == pytest.approx(95.0)
    assert ranges["60"].price_change_pct == pytest.approx(0.0)


def test_detail_lowest_looks_at_every_store(session, two_store_product):
    product, a, b = two_store_product

    ranges = _by_key(product_service.get_detail(session, product.id, now=NOW))

    lowest_30 = ranges["30"].lowest
    lowest_60 = ranges["60"].lowest
    assert (lowest_30.price, lowest_30.timestamp, lowest_30.offer_id) == (
        90.0,
        NOW - 10 * DAY,
        a.id,
    )
    assert (lowest_60.price, lowest_60.timestamp, lowest_60.offer_id) == (
        85.0,
        NOW - 50 * DAY,
        b.id,
    )
    assert ranges["all"].lowest.offer_id == b.id


def test_default_range_follows_the_configured_window(session, two_store_product):
    product, _, _ = two_store_product
    _set_window(session, "90")

    detail = product_service.get_detail(session, product.id, now=NOW)

    assert detail.default_range == "90"


def test_default_range_falls_back_for_an_off_list_window(session, two_store_product):
    product, _, _ = two_store_product
    _set_window(session, "45")

    detail = product_service.get_detail(session, product.id, now=NOW)

    assert detail.default_range == "60"


def test_product_without_history(session):
    category = make_category(session)
    product = make_product(session, category.id)
    make_offer(session, product.id)

    detail = product_service.get_detail(session, product.id, now=NOW)

    assert detail.best_offer_id is None
    assert detail.is_in_stock is None
    assert detail.is_stale is False
    assert detail.stale_days is None
    for stats in detail.ranges:
        assert (stats.average, stats.price_change_pct, stats.lowest) == (
            None,
            None,
            None,
        )
    assert detail.ranges[0].window_start == NOW - 30 * DAY


def test_a_new_store_without_history_is_ignored(session, two_store_product):
    product, a, b = two_store_product
    new = make_offer(session, product.id, url="https://c.es/x")

    detail = product_service.get_detail(session, product.id, now=NOW)
    offers = {offer.id: offer for offer in detail.offers}

    assert detail.best_offer_id == a.id
    assert _by_key(detail)["60"].lowest.offer_id == b.id
    assert offers[new.id].is_stale is False
    assert offers[new.id].days_since_check is None


def test_out_of_stock_best_offer_has_no_change_and_lowest_from_another_store(
    session,
):
    category = make_category(session)
    product = make_product(session, category.id)
    a = make_offer(session, product.id, url="https://a.es/x")
    b = make_offer(session, product.id, url="https://b.es/x")
    add_history(session, a.id, [(70.0, True, NOW - 5 * DAY), (60.0, False, NOW - DAY)])
    add_history(session, b.id, [(65.0, True, NOW - 3 * DAY), (80.0, False, NOW - DAY)])

    detail = product_service.get_detail(session, product.id, now=NOW)
    ranges = _by_key(detail)

    assert detail.best_offer_id == a.id
    assert detail.is_in_stock is False
    assert ranges["30"].price_change_pct is None
    assert (ranges["30"].lowest.price, ranges["30"].lowest.offer_id) == (65.0, b.id)


def test_detail_endpoint_serializes_the_ranges(client, session, two_store_product):
    product, _, _ = two_store_product

    data = client.get(f"/products/{product.id}").json()

    assert data["default_range"] == "60"
    assert [stats["key"] for stats in data["ranges"]] == [
        "30",
        "60",
        "90",
        "180",
        "all",
    ]
    assert set(data["ranges"][0]) == {
        "key",
        "window_start",
        "average",
        "price_change_pct",
        "lowest",
    }
