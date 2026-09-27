"""Tests for picking the active AI provider from the config."""

from src.ai.factory import load_ai_provider
from src.ai.google_ai_studio import GoogleAIStudioProvider
from src.ai.ollama import OllamaProvider
from src.models.database_models import Config


def _set(session, **values):
    for key, value in values.items():
        session.add(Config(key=key, value=value))
    session.commit()


def test_defaults_to_google_when_the_key_is_missing(session):
    _set(session, google_api_key="key")
    provider = load_ai_provider(session)
    assert isinstance(provider, GoogleAIStudioProvider)
    assert provider.stagehand_options()["model_api_key"] == "key"


def test_unknown_provider_falls_back_to_google(session):
    _set(session, ai_provider="openai", google_api_key="key")
    assert isinstance(load_ai_provider(session), GoogleAIStudioProvider)


def test_google_without_key_is_not_configured(session):
    assert not load_ai_provider(session).is_configured()


def test_ollama_uses_its_url_and_model(session):
    _set(
        session,
        ai_provider="ollama",
        ollama_url="http://192.168.1.20:11434",
        ollama_model="qwen3.8:latest",
        google_api_key="key",
    )
    provider = load_ai_provider(session)
    assert isinstance(provider, OllamaProvider)
    assert provider.base_url == "http://192.168.1.20:11434"
    assert provider.model == "qwen3.8:latest"
    assert provider.is_configured()


def test_ollama_without_model_is_not_configured(session):
    _set(session, ai_provider="ollama", ollama_url="http://h:11434")
    assert not load_ai_provider(session).is_configured()
