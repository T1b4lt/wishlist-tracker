"""Tests for the daily price tracking cronjob.

Stagehand and Telegram are replaced by fakes; the cronjob's own
``Session(engine)`` is pointed at the in-memory test database.
"""

import asyncio
import math
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import delete, select
from src import product_status_cronjob as cronjob
from src.models.database_models import (
    Category,
    Config,
    DailyCheckRun,
    Offer,
    OfferHist,
    PendingStatusRetry,
    Product,
    Store,
)
from src.stagehand_utils import ProductStatusExtraction
from stagehand.rpc_client import RPCError, _JSONRPCError

NOW = datetime(2026, 9, 26, 12, 0)  # Naive local time, like datetime.now()


def _ts(moment: datetime) -> int:
    return int(moment.timestamp())


@pytest.fixture
def cron(session, monkeypatch, tmp_path):
    """Configure alerts, fake Stagehand/Telegram and return the recorders."""
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    monkeypatch.setattr(cronjob, "RUN_LOCK_FILE", str(tmp_path / "cronjob.lock"))
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
    category_id = category.id
    store = Store(domain="example.com", name="Example")
    session.add(store)
    session.commit()
    store_id = store.id
    product = Product(
        name="Widget",
        priority="medium",
        category_id=category.id,
        description="A widget",
    )
    session.add(product)
    session.commit()
    offer = Offer(
        product_id=product.id,
        url="https://example.com/widget",
        currency="EUR",
        store_id=store_id,
    )
    session.add(offer)
    session.commit()
    product_id, offer_id, offer_url = product.id, offer.id, offer.url
    session.commit()  # Release the connection before the cronjob uses it.

    env = SimpleNamespace(
        product_id=product_id,
        offer_id=offer_id,
        offer_url=offer_url,
        category_id=category_id,
        store_id=store_id,
        status=ProductStatusExtraction(price=100.0, is_in_stock=True),
        errors={},  # url -> exception raised instead of returning a status
        scraped=[],
        price_drop_alerts=[],
        stock_alerts=[],
    )

    async def fake_get_product_status(api_key, url):
        env.scraped.append(url)
        if url in env.errors:
            raise env.errors[url]
        return env.status

    async def fake_price_drop_alert(**kwargs):
        env.price_drop_alerts.append(kwargs)

    async def fake_stock_alert(**kwargs):
        env.stock_alerts.append(kwargs)

    monkeypatch.setattr(cronjob, "get_product_status", fake_get_product_status)
    monkeypatch.setattr(cronjob, "send_price_drop_alert", fake_price_drop_alert)
    monkeypatch.setattr(cronjob, "send_stock_alert", fake_stock_alert)
    return env


def _add(session, offer_id, price, is_in_stock, moment):
    session.add(
        OfferHist(
            offer_id=offer_id,
            price=price,
            is_in_stock=is_in_stock,
            timestamp=_ts(moment),
        )
    )
    session.commit()


def _history(session, offer_id):
    session.expire_all()
    return session.exec(
        select(OfferHist)
        .where(OfferHist.offer_id == offer_id)
        .order_by(OfferHist.timestamp)
    ).all()


def _run(now=NOW):
    asyncio.run(cronjob.fetch_and_store_product_status(now=now))


def _retry(now=NOW + timedelta(hours=1)):
    asyncio.run(cronjob.retry_rate_limited_products(now=now))


def _quota_error():
    return RPCError(
        _JSONRPCError(
            code=-32603,
            message=(
                "Failed after 3 attempts. Last error: AI_APICallError: You exceeded "
                "your current quota, please check your plan and billing details."
            ),
            data={"name": "AI_RetryError"},
        )
    )


def _day_start(moment):
    return _ts(datetime.combine(moment.date(), datetime.min.time()))


def _add_product(session, cron, name):
    """Add a product with one offer; returns the offer's id and URL."""
    product = Product(
        name=name, priority="medium", category_id=cron.category_id, description=name
    )
    session.add(product)
    session.commit()
    offer = Offer(
        product_id=product.id,
        url=f"https://example.com/{name.lower()}",
        currency="EUR",
        store_id=cron.store_id,
    )
    session.add(offer)
    session.commit()
    offer_id, url = offer.id, offer.url
    session.commit()  # Release the connection before the cronjob uses it.
    return SimpleNamespace(id=offer_id, url=url)


def _mark_pending(session, offer_id, day_start):
    session.add(PendingStatusRetry(offer_id=offer_id, day_start=day_start))
    session.commit()


def _pending(session):
    session.expire_all()
    return {
        (p.offer_id, p.day_start)
        for p in session.exec(select(PendingStatusRetry)).all()
    }


