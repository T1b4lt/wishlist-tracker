"""Tests for the "provider temporarily unavailable" flow (Ollama switched off).

Stagehand is replaced by a fake ``get_product_status`` and the Ollama
preflight by a fake; the cronjob and the offer checks use the in-memory
database.
"""

import asyncio
from datetime import datetime, timedelta
from types import SimpleNamespace

import pytest
from sqlmodel import select
from src import product_status_cronjob as cronjob
from src.ai.base import ProviderUnavailableError
from src.ai.ollama import OllamaProvider
from src.models.database_models import (
    Category,
    Config,
    DailyCheckRun,
    OfferHist,
    PendingStatusRetry,
)
from src.services import offer_check_service as offer_check
from src.stagehand_utils import ProductStatusExtraction
from tests.factories import make_category, make_offer, make_product

NOW = datetime(2026, 9, 26, 12, 0)
DAY_START = int(datetime(2026, 9, 26).timestamp())


@pytest.fixture
def ollama(session, monkeypatch, tmp_path):
    """Select a configured Ollama provider, add two offers, fake the network."""
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    monkeypatch.setattr(offer_check, "engine", session.get_bind())
    monkeypatch.setattr(cronjob, "RUN_LOCK_FILE", str(tmp_path / "cronjob.lock"))
    for key, value in {
        "ai_provider": "ollama",
        "ollama_url": "http://ollama.local:11434",
        "ollama_model": "qwen3.8:latest",
    }.items():
        session.add(Config(key=key, value=value))
    session.commit()
    category = make_category(session)
    offers = [
        make_offer(
            session,
            make_product(session, category.id, name=f"P{i}").id,
            url=f"https://example.com/{i}",
        )
        for i in range(2)
    ]
    env = SimpleNamespace(
        offer_ids=[o.id for o in offers],
        up=True,  # Whether Ollama answers (preflight and chat).
        scraped=[],
        preflights=0,
    )
    session.commit()  # Release the connection before the cronjob uses it.

    async def fake_preflight(self):
        env.preflights += 1
        if not env.up:
            raise ProviderUnavailableError("Could not reach Ollama")

    async def fake_get_product_status(provider, url):
        env.scraped.append(url)
        if not env.up:
            raise provider._unavailable("ConnectError: refused")
        return ProductStatusExtraction(price=10.0, is_in_stock=True)

    monkeypatch.setattr(OllamaProvider, "preflight", fake_preflight)
    monkeypatch.setattr(offer_check, "get_product_status", fake_get_product_status)
    return env


def _run(now=NOW):
    asyncio.run(cronjob.fetch_and_store_product_status(now=now))


def _retry(now=NOW + timedelta(minutes=10)):
    asyncio.run(cronjob.retry_rate_limited_products(now=now))


def _run_row(session):
    session.expire_all()
    return session.get(DailyCheckRun, DAY_START)


def _pending_ids(session):
    session.expire_all()
    return {p.offer_id for p in session.exec(select(PendingStatusRetry)).all()}


def test_check_outcome_reasons():
    assert offer_check.CheckOutcome.RATE_LIMITED.limit_reason == "quota"
    assert offer_check.CheckOutcome.PROVIDER_UNAVAILABLE.limit_reason == "unavailable"
    assert offer_check.CheckOutcome.FAILED.limit_reason is None
    assert offer_check.CheckOutcome.PROVIDER_UNAVAILABLE.stops_run
    assert offer_check.CheckOutcome.RATE_LIMITED.stops_run
    assert not offer_check.CheckOutcome.STORED.stops_run


def test_full_run_with_ollama_down_leaves_every_offer_pending(session, ollama):
    ollama.up = False

    _run()

    assert ollama.scraped == []  # Preflight stopped it before opening Chrome.
    assert _pending_ids(session) == set(ollama.offer_ids)
    run = _run_row(session)
    assert run.limit_reason == "unavailable"
    assert run.limit_reached_at is not None
    assert run.pending_at_limit == 2


def test_outage_mid_run_stops_and_marks_the_rest_pending(session, ollama, monkeypatch):
    real = offer_check.get_product_status

    async def first_then_down(provider, url):
        result = await real(provider, url)
        ollama.up = False
        return result

    monkeypatch.setattr(offer_check, "get_product_status", first_then_down)

    _run()

    assert _pending_ids(session) == {ollama.offer_ids[1]}
    assert _run_row(session).limit_reason == "unavailable"


