"""Tests for checking an offer right after it is added or its URL changes.

Stagehand is replaced by a fake; the service's own ``Session(engine)`` is
pointed at the in-memory test database (see ``conftest.client``).
"""

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import select
from src import product_status_cronjob as cronjob
from src.models.database_models import (
    Config,
    DailyCheckRun,
    OfferHist,
    PendingStatusRetry,
)
from src.services import offer_check_service as offer_check
from src.services import store_service
from src.stagehand_utils import ProductStatusExtraction
from stagehand.rpc_client import RPCError, _JSONRPCError
from tests.factories import add_history, make_category, make_offer, make_product

NOW = datetime(2026, 9, 26, 9, 0)  # Before the default 12:00 analysis hour


def _ts(moment: datetime) -> int:
    return int(moment.timestamp())


def _day_start(moment: datetime) -> int:
    return _ts(datetime.combine(moment.date(), datetime.min.time()))


def _quota_error():
    return RPCError(
        _JSONRPCError(
            code=-32603,
            message="AI_APICallError: You exceeded your current quota",
            data={"name": "AI_RetryError"},
        )
    )


@pytest.fixture
def check(session, monkeypatch):
    """Configure an API key, fake Stagehand and Telegram, and add one offer."""
    monkeypatch.setattr(offer_check, "engine", session.get_bind())
    for key, value in {
        "google_api_key": "key",
        "telegram_bot_token": "token",
        "telegram_bot_chat_id": "chat",
        "is_price_drop_alert": "true",
        "is_stock_change_alert": "true",
    }.items():
        session.add(Config(key=key, value=value))
    session.commit()
    category = make_category(session)
    product = make_product(session, category.id)
    url = "https://www.thomann.es/widget.htm"
    store = store_service.get_or_create(session, url, name="Thomann")
    offer = make_offer(session, product.id, url=url, currency="EUR", store_id=store.id)

    env = SimpleNamespace(
        category_id=category.id,
        product_id=product.id,
        offer_id=offer.id,
        status=ProductStatusExtraction(price=100.0, is_in_stock=True),
        error=None,
        scraped=[],
        alerts=[],
    )
    session.commit()  # Release the connection before the service uses it.

    async def fake_get_product_status(api_key, url):
        env.scraped.append(url)
        if env.error is not None:
            raise env.error
        return env.status

    async def fake_alert(**kwargs):
        env.alerts.append(kwargs)

    monkeypatch.setattr(offer_check, "get_product_status", fake_get_product_status)
    monkeypatch.setattr(offer_check, "send_price_drop_alert", fake_alert)
    monkeypatch.setattr(offer_check, "send_stock_alert", fake_alert)
    return env


def _check_now(offer_id, url_changed=False, now=NOW):
    asyncio.run(offer_check.check_offer_now(offer_id, url_changed=url_changed, now=now))


def _history(session, offer_id):
    session.expire_all()
    return session.exec(
        select(OfferHist)
        .where(OfferHist.offer_id == offer_id)
        .order_by(OfferHist.timestamp)
    ).all()


def _pending(session):
    session.expire_all()
    return {
        (p.offer_id, p.day_start)
        for p in session.exec(select(PendingStatusRetry)).all()
    }


def _start_daily_run(session, total_offers=1, moment=NOW):
    session.add(
        DailyCheckRun(
            day_start=_day_start(moment),
            started_at=_ts(moment),
            total_offers=total_offers,
        )
    )
    session.commit()


def _daily_run(session, moment=NOW):
    session.expire_all()
    return session.get(DailyCheckRun, _day_start(moment))


# --- check_offer_now ---


def test_stores_the_status_right_away(session, check):
    _check_now(check.offer_id)

    assert [
        (h.price, h.is_in_stock, h.timestamp) for h in _history(session, check.offer_id)
    ] == [(100.0, True, _ts(NOW))]


def test_the_daily_run_skips_an_offer_checked_before_it(session, check, monkeypatch):
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    _check_now(check.offer_id)

    asyncio.run(cronjob.fetch_and_store_product_status(now=NOW.replace(hour=12)))

    assert check.scraped == ["https://www.thomann.es/widget.htm"]
    assert len(_history(session, check.offer_id)) == 1


def test_an_offer_added_after_the_daily_run_is_checked_and_counted(session, check):
    _start_daily_run(session, total_offers=3)

    _check_now(check.offer_id)

    assert len(_history(session, check.offer_id)) == 1
    assert _daily_run(session).total_offers == 4


def test_skips_an_offer_already_checked_today(session, check):
    add_history(session, check.offer_id, [(90.0, True, _ts(NOW.replace(hour=1)))])

    _check_now(check.offer_id)

    assert check.scraped == []
    assert [h.price for h in _history(session, check.offer_id)] == [90.0]