def test_stores_a_valid_status(session, cron):
    _run()

    history = _history(session, cron.offer_id)
    assert [(h.price, h.is_in_stock, h.timestamp) for h in history] == [
        (100.0, True, _ts(NOW))
    ]


@pytest.mark.parametrize("price", [0.0, -1.0, math.nan, math.inf])
def test_invalid_price_is_not_stored_and_sends_no_alert(session, cron, price):
    _add(session, cron.offer_id, 120.0, True, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=price, is_in_stock=True)

    _run()

    assert len(_history(session, cron.offer_id)) == 1
    assert cron.price_drop_alerts == []
    assert cron.stock_alerts == []


def test_skips_a_product_already_checked_today(session, cron):
    _add(session, cron.offer_id, 100.0, True, NOW.replace(hour=1))

    _run()

    assert cron.scraped == []
    assert len(_history(session, cron.offer_id)) == 1


def test_a_record_from_yesterday_late_night_does_not_block_today(session, cron):
    yesterday_late = datetime.combine(NOW.date(), datetime.min.time()) - timedelta(
        minutes=1
    )
    _add(session, cron.offer_id, 100.0, True, yesterday_late)

    _run()

    assert cron.scraped == [cron.offer_url]
    assert len(_history(session, cron.offer_id)) == 2


def test_price_drop_compares_with_the_last_in_stock_price(session, cron):
    _add(session, cron.offer_id, 120.0, True, NOW - timedelta(days=2))
    _add(session, cron.offer_id, 90.0, False, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=True)

    _run()

    assert [(a["old_price"], a["new_price"]) for a in cron.price_drop_alerts] == [
        (120.0, 100.0)
    ]


def test_no_price_drop_alert_when_the_new_status_is_out_of_stock(session, cron):
    _add(session, cron.offer_id, 120.0, True, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=False)

    _run()

    assert cron.price_drop_alerts == []
    assert len(_history(session, cron.offer_id)) == 2


def test_back_in_stock_without_previous_in_stock_price(session, cron):
    # Review focus: nothing to compare the price with, but stock came back.
    _add(session, cron.offer_id, 90.0, False, NOW - timedelta(days=1))
    cron.status = ProductStatusExtraction(price=100.0, is_in_stock=True)

    _run()

    assert cron.price_drop_alerts == []
    assert len(cron.stock_alerts) == 1


# --- Rate-limit retries ---


def test_rate_limit_stops_the_run_and_marks_the_rest_pending(session, cron):
    second = _add_product(session, cron, "Gadget")
    third = _add_product(session, cron, "Gizmo")
    cron.errors[second.url] = _quota_error()

    _run()

    assert cron.scraped == [cron.offer_url, second.url]
    assert len(_history(session, cron.offer_id)) == 1
    assert _pending(session) == {
        (second.id, _day_start(NOW)),
        (third.id, _day_start(NOW)),
    }


def test_products_already_checked_today_are_not_marked_pending(session, cron):
    second = _add_product(session, cron, "Gadget")
    _add(session, second.id, 50.0, True, NOW.replace(hour=1))
    cron.errors[cron.offer_url] = _quota_error()

    _run()

    assert _pending(session) == {(cron.offer_id, _day_start(NOW))}


def test_other_errors_do_not_stop_the_run_nor_mark_pending(session, cron):
    second = _add_product(session, cron, "Gadget")
    cron.errors[cron.offer_url] = RuntimeError("page did not load")

    _run()

    assert cron.scraped == [cron.offer_url, second.url]
    assert len(_history(session, second.id)) == 1
    assert _pending(session) == set()


def test_retry_processes_only_pending_products(session, cron):
    second = _add_product(session, cron, "Gadget")
    _mark_pending(session, second.id, _day_start(NOW))

    _retry()

    assert cron.scraped == [second.url]
    assert len(_history(session, second.id)) == 1
    assert _history(session, cron.offer_id) == []
    assert _pending(session) == set()


def test_retry_stops_and_keeps_products_pending_on_rate_limit(session, cron):
    second = _add_product(session, cron, "Gadget")
    _mark_pending(session, cron.offer_id, _day_start(NOW))
    _mark_pending(session, second.id, _day_start(NOW))
    cron.errors[cron.offer_url] = _quota_error()

    _retry()

    assert cron.scraped == [cron.offer_url]
    assert _pending(session) == {
        (cron.offer_id, _day_start(NOW)),
        (second.id, _day_start(NOW)),
    }


def test_retry_drops_a_product_that_fails_for_another_reason(session, cron):
    _mark_pending(session, cron.offer_id, _day_start(NOW))
    cron.errors[cron.offer_url] = RuntimeError("page did not load")

    _retry()

    assert _pending(session) == set()
    assert _history(session, cron.offer_id) == []