def test_retry_checks_the_pending_offers_once_ollama_is_back(session, ollama):
    ollama.up = False
    _run()
    ollama.up = True

    _retry()

    assert _pending_ids(session) == set()
    session.expire_all()
    assert len(session.exec(select(OfferHist)).all()) == 2
    assert _run_row(session).limit_reason == "unavailable"  # Snapshot kept.


def test_retry_while_still_down_keeps_everything_pending(session, ollama):
    ollama.up = False
    _run()

    _retry()

    assert _pending_ids(session) == set(ollama.offer_ids)
    assert ollama.scraped == []


def test_check_now_after_the_daily_run_marks_the_offer_pending(session, ollama):
    session.add(
        DailyCheckRun(day_start=DAY_START, started_at=DAY_START, total_offers=2)
    )
    session.commit()
    ollama.up = False

    asyncio.run(offer_check.check_offer_now(ollama.offer_ids[0], now=NOW))

    assert _pending_ids(session) == {ollama.offer_ids[0]}


def test_google_quota_still_records_a_quota_limit(session, ollama, monkeypatch):
    from stagehand.rpc_client import RPCError, _JSONRPCError

    session.exec(
        select(Config).where(Config.key == "ai_provider")
    ).one().value = "google_ai_studio"
    session.add(Config(key="google_api_key", value="key"))
    session.commit()

    async def quota(provider, url):
        raise RPCError(
            _JSONRPCError(
                code=-32603,
                message="AI_APICallError: You exceeded your current quota",
                data=None,
            )
        )

    monkeypatch.setattr(offer_check, "get_product_status", quota)

    _run()

    assert _run_row(session).limit_reason == "quota"
    assert ollama.preflights == 0


@pytest.fixture
def alerts(session, ollama, monkeypatch):
    """Configure Telegram and record the provider alerts sent."""
    for key, value in {"telegram_bot_token": "t", "telegram_bot_chat_id": "c"}.items():
        session.add(Config(key=key, value=value))
    session.commit()
    sent = []
    state = {"fail": False}

    async def fake_send(bot_token, chat_id, text):
        if state["fail"]:
            raise RuntimeError("telegram down")
        sent.append(text)

    monkeypatch.setattr(cronjob, "send_daily_check_report", fake_send)
    return SimpleNamespace(sent=sent, state=state)


def _alert(now=NOW):
    asyncio.run(cronjob.send_provider_alerts_if_due(now))


def test_down_alert_is_sent_once(session, ollama, alerts):
    ollama.up = False
    _run()
    _alert()
    _retry()
    _alert(NOW + timedelta(minutes=10))

    assert len(alerts.sent) == 1
    assert alerts.sent[0].startswith(
        "⚠️ I can't reach Ollama at http://ollama.local:11434 (model qwen3.8:latest)"
    )
    assert "2 prices are pending" in alerts.sent[0]
    assert _run_row(session).unavailable_alert_sent


def test_recovery_alert_once_nothing_is_pending(session, ollama, alerts):
    ollama.up = False
    _run()
    _alert()
    ollama.up = True
    _retry()
    _alert(NOW + timedelta(minutes=10))
    _alert(NOW + timedelta(minutes=20))

    assert len(alerts.sent) == 2
    assert alerts.sent[1] == "✅ Ollama is available again: 2 prices checked."
    assert _run_row(session).recovered_alert_sent


def test_second_outage_the_same_day_sends_nothing(session, ollama, alerts):
    ollama.up = False
    _run()
    _alert()
    ollama.up = True
    _retry()
    _alert()
    run = _run_row(session)
    session.add(PendingStatusRetry(offer_id=ollama.offer_ids[0], day_start=DAY_START))
    session.commit()
    ollama.up = False
    _retry(NOW + timedelta(minutes=30))
    _alert(NOW + timedelta(minutes=30))

    assert len(alerts.sent) == 2
    assert run.unavailable_alert_sent


def test_failed_down_alert_is_retried(session, ollama, alerts):
    ollama.up = False
    _run()
    alerts.state["fail"] = True
    _alert()
    assert not _run_row(session).unavailable_alert_sent
    alerts.state["fail"] = False
    _alert()
    assert len(alerts.sent) == 1


