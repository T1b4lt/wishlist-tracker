"""Tests for the computed ``telegram_status`` field on /config/."""


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
