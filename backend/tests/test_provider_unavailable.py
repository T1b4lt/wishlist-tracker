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
