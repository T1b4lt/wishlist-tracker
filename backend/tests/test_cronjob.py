"""Tests for the daily price tracking cronjob.

Stagehand and Telegram are replaced by fakes; the cronjob's own
``Session(engine)`` is pointed at the in-memory test database.
"""

import asyncio
import math
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import select
from src import product_status_cronjob as cronjob
from src.models.database_models import Category, Config, Product, ProductHist
from src.stagehand_utils import ProductStatusExtraction

NOW = datetime(2026, 9, 26, 12, 0)  # Naive local time, like datetime.now()


def _ts(moment: datetime) -> int:
    return int(moment.timestamp())


@pytest.fixture
def cron(session, monkeypatch):
    """Configure alerts, fake Stagehand/Telegram and return the recorders."""
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    for key, value in {
        "google_api_key": "key",
        "telegram_bot_token": "token",
        "telegram_bot_chat_id": "chat",
        "is_price_drop_alert": "true",
        "is_stock_change_alert": "true",
    }.items():
        session.add(Config(key=key, value=value))
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    product = Product(
        name="Widget",
        url="https://example.com/widget",
        priority="medium",
        category_id=category.id,
        description="A widget",
        currency="EUR",
    )
    session.add(product)
    session.commit()
    session.refresh(product)
    product_id, product_url = product.id, product.url
    session.commit()  # Release the connection before the cronjob uses it.

    env = SimpleNamespace(
        product_id=product_id,
        product_url=product_url,
        status=ProductStatusExtraction(price=100.0, is_in_stock=True),
        scraped=[],
        price_drop_alerts=[],
        stock_alerts=[],
    )

    async def fake_get_product_status(api_key, url):
        env.scraped.append(url)
        return env.status

    async def fake_price_drop_alert(**kwargs):
        env.price_drop_alerts.append(kwargs)

    async def fake_stock_alert(**kwargs):
        env.stock_alerts.append(kwargs)

    monkeypatch.setattr(cronjob, "get_product_status", fake_get_product_status)
    monkeypatch.setattr(cronjob, "send_price_drop_alert", fake_price_drop_alert)
    monkeypatch.setattr(cronjob, "send_stock_alert", fake_stock_alert)
    return env


def _add(session, product_id, price, is_in_stock, moment):
    session.add(
        ProductHist(
            product_id=product_id,
            price=price,
            is_in_stock=is_in_stock,
            timestamp=_ts(moment),
        )
    )
    session.commit()


def _history(session, product_id):
    session.expire_all()
    return session.exec(
        select(ProductHist)
        .where(ProductHist.product_id == product_id)
        .order_by(ProductHist.timestamp)
    ).all()


def _run():
    asyncio.run(cronjob.fetch_and_store_product_status(now=NOW))


def test_stores_a_valid_status(session, cron):
    _run()

    history = _history(session, cron.product_id)
    assert [(h.price, h.is_in_stock, h.timestamp) for h in history] == [
        (100.0, True, _ts(NOW))
    ]


@pytest.mark.parametrize("price", [0.0, -1.0, math.nan, math.inf])
def test_invalid_price_is_not_stored_and_sends_no_alert(session, cron, price):
    _add(session, cron.product_id, 120.0, True, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=price, is_in_stock=True)

    _run()

    assert len(_history(session, cron.product_id)) == 1
    assert cron.price_drop_alerts == []
    assert cron.stock_alerts == []


def test_skips_a_product_already_checked_today(session, cron):
    _add(session, cron.product_id, 100.0, True, NOW.replace(hour=1))

    _run()

    assert cron.scraped == []
    assert len(_history(session, cron.product_id)) == 1


def test_a_record_from_yesterday_late_night_does_not_block_today(session, cron):
    yesterday_late = datetime.combine(NOW.date(), datetime.min.time()) - timedelta(
        minutes=1
    )
    _add(session, cron.product_id, 100.0, True, yesterday_late)

    _run()

    assert cron.scraped == [cron.product_url]
    assert len(_history(session, cron.product_id)) == 2


def test_price_drop_compares_with_the_last_in_stock_price(session, cron):
    _add(session, cron.product_id, 120.0, True, NOW - timedelta(days=2))
    _add(session, cron.product_id, 90.0, False, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=True)

    _run()

    assert [(a["old_price"], a["new_price"]) for a in cron.price_drop_alerts] == [
        (120.0, 100.0)
    ]


def test_no_price_drop_alert_when_the_new_status_is_out_of_stock(session, cron):
    _add(session, cron.product_id, 120.0, True, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=False)

    _run()

    assert cron.price_drop_alerts == []
    assert len(_history(session, cron.product_id)) == 2


def test_back_in_stock_without_previous_in_stock_price(session, cron):
    # Review focus: nothing to compare the price with, but stock came back.
    _add(session, cron.product_id, 90.0, False, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=True)

    _run()

    assert cron.price_drop_alerts == []
    assert len(cron.stock_alerts) == 1
