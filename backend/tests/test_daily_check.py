"""Tests for today's daily-check status (``GET /daily-check/``)."""

from datetime import datetime

import pytest
from src.core.local_day import local_day_bounds
from src.models.database_models import (
    Category,
    DailyCheckRun,
    Offer,
    OfferHist,
    PendingStatusRetry,
    Product,
)
from src.services import daily_check_service

NOW = datetime(2026, 9, 26, 15, 0)
DAY_START, DAY_END = local_day_bounds(NOW)


class _FrozenDatetime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW


@pytest.fixture
def products(session):
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    items = [
        Product(name=f"P{i}", priority="low", category_id=category.id, description="x")
        for i in range(3)
    ]
    session.add_all(items)
    session.commit()
    items = [
        Offer(product_id=p.id, url=f"https://example.com/{i}", currency="EUR")
        for i, p in enumerate(items)
    ]
    session.add_all(items)
    session.commit()
    return [p.id for p in items]


def test_status_before_todays_run_has_no_snapshot(session):
    status = daily_check_service.get_status(session, NOW)

    assert status.model_dump() == {
        "day_start": DAY_START,
        "started_at": None,
        "total_offers": None,
        "limit_reached_at": None,
        "pending_at_limit": None,
        "limit_reason": None,
        "pending_now": 0,
    }


def test_status_on_a_limit_day_reports_the_snapshot_and_live_pending(session, products):
    session.add(
        DailyCheckRun(
            day_start=DAY_START,
            started_at=DAY_START + 12 * 3600,
            total_offers=3,
            limit_reached_at=DAY_START + 12 * 3600 + 180,
            pending_at_limit=2,
        )
    )
    session.add(PendingStatusRetry(offer_id=products[2], day_start=DAY_START))
    session.commit()

    status = daily_check_service.get_status(session, NOW)

    assert status.started_at == DAY_START + 12 * 3600
    assert status.total_offers == 3
    assert status.limit_reached_at == DAY_START + 12 * 3600 + 180
    assert status.pending_at_limit == 2
    assert status.pending_now == 1


def test_a_run_from_another_day_is_not_todays(session):
    session.add(
        DailyCheckRun(
            day_start=DAY_START - 86400, started_at=DAY_START - 40000, total_offers=1
        )
    )
    session.commit()

    assert daily_check_service.get_status(session, NOW).started_at is None


def test_pending_from_another_day_is_not_counted(session, products):
    session.add(PendingStatusRetry(offer_id=products[0], day_start=DAY_START - 86400))
    session.commit()

    assert daily_check_service.count_today(session, NOW).pending == 0


def test_recorded_counts_products_with_a_record_today_once(session, products):
    for timestamp in (DAY_START + 10, DAY_START + 20):
        session.add(
            OfferHist(
                offer_id=products[0], price=1.0, is_in_stock=True, timestamp=timestamp
            )
        )
    session.add(
        OfferHist(
            offer_id=products[1], price=1.0, is_in_stock=True, timestamp=DAY_START - 1
        )
    )
    session.commit()

    assert daily_check_service.count_today(session, NOW).recorded == 1


def test_endpoint_returns_todays_status(client, monkeypatch):
    monkeypatch.setattr(daily_check_service, "datetime", _FrozenDatetime)

    response = client.get("/daily-check/")

    assert response.status_code == 200
    assert response.json()["day_start"] == DAY_START
    assert response.json()["pending_now"] == 0


def test_status_exposes_the_limit_reason(session, products):
    session.add(
        DailyCheckRun(
            day_start=DAY_START,
            started_at=DAY_START,
            total_offers=3,
            limit_reached_at=DAY_START + 60,
            pending_at_limit=1,
            limit_reason="unavailable",
        )
    )
    session.commit()

    assert daily_check_service.get_status(session, NOW).limit_reason == "unavailable"