def test_retry_drops_a_product_with_an_invalid_price(session, cron):
    _mark_pending(session, cron.offer_id, _day_start(NOW))
    cron.status = ProductStatusExtraction(price=0.0, is_in_stock=True)

    _retry()

    assert _pending(session) == set()


def test_retry_drops_a_product_already_checked_today(session, cron):
    _add(session, cron.offer_id, 100.0, True, NOW.replace(hour=1))
    _mark_pending(session, cron.offer_id, _day_start(NOW))

    _retry()

    assert cron.scraped == []
    assert _pending(session) == set()


def test_retry_ignores_and_deletes_pending_products_from_another_day(session, cron):
    _mark_pending(session, cron.offer_id, _day_start(NOW - timedelta(days=1)))

    _retry()

    assert cron.scraped == []
    assert _pending(session) == set()


def test_retry_stores_the_record_at_the_retry_time(session, cron):
    _mark_pending(session, cron.offer_id, _day_start(NOW))
    retry_at = NOW + timedelta(hours=3)

    _retry(now=retry_at)

    assert [h.timestamp for h in _history(session, cron.offer_id)] == [_ts(retry_at)]


def test_deleting_a_product_deletes_its_pending_retry(session, cron):
    _mark_pending(session, cron.offer_id, _day_start(NOW))

    session.delete(session.get(Product, cron.product_id))
    session.commit()

    assert _pending(session) == set()


def _daily_run(session):
    session.expire_all()
    return session.get(DailyCheckRun, _day_start(NOW))


@pytest.fixture
def main_calls(monkeypatch):
    calls = []

    async def fake_full(now=None):
        calls.append("full")

    async def fake_retry(now=None):
        calls.append("retry")

    monkeypatch.setattr(cronjob, "fetch_and_store_product_status", fake_full)
    monkeypatch.setattr(cronjob, "retry_rate_limited_products", fake_retry)
    return calls


@pytest.mark.parametrize(
    ("hour", "expected"), [(11, "retry"), (12, "full"), (18, "full")]
)
def test_main_starts_the_daily_run_on_the_first_tick_after_the_analysis_hour(
    session, cron, main_calls, hour, expected
):
    asyncio.run(cronjob.main(now=NOW.replace(hour=hour)))

    assert main_calls == [expected]


def test_main_starts_the_daily_run_only_once_per_day(session, cron, main_calls):
    session.add(
        DailyCheckRun(day_start=_day_start(NOW), started_at=_ts(NOW), total_offers=1)
    )
    session.commit()

    asyncio.run(cronjob.main(now=NOW.replace(minute=10)))

    assert main_calls == ["retry"]


def test_main_ignores_the_daily_run_of_another_day(session, cron, main_calls):
    yesterday = NOW - timedelta(days=1)
    session.add(
        DailyCheckRun(
            day_start=_day_start(yesterday), started_at=_ts(yesterday), total_offers=1
        )
    )
    session.commit()

    asyncio.run(cronjob.main(now=NOW))

    assert main_calls == ["full"]


def test_full_run_creates_the_daily_run_without_a_limit(session, cron):
    _run()

    run = _daily_run(session)
    assert (run.started_at, run.total_offers) == (_ts(NOW), 1)
    assert (run.limit_reached_at, run.pending_at_limit) == (None, None)
    assert run.report_sent is False


def test_full_run_records_the_first_quota_error(session, cron, monkeypatch):
    second = _add_product(session, cron, "Gadget")
    _add_product(session, cron, "Gizmo")
    cron.errors[second.url] = _quota_error()
    monkeypatch.setattr(cronjob, "_current_timestamp", lambda: _ts(NOW) + 180)

    _run()

    run = _daily_run(session)
    assert run.total_offers == 3
    assert (run.limit_reached_at, run.pending_at_limit) == (_ts(NOW) + 180, 2)


def test_retry_quota_error_keeps_the_first_snapshot(session, cron, monkeypatch):
    session.add(
        DailyCheckRun(
            day_start=_day_start(NOW),
            started_at=_ts(NOW),
            total_offers=1,
            limit_reached_at=_ts(NOW) + 60,
            pending_at_limit=1,
        )
    )
    session.commit()
    _mark_pending(session, cron.offer_id, _day_start(NOW))
    cron.errors[cron.offer_url] = _quota_error()
    monkeypatch.setattr(cronjob, "_current_timestamp", lambda: _ts(NOW) + 3600)

    _retry()

    assert _daily_run(session).limit_reached_at == _ts(NOW) + 60


def test_full_run_without_api_key_does_not_create_the_daily_run(session, cron):
    session.exec(delete(Config).where(Config.key == "google_api_key"))
    session.commit()

    _run()

    assert _daily_run(session) is None


