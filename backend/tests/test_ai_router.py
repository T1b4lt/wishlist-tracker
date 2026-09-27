"""Tests for listing an Ollama instance's models."""

from src.ai.base import ProviderUnavailableError
from src.ai.ollama import OllamaModel
from src.services import ai_service


def test_lists_the_models_sorted_by_name(client, monkeypatch):
    seen = []

    async def fake_list_models(base_url):
        seen.append(base_url)
        return [
            OllamaModel("qwen3.8:latest", "27.3B", 27.3),
            OllamaModel("gemma4:e4b", "8.0B", 8.0),
            OllamaModel("mystery:latest", None, None),
        ]

    monkeypatch.setattr(ai_service, "list_models", fake_list_models)

    response = client.get("/ai/ollama/models", params={"url": "192.168.1.20:11434/"})

    assert response.status_code == 200
    assert seen == ["http://192.168.1.20:11434"]
    assert response.json() == {
        "models": [
            {
                "name": "gemma4:e4b",
                "parameter_size": "8.0B",
                "parameter_billions": 8.0,
                "is_small": True,
            },
            {
                "name": "mystery:latest",
                "parameter_size": None,
                "parameter_billions": None,
                "is_small": None,
            },
            {
                "name": "qwen3.8:latest",
                "parameter_size": "27.3B",
                "parameter_billions": 27.3,
                "is_small": False,
            },
        ],
        "small_model_threshold_b": 20,
    }


def test_unreachable_instance_returns_502(client, monkeypatch):
    async def down(base_url):
        raise ProviderUnavailableError("Could not reach Ollama at http://h:11434")

    monkeypatch.setattr(ai_service, "list_models", down)

    response = client.get("/ai/ollama/models", params={"url": "http://h:11434"})

    assert response.status_code == 502
    assert response.json()["detail"] == "Could not reach Ollama at http://h:11434"


def test_blank_url_returns_422(client):
    assert client.get("/ai/ollama/models", params={"url": "  "}).status_code == 422
    assert client.get("/ai/ollama/models").status_code == 422
