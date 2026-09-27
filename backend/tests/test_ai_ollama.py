"""Tests for the Ollama provider. HTTP is served by ``httpx.MockTransport``."""

import asyncio
import json

import httpx
import pytest
from src.ai.base import ProviderErrorKind, ProviderUnavailableError
from src.ai.ollama import (
    OllamaModel,
    OllamaProvider,
    list_models,
    normalize_ollama_url,
    parse_parameter_billions,
    sanitize_schema,
)
from stagehand import LLMStructuredGenerateParams, LLMStructuredGenerateResult
from stagehand.rpc_client import RPCError, _JSONRPCError

URL = "http://ollama.local:11434"

TAGS = {
    "models": [
        {"name": "qwen3.8:latest", "details": {"parameter_size": "27.3B"}},
        {"name": "gemma4:e4b", "details": {"parameter_size": "8.0B"}},
        {"name": "mystery:latest", "details": {}},
    ]
}

ACT_SCHEMA = {
    "type": "object",
    "properties": {
        "elementId": {"type": "string", "pattern": "^\\d+-\\d+$"},
        "items": {"type": "array", "items": {"type": "string", "pattern": "\\d"}},
    },
}


def _params(**overrides):
    data = {
        "messages": [
            {"role": "user", "content": {"type": "text", "text": "Find the price"}},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "Page:"},
                    {"type": "image", "data": "aGVsbG8=", "mime_type": "image/png"},
                ],
            },
        ],
        "system_prompt": "You extract data",
        "temperature": 0.1,
        "response_format": {"type": "json_schema", "name": "Act", "schema": ACT_SCHEMA},
    }
    data.update(overrides)
    return LLMStructuredGenerateParams.model_validate(data)


def _chat_ok(requests):
    def handler(request):
        requests.append(json.loads(request.content))
        return httpx.Response(
            200,
            json={
                "message": {"role": "assistant", "content": '{"price": 78.5}'},
                "prompt_eval_count": 100,
                "eval_count": 7,
            },
        )

    return httpx.MockTransport(handler)


def _provider(handler, model="qwen3.8:latest"):
    return OllamaProvider(URL, model, transport=httpx.MockTransport(handler))


def _rpc_error(message="Ollama at ... is unavailable"):
    return RPCError(_JSONRPCError(code=-32603, message=message, data=None))


# --- Helpers ---


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("192.168.1.20:11434", "http://192.168.1.20:11434"),
        ("  http://192.168.1.20:11434/ ", "http://192.168.1.20:11434"),
        ("https://ollama.example.com//", "https://ollama.example.com"),
        ("", ""),
        ("   ", ""),
    ],
)
def test_normalize_ollama_url(raw, expected):
    assert normalize_ollama_url(raw) == expected


@pytest.mark.parametrize(
    ("size", "expected"),
    [
        ("27.3B", 27.3),
        ("8.0B", 8.0),
        ("567M", 0.567),
        ("1.5T", 1500.0),
        (" 20b ", 20.0),
        ("", None),
        (None, None),
        ("huge", None),
    ],
)
def test_parse_parameter_billions(size, expected):
    result = parse_parameter_billions(size)
    assert result == (pytest.approx(expected) if expected is not None else None)


@pytest.mark.parametrize(
    ("billions", "expected"), [(27.3, False), (20.0, False), (19.9, True), (None, None)]
)
def test_is_small_uses_the_20b_threshold(billions, expected):
    assert OllamaModel("m", None, billions).is_small is expected


def test_sanitize_schema_rewrites_digit_classes_in_patterns_only():
    schema = {**ACT_SCHEMA, "description": "ids look like \\d-\\d"}
    sanitized = sanitize_schema(schema)
    assert sanitized["properties"]["elementId"]["pattern"] == "^[0-9]+-[0-9]+$"
    assert sanitized["properties"]["items"]["items"]["pattern"] == "[0-9]"
    assert sanitized["description"] == "ids look like \\d-\\d"
    assert ACT_SCHEMA["properties"]["elementId"]["pattern"] == "^\\d+-\\d+$"


# --- list_models / preflight ---


def test_list_models_reads_tags():
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=TAGS))
    models = asyncio.run(list_models(URL, transport=transport))
    assert models == [
        OllamaModel("qwen3.8:latest", "27.3B", 27.3),
        OllamaModel("gemma4:e4b", "8.0B", 8.0),
        OllamaModel("mystery:latest", None, None),
    ]


@pytest.mark.parametrize(
    "handler",
    [
        lambda request: (_ for _ in ()).throw(httpx.ConnectError("refused")),
        lambda request: httpx.Response(500, text="boom"),
        lambda request: httpx.Response(200, text="not json"),
    ],
)
def test_list_models_raises_unavailable(handler):
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(list_models(URL, transport=httpx.MockTransport(handler)))


def test_preflight_passes_when_the_model_is_listed():
    provider = _provider(lambda request: httpx.Response(200, json=TAGS))
    asyncio.run(provider.preflight())


def test_preflight_fails_when_the_model_is_missing():
    provider = _provider(lambda request: httpx.Response(200, json=TAGS), model="x:1")
    with pytest.raises(ProviderUnavailableError, match="x:1"):
        asyncio.run(provider.preflight())


def test_preflight_failure_does_not_mark_the_next_error_as_unavailable():
    provider = _provider(lambda request: httpx.Response(500))
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(provider.preflight())
    assert provider.classify_error(ValueError("bad json")) is None