def test_full_run_without_products_does_not_create_the_daily_run(session, cron):
    session.delete(session.get(Product, cron.product_id))
    session.commit()

    _run()

    assert _daily_run(session) is None


def test_full_run_checks_the_least_recently_checked_products_first(session, cron):
    # Review focus: when the daily quota cannot cover every product, the ones
    # left out today go first tomorrow instead of always being the last IDs.
    never_checked = _add_product(session, cron, "Gadget")
    checked_long_ago = _add_product(session, cron, "Gizmo")
    _add(session, cron.offer_id, 100.0, True, NOW - timedelta(days=1))
    _add(session, checked_long_ago.id, 100.0, True, NOW - timedelta(days=3))

    _run()

    assert cron.scraped == [never_checked.url, checked_long_ago.url, cron.offer_url]


def test_retry_checks_the_least_recently_checked_products_first(session, cron):
    second = _add_product(session, cron, "Gadget")
    _add(session, cron.offer_id, 100.0, True, NOW - timedelta(days=1))
    _add(session, second.id, 100.0, True, NOW - timedelta(days=3))
    _mark_pending(session, cron.offer_id, _day_start(NOW))
    _mark_pending(session, second.id, _day_start(NOW))

    _retry()

    assert cron.scraped == [second.url, cron.offer_url]


def test_main_evaluates_the_daily_report_after_the_run(
    session, cron, main_calls, monkeypatch
):
    async def fake_report(now):
        main_calls.append("report")

    monkeypatch.setattr(cronjob, "send_daily_report_if_due", fake_report)

    asyncio.run(cronjob.main(now=NOW))

    assert main_calls == ["full", "report"]


def test_main_skips_the_run_while_another_run_holds_the_lock(
    session, cron, main_calls, monkeypatch, tmp_path
):
    # Review focus: a full run over many products outlasts the 10-minute
    # schedule; an overlapping run would retry the same products twice and
    # could report the day as done before the pending list is written.
    import fcntl

    lock_path = tmp_path / "cronjob.lock"
    monkeypatch.setattr(cronjob, "RUN_LOCK_FILE", str(lock_path))
    with open(lock_path, "w") as held:
        fcntl.flock(held, fcntl.LOCK_EX | fcntl.LOCK_NB)

        asyncio.run(cronjob.main(now=NOW))

    assert main_calls == []


def test_main_runs_once_the_lock_is_free(
    session, cron, main_calls, monkeypatch, tmp_path
):
    monkeypatch.setattr(cronjob, "RUN_LOCK_FILE", str(tmp_path / "cronjob.lock"))

    asyncio.run(cronjob.main(now=NOW))
    asyncio.run(cronjob.main(now=NOW + timedelta(minutes=10)))

    assert main_calls == ["full", "full"]


def test_checks_every_offer_of_a_product(session, cron):
    second = Offer(
        product_id=cron.product_id,
        url="https://other.example/widget",
        currency="EUR",
    )
    session.add(second)
    session.commit()
    second_id = second.id
    session.commit()

    _run()

    assert sorted(cron.scraped) == sorted(
        [cron.offer_url, "https://other.example/widget"]
    )
    assert len(_history(session, cron.offer_id)) == 1
    assert len(_history(session, second_id)) == 1


def test_price_drop_alert_names_the_store_and_links_the_offer(session, cron):
    _add(session, cron.offer_id, 120.0, True, NOW - timedelta(days=1))

    _run()

    (alert,) = cron.price_drop_alerts
    assert alert["store_name"] == "Example"
    assert alert["product_url"] == cron.offer_url
    assert alert["product_name"] == "Widget"


def test_daily_run_counts_offers(session, cron):
    _add_product(session, cron, "Gadget")

    _run()

    session.expire_all()
    (run,) = session.exec(select(DailyCheckRun)).all()
    assert run.total_offers == 2


def test_an_offer_removed_during_the_run_does_not_stop_it(session, cron, monkeypatch):
    doomed = _add_product(session, cron, "Doomed")
    doomed_product_id = session.get(Offer, doomed.id).product_id
    session.commit()
    real_status = cronjob.get_product_status

    async def status_then_delete(api_key, url):
        # While the first offer is checked, the user deletes the other product.
        if url == cron.offer_url:
            session.delete(session.get(Product, doomed_product_id))
            session.commit()
        return await real_status(api_key, url)

    monkeypatch.setattr(cronjob, "get_product_status", status_then_delete)

    _run()

    assert len(_history(session, cron.offer_id)) == 1
    assert session.get(DailyCheckRun, _day_start(NOW)) is not None