def test_no_alerts_without_telegram(session, ollama, monkeypatch):
    sent = []

    async def fake_send(bot_token, chat_id, text):
        sent.append(text)

    monkeypatch.setattr(cronjob, "send_daily_check_report", fake_send)
    ollama.up = False
    _run()
    _alert()

    assert sent == []
    assert not _run_row(session).unavailable_alert_sent


def test_no_down_alert_when_the_limit_is_a_quota(session, ollama, alerts):
    session.add(
        DailyCheckRun(
            day_start=DAY_START,
            started_at=DAY_START,
            total_offers=2,
            limit_reached_at=DAY_START + 60,
            pending_at_limit=2,
            limit_reason="quota",
        )
    )
    session.add(PendingStatusRetry(offer_id=ollama.offer_ids[0], day_start=DAY_START))
    session.commit()

    _alert()

    assert alerts.sent == []


def test_recovery_alert_after_switching_back_to_google(session, ollama, alerts):
    ollama.up = False
    _run()
    _alert()
    session.exec(
        select(Config).where(Config.key == "ai_provider")
    ).one().value = "google_ai_studio"
    session.exec(PendingStatusRetry.__table__.delete())
    session.commit()

    _alert(NOW + timedelta(minutes=10))

    assert (
        alerts.sent[-1] == "✅ Google AI Studio is available again: 0 prices checked."
    )


def test_main_sends_the_provider_alert(session, ollama, alerts):
    ollama.up = False
    asyncio.run(cronjob.main(now=NOW))

    assert any(text.startswith("⚠️ I can't reach Ollama") for text in alerts.sent)


# --- Final review fixes ---


def test_a_timeout_while_the_instance_is_up_only_fails_that_offer(
    session, ollama, monkeypatch
):
    real = offer_check.get_product_status
    slow_url = "https://example.com/0"

    async def one_slow_page(provider, url):
        if url == slow_url:
            raise provider._unavailable("ReadTimeout: slow")
        return await real(provider, url)

    monkeypatch.setattr(offer_check, "get_product_status", one_slow_page)

    _run()

    assert _pending_ids(session) == set()
    assert _run_row(session).limit_reason is None
    session.expire_all()
    assert len(session.exec(select(OfferHist)).all()) == 1


def test_malformed_url_leaves_the_day_pending_instead_of_crashing(
    session, ollama, monkeypatch
):
    monkeypatch.undo()  # Real preflight against a malformed URL.
    monkeypatch.setattr(cronjob, "engine", session.get_bind())
    monkeypatch.setattr(offer_check, "engine", session.get_bind())
    session.exec(
        select(Config).where(Config.key == "ollama_url")
    ).one().value = "192.168.1.20:11434:x"
    session.commit()

    _run()

    assert _pending_ids(session) == set(ollama.offer_ids)
    assert _run_row(session).limit_reason == "unavailable"


def test_outage_after_a_clean_run_sends_the_down_alert(session, ollama, alerts):
    _run()
    assert _pending_ids(session) == set()
    ollama.up = False
    category_id = session.exec(select(Category)).first().id
    offer = make_offer(
        session,
        make_product(session, category_id, name="New").id,
        url="https://example.com/new",
    )
    session.commit()

    asyncio.run(offer_check.check_offer_now(offer.id, now=NOW + timedelta(hours=1)))
    _alert(NOW + timedelta(hours=1))

    assert len(alerts.sent) == 1
    assert alerts.sent[0].startswith("⚠️ I can't reach Ollama")


def test_outage_after_a_quota_stop_sends_the_down_alert(session, ollama, alerts):
    session.add(
        DailyCheckRun(
            day_start=DAY_START,
            started_at=DAY_START,
            total_offers=2,
            limit_reached_at=DAY_START + 60,
            pending_at_limit=2,
            limit_reason="quota",
        )
    )
    for offer_id in ollama.offer_ids:
        session.add(PendingStatusRetry(offer_id=offer_id, day_start=DAY_START))
    session.commit()
    ollama.up = False

    _retry()
    _alert(NOW + timedelta(minutes=10))

    assert len(alerts.sent) == 1
    run = _run_row(session)
    assert run.limit_reason == "quota"  # The first stop's snapshot is kept.
    assert run.provider_unavailable_at is not None
