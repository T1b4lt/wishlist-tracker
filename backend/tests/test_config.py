"""Tests for /config/: telegram_status and the historical window size."""

import pytest
from src.core.config import get_hist_window_size
from src.models.database_models import Config


def test_telegram_status_not_configured_when_no_token(client):
    response = client.get("/config/")

    assert response.status_code == 200
    assert response.json()["telegram_status"] == "not_configured"


def test_telegram_status_token_only_when_missing_chat_id(client):
    client.patch("/config/", json={"telegram_bot_token": "abc123"})

    response = client.get("/config/")

    assert response.json()["telegram_status"] == "token_only"


def test_telegram_status_connected_when_token_and_chat_id_set(client):
    client.patch(
        "/config/",
        json={"telegram_bot_token": "abc123", "telegram_bot_chat_id": "999"},
    )

    response = client.get("/config/")

    assert response.json()["telegram_status"] == "connected"


def _store_hist_window_size(session, value):
    session.add(Config(key="hist_window_size", value=value))
    session.commit()


@pytest.mark.parametrize("value", [30, 60, 90, 180])
def test_hist_window_size_accepts_every_option(client, value):
    response = client.patch("/config/", json={"hist_window_size": value})

    assert response.status_code == 200
    assert response.json()["hist_window_size"] == value


@pytest.mark.parametrize("value", [45, 0, 365])
def test_hist_window_size_rejects_values_outside_the_options(client, value):
    response = client.patch("/config/", json={"hist_window_size": value})

    assert response.status_code == 422


def test_hist_window_size_defaults_to_60_when_missing(session):
    assert get_hist_window_size(session) == 60


@pytest.mark.parametrize("stored", ["abc", "", "0", "-5"])
def test_corrupt_hist_window_size_falls_back_to_default(client, session, stored):
    _store_hist_window_size(session, stored)

    assert get_hist_window_size(session) == 60
    assert client.get("/config/").json()["hist_window_size"] == 60


def test_off_list_stored_hist_window_size_falls_back_to_default(client, session):
    _store_hist_window_size(session, "45")

    assert get_hist_window_size(session) == 60
    assert client.get("/config/").json()["hist_window_size"] == 60


def test_config_exposes_the_options_and_the_stale_threshold(client):
    data = client.get("/config/").json()

    assert data["hist_window_options"] == [30, 60, 90, 180]
    assert data["daily_check_report_options"] == ["off", "limit_days", "every_day"]
    assert data["stale_after_days"] == 3


def test_daily_check_report_defaults_to_limit_days(client):
    assert client.get("/config/").json()["daily_check_report"] == "limit_days"


@pytest.mark.parametrize("value", ["off", "limit_days", "every_day"])
def test_daily_check_report_accepts_every_option(client, value):
    response = client.patch("/config/", json={"daily_check_report": value})

    assert response.status_code == 200
    assert response.json()["daily_check_report"] == value


@pytest.mark.parametrize("value", ["always", "", "OFF"])
def test_daily_check_report_rejects_other_values(client, value):
    response = client.patch("/config/", json={"daily_check_report": value})

    assert response.status_code == 422


def test_corrupt_daily_check_report_falls_back_to_default(client, session):
    session.add(Config(key="daily_check_report", value="weekly"))
    session.commit()

    assert client.get("/config/").json()["daily_check_report"] == "limit_days"