def test_quota_error_after_the_daily_run_marks_the_offer_pending(session, check):
    _start_daily_run(session)
    check.error = _quota_error()

    _check_now(check.offer_id)

    assert _history(session, check.offer_id) == []
    assert _pending(session) == {(check.offer_id, _day_start(NOW))}


def test_quota_error_before_the_daily_run_leaves_it_to_that_run(session, check):
    check.error = _quota_error()

    _check_now(check.offer_id)

    assert _pending(session) == set()


def test_other_errors_store_nothing(session, check):
    _start_daily_run(session)
    check.error = RuntimeError("page did not load")

    _check_now(check.offer_id)

    assert _history(session, check.offer_id) == []
    assert _pending(session) == set()


def test_does_nothing_without_an_api_key(session, check):
    session.delete(
        session.exec(select(Config).where(Config.key == "google_api_key")).one()
    )
    session.commit()

    _check_now(check.offer_id)

    assert check.scraped == []


def test_does_nothing_for_a_deleted_offer(session, check):
    _check_now(9999)

    assert check.scraped == []


def test_sends_no_telegram_alerts(session, check):
    add_history(
        session,
        check.offer_id,
        [(120.0, False, _ts(NOW - timedelta(days=1)))],
    )

    _check_now(check.offer_id)

    assert len(_history(session, check.offer_id)) == 2
    assert check.alerts == []


def test_url_change_replaces_todays_record(session, check):
    _start_daily_run(session, total_offers=1)
    yesterday = _ts(NOW - timedelta(days=1))
    add_history(
        session,
        check.offer_id,
        [(80.0, True, yesterday), (90.0, True, _ts(NOW.replace(hour=1)))],
    )

    _check_now(check.offer_id, url_changed=True)

    assert [(h.price, h.timestamp) for h in _history(session, check.offer_id)] == [
        (80.0, yesterday),
        (100.0, _ts(NOW)),
    ]
    assert _daily_run(session).total_offers == 1


def test_url_change_keeps_todays_record_when_the_check_fails(session, check):
    add_history(session, check.offer_id, [(90.0, True, _ts(NOW.replace(hour=1)))])
    check.error = RuntimeError("page did not load")

    _check_now(check.offer_id, url_changed=True)

    assert [h.price for h in _history(session, check.offer_id)] == [90.0]


def test_a_record_stored_during_the_scrape_is_not_duplicated(
    session, check, monkeypatch
):
    async def status_while_cronjob_stores(api_key, url):
        # The daily run stores today's record while this check scrapes.
        add_history(session, check.offer_id, [(95.0, True, _ts(NOW))])
        return check.status

    monkeypatch.setattr(offer_check, "get_product_status", status_while_cronjob_stores)

    _check_now(check.offer_id)

    assert [h.price for h in _history(session, check.offer_id)] == [95.0]


# --- endpoints ---


def _latest_prices(session, offer_id):
    return [h.price for h in _history(session, offer_id)]


def test_creating_a_product_checks_its_offer(client, session, check):
    response = client.post(
        "/products/",
        json={
            "name": "Gadget",
            "priority": "medium",
            "category_id": check.category_id,
            "description": "A gadget",
            "offer": {"url": "https://www.amazon.es/dp/GADGET", "currency": "EUR"},
        },
    )

    offer_id = response.json()["offers"][0]["id"]
    assert check.scraped == ["https://www.amazon.es/dp/GADGET"]
    assert _latest_prices(session, offer_id) == [100.0]


def test_adding_a_store_checks_the_new_offer(client, session, check):
    response = client.post(
        f"/products/{check.product_id}/offers",
        json={"url": "https://www.amazon.es/dp/WIDGET", "currency": "EUR"},
    )

    assert check.scraped == ["https://www.amazon.es/dp/WIDGET"]
    assert _latest_prices(session, response.json()["id"]) == [100.0]


def test_changing_the_url_checks_the_offer_again(client, session, check):
    client.patch(
        f"/offers/{check.offer_id}", json={"url": "https://www.amazon.es/dp/WIDGET"}
    )

    assert check.scraped == ["https://www.amazon.es/dp/WIDGET"]
    assert _latest_prices(session, check.offer_id) == [100.0]


def test_saving_the_same_url_does_not_check_again(client, session, check):
    client.patch(
        f"/offers/{check.offer_id}", json={"url": "https://www.thomann.es/widget.htm"}
    )

    assert check.scraped == []


def test_a_rejected_request_checks_nothing(client, session, check):
    response = client.post(
        f"/products/{check.product_id}/offers",
        json={"url": "https://www.amazon.com/dp/WIDGET", "currency": "USD"},
    )

    assert response.status_code == 409
    assert check.scraped == []