# --- Configuration ---


@pytest.mark.parametrize(
    ("url", "model", "expected"),
    [(URL, "m", True), ("", "m", False), (URL, "", False)],
)
def test_is_configured_needs_url_and_model(url, model, expected):
    assert OllamaProvider(url, model).is_configured() is expected


def test_names_and_description():
    provider = OllamaProvider("192.168.1.20:11434/", "qwen3.8:latest")
    assert provider.name == "ollama"
    assert provider.label == "Ollama"
    assert provider.base_url == "http://192.168.1.20:11434"
    assert provider.describe() == (
        "Ollama at http://192.168.1.20:11434 (model qwen3.8:latest)"
    )
    assert provider.not_configured_message == (
        "Ollama is not configured. Please set its URL and model in Settings."
    )


def test_stagehand_options_pass_a_callback():
    options = OllamaProvider(URL, "m").stagehand_options()
    assert set(options) == {"model"}
    assert callable(options["model"])


# --- The Stagehand callback ---


def test_generate_forwards_the_request_to_api_chat():
    requests = []
    provider = OllamaProvider(URL, "qwen3.8:latest", transport=_chat_ok(requests))
    generate = provider.stagehand_options()["model"]

    result = asyncio.run(generate(_params()))

    (body,) = requests
    assert body["model"] == "qwen3.8:latest"
    assert body["stream"] is False
    assert body["think"] is False
    assert body["options"] == {"temperature": 0.1}
    assert body["messages"] == [
        {"role": "system", "content": "You extract data"},
        {"role": "user", "content": "Find the price"},
        {"role": "user", "content": "Page:", "images": ["aGVsbG8="]},
    ]
    assert body["format"]["properties"]["elementId"]["pattern"] == "^[0-9]+-[0-9]+$"
    assert isinstance(result, LLMStructuredGenerateResult)
    assert result.structured_content.model_dump() == {"price": 78.5}
    assert result.usage.input_tokens == 100
    assert result.usage.output_tokens == 7
    assert result.usage.total_tokens == 107


def test_generate_omits_temperature_when_not_set():
    requests = []
    provider = OllamaProvider(URL, "m", transport=_chat_ok(requests))
    asyncio.run(provider.stagehand_options()["model"](_params(temperature=None)))
    assert requests[0]["options"] == {}


@pytest.mark.parametrize(
    "handler",
    [
        lambda request: (_ for _ in ()).throw(httpx.ConnectError("refused")),
        lambda request: (_ for _ in ()).throw(httpx.ReadTimeout("slow")),
        lambda request: httpx.Response(503, text="loading"),
        lambda request: httpx.Response(404, json={"error": "model 'm' not found"}),
    ],
)
def test_outages_are_unavailable(handler):
    provider = _provider(handler)
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(provider.stagehand_options()["model"](_params()))
    # Stagehand wraps the callback's error in an RPCError before it reaches us.
    assert provider.classify_error(_rpc_error()) is ProviderErrorKind.UNAVAILABLE


def test_classify_error_consumes_the_recorded_failure():
    provider = _provider(lambda request: httpx.Response(503))
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(provider.stagehand_options()["model"](_params()))
    assert provider.classify_error(_rpc_error()) is ProviderErrorKind.UNAVAILABLE
    assert provider.classify_error(_rpc_error("other")) is None


def test_bad_request_is_an_ordinary_failure():
    provider = _provider(lambda request: httpx.Response(400, json={"error": "bad"}))
    with pytest.raises(RuntimeError, match="400"):
        asyncio.run(provider.stagehand_options()["model"](_params()))
    assert provider.classify_error(_rpc_error("Ollama returned HTTP 400")) is None


def test_invalid_json_is_not_unavailable():
    provider = _provider(
        lambda request: httpx.Response(
            200, json={"message": {"role": "assistant", "content": "not json"}}
        )
    )
    with pytest.raises(ValueError):
        asyncio.run(provider.stagehand_options()["model"](_params()))
    assert provider.classify_error(_rpc_error("Expecting value")) is None


def test_unavailable_error_itself_is_classified():
    provider = OllamaProvider(URL, "m")
    error = ProviderUnavailableError("down")
    assert provider.classify_error(error) is ProviderErrorKind.UNAVAILABLE


def test_non_structured_requests_are_rejected():
    provider = OllamaProvider(URL, "m")
    params = type("Params", (), {"response_format": None})()
    with pytest.raises(TypeError):
        asyncio.run(provider.stagehand_options()["model"](params))


# --- Malformed URLs and unexpected answers (final review) ---


@pytest.mark.parametrize("url", ["192.168.1.20:11434:x", "http://[::1"])
def test_list_models_with_a_malformed_url_is_unavailable(url):
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(list_models(url))


@pytest.mark.parametrize(
    "body",
    [{"models": None}, {"models": [{"details": {}}]}, ["not", "a", "dict"]],
)
def test_list_models_with_an_unexpected_answer_is_unavailable(body):
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=body))
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(list_models(URL, transport=transport))


def test_generate_with_a_malformed_url_is_unavailable():
    provider = OllamaProvider("http://[::1", "m")
    with pytest.raises(ProviderUnavailableError):
        asyncio.run(provider.stagehand_options()["model"](_params()))
    assert provider.classify_error(_rpc_error()) is ProviderErrorKind.UNAVAILABLE
