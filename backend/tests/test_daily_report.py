"""Tests for the Telegram daily check report (messages and when it is sent)."""

import asyncio
from datetime import datetime, timedelta

import pytest
from sqlmodel import select
from src import product_status_cronjob as cronjob
from src.core.local_day import local_day_bounds
from src.models.database_models import (
    Category,
    Config,
    DailyCheckRun,
    Offer,
    OfferHist,
    PendingStatusRetry,
    Product,
)
from src.telegram_utils import build_daily_done_message, build_daily_unchecked_message

NOW = datetime(2026, 9, 26, 12, 30)
DAY_START, _ = local_day_bounds(NOW)
LIMIT_AT = int(datetime(2026, 9, 26, 12, 3).timestamp())


# --- Messages ---


def test_done_message_on_a_normal_day():
    assert build_daily_done_message("english", 40, 40, 0, None, None) == (
        "✅ Daily check completed: 40 of 40 prices recorded."
    )


def test_done_message_on_a_limit_day_with_failures():
    assert build_daily_done_message("english", 38, 40, 2, "12:03", 15) == (
        "✅ Daily check completed: 38 of 40 prices recorded (2 failed).\n"
        "Gemini limit reached at 12:03 with 15 prices left; finished by retrying."
    )


def test_unchecked_message():
    assert build_daily_unchecked_message("english", 12, 40, "12:03", 15) == (
        "⚠️ 12 of 40 prices could not be checked today: the Gemini limit was "
        "reached at 12:03 with 15 prices left. Tomorrow's run will check them first."
    )


def test_messages_in_spanish():
    assert build_daily_done_message("spanish", 38, 40, 2, "12:03", 15) == (
        "✅ Revisión diaria completada: 38 de 40 precios registrados (2 fallidos).\n"
        "Límite de Gemini alcanzado a las 12:03 con 15 precios pendientes; "
        "completada con reintentos."
    )
    assert build_daily_unchecked_message("spanish", 12, 40, "12:03", 15) == (
        "⚠️ 12 de 40 precios no se han podido revisar hoy: el límite de Gemini se "
        "alcanzó a las 12:03 con 15 precios pendientes. Mañana se revisarán primero."
    )


def test_unknown_language_falls_back_to_english():
    assert build_daily_done_message("klingon", 1, 1, 0, None, None).startswith(
        "✅ Daily check completed"
    )


# --- When it is sent ---


@pytest.fixture
def report(session, monkeypatch):
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    for key, value in {
        "telegram_bot_token": "token",
        "telegram_bot_chat_id": "chat",
        "daily_check_report": "limit_days",
    }.items():
        session.add(Config(key=key, value=value))
    category = Category(name="Electronics", color="#FF0000")
    session.add(category)
    session.commit()
    products = [
        Product(name=f"P{i}", priority="low", category_id=category.id, description="x")
        for i in range(3)
    ]
    session.add_all(products)
    session.commit()
    products = [
        Offer(product_id=p.id, url=f"https://example.com/{i}", currency="EUR")
        for i, p in enumerate(products)
    ]
    session.add_all(products)
    session.commit()
    ids = [p.id for p in products]
    session.commit()  # Release the connection before the cronjob uses it.

    sent = []
    state = {"fail": False}

    async def fake_send(bot_token, chat_id, text):
        if state["fail"]:
            raise RuntimeError("telegram down")
        sent.append(text)

    monkeypatch.setattr(cronjob, "send_daily_check_report", fake_send)
    return {"ids": ids, "sent": sent, "state": state}


def _set_config(session, key, value):
    session.exec(select(Config).where(Config.key == key)).one().value = value
    session.commit()


def _add_run(session, limit=True, total=3):
    session.add(
        DailyCheckRun(
            day_start=DAY_START,
            started_at=int(NOW.replace(minute=0).timestamp()),
            total_offers=total,
            limit_reached_at=LIMIT_AT if limit else None,
            pending_at_limit=2 if limit else None,
        )
    )
    session.commit()


def _record(session, product_id):
    session.add(
        OfferHist(
            offer_id=product_id, price=1.0, is_in_stock=True, timestamp=DAY_START + 60
        )
    )
    session.commit()


def _pending(session, product_id):
    session.add(PendingStatusRetry(offer_id=product_id, day_start=DAY_START))
    session.commit()


def _send(now=NOW):
    asyncio.run(cronjob.send_daily_report_if_due(now))


def _report_sent(session):
    session.expire_all()
    return session.get(DailyCheckRun, DAY_START).report_sent


def test_limit_day_sends_done_once_nothing_is_pending(session, report):
    _add_run(session)
    for product_id in report["ids"]:
        _record(session, product_id)

    _send()
    _send(NOW + timedelta(minutes=10))

    assert report["sent"] == [build_daily_done_message("english", 3, 3, 0, "12:03", 2)]
    assert _report_sent(session) is True


def test_limit_day_waits_while_products_are_pending(session, report):
    _add_run(session)
    _record(session, report["ids"][0])
    _pending(session, report["ids"][1])

    _send()

    assert report["sent"] == []
    assert _report_sent(session) is False


def test_limit_day_sends_unchecked_at_the_end_of_the_day(session, report):
    _add_run(session)
    _record(session, report["ids"][0])
    _pending(session, report["ids"][1])
    _pending(session, report["ids"][2])

    _send(NOW.replace(hour=23, minute=50))

    assert report["sent"] == [
        build_daily_unchecked_message("english", 2, 3, "12:03", 2)
    ]


def test_limit_days_mode_sends_nothing_on_a_normal_day(session, report):
    _add_run(session, limit=False)
    for product_id in report["ids"]:
        _record(session, product_id)

    _send()

    assert report["sent"] == []


def test_every_day_mode_sends_done_on_a_normal_day_with_failures(session, report):
    _set_config(session, "daily_check_report", "every_day")
    _add_run(session, limit=False)
    _record(session, report["ids"][0])

    _send()

    assert report["sent"] == [build_daily_done_message("english", 1, 3, 2, None, None)]


def test_report_follows_the_selected_language(session, report):
    session.add(Config(key="selected_language", value="spanish"))
    session.commit()
    _add_run(session)
    for product_id in report["ids"]:
        _record(session, product_id)

    _send()

    assert report["sent"] == [build_daily_done_message("spanish", 3, 3, 0, "12:03", 2)]


def test_off_mode_sends_nothing(session, report):
    _set_config(session, "daily_check_report", "off")
    _add_run(session)

    _send(NOW.replace(hour=23, minute=55))

    assert report["sent"] == []


def test_nothing_is_sent_without_telegram(session, report):
    _set_config(session, "telegram_bot_chat_id", "")
    _add_run(session)

    _send()

    assert report["sent"] == []


def test_nothing_is_sent_before_todays_run(session, report):
    _send()

    assert report["sent"] == []


def test_failed_report_send_is_retried_next_run(session, report):
    _add_run(session)
    report["state"]["fail"] = True

    _send()
    assert _report_sent(session) is False

    report["state"]["fail"] = False
    _send(NOW + timedelta(minutes=10))
    assert len(report["sent"]) == 1
    assert _report_sent(session) is True


def test_report_counts_never_go_negative_when_products_are_deleted(session, report):
    _set_config(session, "daily_check_report", "every_day")
    _add_run(session, limit=False, total=1)
    _record(session, report["ids"][0])
    _record(session, report["ids"][1])

    _send()

    assert report["sent"] == [build_daily_done_message("english", 2, 1, 0, None, None)]
