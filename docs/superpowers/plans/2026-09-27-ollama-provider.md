# Ollama AI Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the user pick Google AI Studio (default, unchanged) or a self-hosted Ollama instance as the AI provider behind Stagehand, and turn the Gemini quota-retry flow into a provider-agnostic "provider temporarily unavailable" flow with Telegram alerts.

**Architecture:** A new `src/ai/` package holds an `AIProvider` strategy per provider (`GoogleAIStudioProvider`, `OllamaProvider`) plus a factory that reads the config. Every consumer (`stagehand_utils`, `offer_check_service`, the cronjob, `product_service`) receives an `AIProvider` instead of a Google key and never branches on the provider. Errors are classified by the provider into quota exhaustion or unavailability; both stop a pass and reuse `PendingStatusRetry`, with the reason stored in `DailyCheckRun.limit_reason`.

**Tech Stack:** Python 3.12, FastAPI, SQLModel, Alembic, Stagehand v4 Python SDK, httpx, pytest; React 19, Chakra UI v3, zustand, i18next, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-09-27-ollama-provider-design.md`

## Global Constraints

- Google AI Studio stays the default provider and the fallback for a missing or unknown `ai_provider` value.
- No regression on the Google path: same model (`google/gemini-flash-lite-latest`), same quota detection, same log lines, same 400 message ("Google API key not configured. Please set it in Settings."), same Telegram/dashboard "Gemini limit" texts.
- Config values: `ai_provider` ∈ `("google_ai_studio", "ollama")`; keys `ollama_url`, `ollama_model` default `""`.
- Small-model threshold: `SMALL_MODEL_THRESHOLD_B = 20` (billions of parameters).
- Ollama timeouts: 600 s per `/api/chat` request, 10 s for `/api/tags`.
- `limit_reason` values: `"quota"` | `"unavailable"`.
- Pre-release database: new `DailyCheckRun` columns go into the baseline migration `backend/migrations/versions/20260927_e4c87bf1c218_initial_schema.py`; no new revision, no backfill.
- Backend is the single source of truth (AGENTS.md): the frontend only presents what the backend returns (model sizes, `is_small`, options).
- Everything (code, comments, docs) in English; user-facing strings in `english.json` and `spanish.json`.
- Commit messages follow Conventional Commits (a pre-commit hook enforces it). Work on branch `feat/ollama-provider`.
- Backend commands run from `backend/` (`uv run pytest`, `uv run ruff check .`, `uv run ruff format .`); frontend from `frontend/` (`npx vitest run <path>`, `npm run lint`, `npm run format`).

## Review Focus

- **Ollama answers with invalid JSON or a schema mismatch** (small models): must be an ordinary `FAILED` check for that offer, never `PROVIDER_UNAVAILABLE` (otherwise the whole day stalls on retries). Pinned in Task 2 (`test_invalid_json_is_not_unavailable`).
- **The unavailability flag leaking into the next offer:** after an Ollama outage error is classified, the next unrelated error must not be classified as unavailable. Pinned in Task 2 (`test_classify_error_consumes_the_recorded_failure`).
- **A saved Ollama URL typed without scheme or with a trailing slash** (`192.168.1.20:11434/`): must work both when saving and when listing models. Pinned in Task 2 (`normalize_ollama_url` cases) and Task 7 (router normalizes).
- **Switching back to Google on a day Ollama was down:** the recovery alert must still be sent once pending offers are checked, and no down alert may be sent for Google. Pinned in Task 6 (`test_no_down_alert_when_the_limit_is_a_quota`).
- **A saved model that no longer exists on the instance:** the settings dropdown must still show it (marked not available) instead of silently blanking it, which would save `""`. Pinned in Task 8 (`keeps a saved model missing from the instance`).

---

## File Structure

**Backend — create**
- `backend/src/ai/__init__.py` — package docstring.
- `backend/src/ai/base.py` — `AIProvider` ABC, `ProviderErrorKind`, `ProviderUnavailableError`.
- `backend/src/ai/google_ai_studio.py` — `GoogleAIStudioProvider`, `MODEL_NAME`, `QUOTA_ERROR_PATTERN`.
- `backend/src/ai/ollama.py` — `OllamaProvider`, `OllamaModel`, `list_models`, `normalize_ollama_url`, `parse_parameter_billions`, `sanitize_schema`, constants.
- `backend/src/ai/factory.py` — `load_ai_provider(session)`.
- `backend/src/schemas/ai.py` — `OllamaModelResponse`, `OllamaModelsResponse`.
- `backend/src/services/ai_service.py` — `list_ollama_models(url)`.
- `backend/src/routers/ai_router.py` — `GET /ai/ollama/models`.
- `backend/tests/test_ai_google.py`, `test_ai_ollama.py`, `test_ai_factory.py`, `test_ai_router.py`, `test_provider_unavailable.py`.

**Backend — modify**
- `src/core/config.py`, `src/schemas/config.py`, `src/services/config_service.py` — provider config.
- `src/stagehand_utils.py` — take an `AIProvider`.
- `src/services/offer_check_service.py` — provider plumbing, `PROVIDER_UNAVAILABLE`.
- `src/product_status_cronjob.py` — provider plumbing, preflight, `limit_reason`, provider alerts.
- `src/services/product_service.py` — provider plumbing, 503.
- `src/models/database_models.py` + baseline migration — `DailyCheckRun` columns.
- `src/telegram_utils.py` — texts by reason, provider alerts.
- `src/schemas/daily_check.py`, `src/services/daily_check_service.py` — `limit_reason`.
- `src/api.py` — register `ai_router`.
- Existing tests: `test_extraction.py`, `test_config.py`, `test_daily_report.py`, `test_daily_check.py`.

**Backend — delete**: `backend/src/ollama_stagehand.py` (untracked spike script).

**Frontend — create**
- `src/lib/api/ai.js`, `src/hooks/useOllamaModels.js`, `src/components/settings/AIProviderSection.jsx` (+ tests).

**Frontend — modify**
- `src/lib/api/index.js`, `src/lib/settingsDraft.js`, `src/pages/SettingsPage.jsx`, `src/components/settings/{GeneralSection,SettingsNav,index}.jsx|js`, `src/components/dashboard/DailyCheckNotice.jsx`, `src/i18n/{english,spanish}.json`, `e2e/fixtures/config.js`, `e2e/support/apiMock.js`, `e2e/settings.spec.js`, and the tests of each.

**Docs**: `README.md`.

---

### Task 1: AI provider interface and the Google AI Studio provider

**Files:**
- Create: `backend/src/ai/__init__.py`, `backend/src/ai/base.py`, `backend/src/ai/google_ai_studio.py`
- Modify: `backend/src/stagehand_utils.py` (constants move out)
- Test: `backend/tests/test_ai_google.py`

**Interfaces:**
- Produces:
  - `src.ai.base.ProviderErrorKind` (Enum: `QUOTA_EXHAUSTED`, `UNAVAILABLE`)
  - `src.ai.base.ProviderUnavailableError(Exception)`
  - `src.ai.base.AIProvider` with class attributes `name: str`, `label: str`, `not_configured_message: str` and methods `is_configured() -> bool`, `describe() -> str`, `stagehand_options() -> dict[str, Any]`, `async preflight() -> None`, `classify_error(error: BaseException) -> ProviderErrorKind | None`
  - `src.ai.google_ai_studio.GoogleAIStudioProvider(api_key: str)`, `MODEL_NAME`, `QUOTA_ERROR_PATTERN`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_ai_google.py`:

```python
"""Tests for the Google AI Studio provider (the default, pre-existing path)."""

import asyncio

import pytest
from src.ai.base import ProviderErrorKind
from src.ai.google_ai_studio import MODEL_NAME, GoogleAIStudioProvider
from stagehand.rpc_client import RPCError, _JSONRPCError

# Message raised by Stagehand when Gemini answers 429 RESOURCE_EXHAUSTED
# (captured from a real free-tier quota error).
QUOTA_MESSAGE = (
    "Failed after 3 attempts. Last error: AI_APICallError: You exceeded your "
    "current quota, please check your plan and billing details. For more "
    "information on this error, head to: "
    "https://ai.google.dev/gemini-api/docs/rate-limits. To monitor your current "
    "usage, head to: https://ai.dev/rate-limit. \n* Quota exceeded for metric: "
    "generativelanguage.googleapis.com/generate_content_free_tier_requests, "
    "limit: 5, model: gemini-2.5-flash\nPlease retry in 10.598793198s."
)


def _rpc_error(message):
    return RPCError(
        _JSONRPCError(code=-32603, message=message, data={"name": "AI_RetryError"})
    )


def test_stagehand_options_use_the_gemini_model_and_the_key():
    provider = GoogleAIStudioProvider("key")
    assert provider.stagehand_options() == {
        "model": MODEL_NAME,
        "model_api_key": "key",
    }
    assert MODEL_NAME == "google/gemini-flash-lite-latest"


@pytest.mark.parametrize(("api_key", "expected"), [("key", True), ("", False)])
def test_is_configured_needs_an_api_key(api_key, expected):
    assert GoogleAIStudioProvider(api_key).is_configured() is expected


def test_names_and_messages():
    provider = GoogleAIStudioProvider("key")
    assert provider.name == "google_ai_studio"
    assert provider.label == "Google AI Studio"
    assert provider.describe() == "Google AI Studio"
    assert provider.not_configured_message == (
        "Google API key not configured. Please set it in Settings."
    )


def test_preflight_is_a_no_op():
    assert asyncio.run(GoogleAIStudioProvider("key").preflight()) is None


@pytest.mark.parametrize(
    "message",
    [
        QUOTA_MESSAGE,
        "AI_APICallError: 429 Too Many Requests",
        "AI_APICallError: RESOURCE_EXHAUSTED",
    ],
)
def test_quota_errors_are_quota_exhausted(message):
    provider = GoogleAIStudioProvider("key")
    assert provider.classify_error(_rpc_error(message)) is (
        ProviderErrorKind.QUOTA_EXHAUSTED
    )


@pytest.mark.parametrize(
    "error",
    [
        _rpc_error("Failed after 3 attempts. Last error: AI_APICallError: timeout"),
        RuntimeError(QUOTA_MESSAGE),  # Not raised by Stagehand's RPC layer.
        ValueError("price must be a float"),
    ],
)
def test_other_errors_are_not_classified(error):
    assert GoogleAIStudioProvider("key").classify_error(error) is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_ai_google.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.ai'`

- [ ] **Step 3: Create the package and the interface**

`backend/src/ai/__init__.py`:

```python
"""AI providers that drive Stagehand's inference (Google AI Studio, Ollama)."""
```

`backend/src/ai/base.py`:

```python
"""The interface every AI provider implements.

Consumers (the product extraction, the offer checks and the cronjob) only
talk to ``AIProvider``: they never branch on which provider is active.
"""

from abc import ABC, abstractmethod
from enum import Enum
from typing import Any


class ProviderErrorKind(Enum):
    """Provider-wide errors that stop a pass and leave its offers pending."""

    QUOTA_EXHAUSTED = "quota_exhausted"  # e.g. Gemini HTTP 429
    UNAVAILABLE = "unavailable"  # e.g. the Ollama instance is switched off


class ProviderUnavailableError(Exception):
    """The provider cannot be reached right now; retrying later may work."""


class AIProvider(ABC):
    """A backend Stagehand runs its inference on.

    Attributes:
        name (str): Config value that selects it (``ai_provider``).
        label (str): Human-readable name.
        not_configured_message (str): Error detail shown when it is missing
            settings.
    """

    name: str
    label: str
    not_configured_message: str

    @abstractmethod
    def is_configured(self) -> bool:
        """Whether every setting the provider needs is present."""

    @abstractmethod
    def describe(self) -> str:
        """A human description for alerts and errors (e.g. with its URL)."""

    @abstractmethod
    def stagehand_options(self) -> dict[str, Any]:
        """The model keyword arguments for ``Stagehand.create``."""

    async def preflight(self) -> None:
        """Cheap reachability check before a batch of checks.

        Raises:
            ProviderUnavailableError: If the provider cannot be reached.
        """
        return None

    @abstractmethod
    def classify_error(self, error: BaseException) -> ProviderErrorKind | None:
        """Classify an error raised by a Stagehand call.

        Returns:
            ProviderErrorKind | None: The provider-wide error kind, or None
                for an ordinary failure of that single call.
        """
```

- [ ] **Step 4: Create the Google provider and point `stagehand_utils` at its constants**

`backend/src/ai/google_ai_studio.py`:

```python
"""Google AI Studio provider: Gemini through Stagehand's built-in Google support."""

import re
from typing import Any

from src.ai.base import AIProvider, ProviderErrorKind
from stagehand.rpc_client import RPCError

# Model used for act() and extract() calls.
MODEL_NAME = "google/gemini-flash-lite-latest"

# Markers of a Gemini quota error (HTTP 429 RESOURCE_EXHAUSTED) in the message
# Stagehand raises. Today only the human-readable text reaches Python
# ("You exceeded your current quota ... Quota exceeded for metric ..."); the
# status markers cover SDK versions that forward Google's raw error.
QUOTA_ERROR_PATTERN = re.compile(
    r"exceeded your current quota|quota exceeded|resource_exhausted|\b429\b",
    re.IGNORECASE,
)


class GoogleAIStudioProvider(AIProvider):
    """Gemini with a Google AI Studio API key (the default provider)."""

    name = "google_ai_studio"
    label = "Google AI Studio"
    not_configured_message = "Google API key not configured. Please set it in Settings."

    def __init__(self, api_key: str):
        self._api_key = api_key

    def is_configured(self) -> bool:
        return bool(self._api_key)

    def describe(self) -> str:
        return self.label

    def stagehand_options(self) -> dict[str, Any]:
        return {"model": MODEL_NAME, "model_api_key": self._api_key}

    def classify_error(self, error: BaseException) -> ProviderErrorKind | None:
        """A Stagehand ``RPCError`` reporting a Gemini quota error is quota.

        Covers both the per-minute and the per-day limits. Stagehand already
        retries the model call a few times before raising, so a quota error
        that reaches Python means the limit is still in effect.
        """
        if isinstance(error, RPCError) and QUOTA_ERROR_PATTERN.search(str(error)):
            return ProviderErrorKind.QUOTA_EXHAUSTED
        return None
```

In `backend/src/stagehand_utils.py`, delete the `MODEL_NAME = ...` block and the `_RATE_LIMIT_PATTERN = re.compile(...)` block (with their comments), add the import below next to the other `src`/`stagehand` imports, and make `is_rate_limit_error` use it (it is removed in Task 4):

```python
from src.ai.google_ai_studio import MODEL_NAME, QUOTA_ERROR_PATTERN
```

```python
    return isinstance(error, RPCError) and bool(QUOTA_ERROR_PATTERN.search(str(error)))
```

Remove `import re` if nothing else in the file uses it.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_ai_google.py tests/test_extraction.py -v`
Expected: PASS

- [ ] **Step 6: Lint and commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd .. && git add backend/src/ai backend/src/stagehand_utils.py backend/tests/test_ai_google.py
git commit -m "feat(backend): add the AI provider interface and the Google AI Studio provider"
```

---

### Task 2: The Ollama provider

**Files:**
- Create: `backend/src/ai/ollama.py`
- Test: `backend/tests/test_ai_ollama.py`

**Interfaces:**
- Consumes: `AIProvider`, `ProviderErrorKind`, `ProviderUnavailableError` (Task 1).
- Produces:
  - `OllamaProvider(base_url: str, model: str, transport: httpx.AsyncBaseTransport | None = None)` with `name = "ollama"`, `label = "Ollama"`, `base_url` and `model` properties.
  - `async list_models(base_url: str, transport: httpx.AsyncBaseTransport | None = None) -> list[OllamaModel]` (raises `ProviderUnavailableError`).
  - `OllamaModel` frozen dataclass: `name: str`, `parameter_size: str | None`, `parameter_billions: float | None`, property `is_small -> bool | None`.
  - `normalize_ollama_url(raw: str) -> str`, `parse_parameter_billions(size: str | None) -> float | None`, `sanitize_schema(node)`.
  - Constants `SMALL_MODEL_THRESHOLD_B = 20`, `GENERATE_TIMEOUT_SECONDS = 600`, `TAGS_TIMEOUT_SECONDS = 10`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_ai_ollama.py`:

```python
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_ai_ollama.py -v`
Expected: FAIL with `ModuleNotFoundError: No module named 'src.ai.ollama'`

- [ ] **Step 3: Implement the provider**

Create `backend/src/ai/ollama.py`:

```python
"""Ollama provider: Stagehand inference on a self-hosted Ollama instance.

Stagehand v4 only accepts five hosted providers by name and has no
``base_url`` option, so Ollama goes through its "bring-your-own-LLM"
callback: every inference request (prompt plus JSON schema) is forwarded to
Ollama's ``POST /api/chat`` with the schema as ``format`` (structured
outputs).
"""

import json
import re
from dataclasses import dataclass
from typing import Any

import httpx
from src.ai.base import AIProvider, ProviderErrorKind, ProviderUnavailableError
from stagehand import LLMStructuredGenerateResult

# Local models on large page snapshots can be slow.
GENERATE_TIMEOUT_SECONDS = 600
TAGS_TIMEOUT_SECONDS = 10

# Models under this size (billions of parameters) don't guarantee good results.
SMALL_MODEL_THRESHOLD_B = 20

_PARAMETER_SIZE_PATTERN = re.compile(r"^\s*(\d+(?:\.\d+)?)\s*([KMBT])\s*$", re.I)
_UNIT_IN_BILLIONS = {"K": 1e-6, "M": 1e-3, "B": 1.0, "T": 1e3}


def normalize_ollama_url(raw: str) -> str:
    """Normalize a user-typed Ollama base URL.

    Adds ``http://`` when no scheme is given and drops trailing slashes, so
    ``192.168.1.20:11434/`` becomes ``http://192.168.1.20:11434``.

    Args:
        raw (str): The URL as typed.

    Returns:
        str: The normalized URL, or ``""`` for a blank input.
    """
    url = raw.strip()
    if not url:
        return ""
    if "://" not in url:
        url = f"http://{url}"
    return url.rstrip("/")


def parse_parameter_billions(size: str | None) -> float | None:
    """Parse Ollama's ``parameter_size`` (e.g. ``"27.3B"``) into billions.

    Args:
        size (str | None): The size as reported by ``/api/tags``.

    Returns:
        float | None: The size in billions, or None if it cannot be parsed.
    """
    if not size:
        return None
    match = _PARAMETER_SIZE_PATTERN.match(size)
    if match is None:
        return None
    return float(match.group(1)) * _UNIT_IN_BILLIONS[match.group(2).upper()]


def sanitize_schema(node: Any) -> Any:
    """Make a Stagehand JSON schema compatible with Ollama's grammar converter.

    Ollama fails with "failed to parse grammar" on the ``\\d`` shorthand in
    ``pattern`` (Stagehand's act schema uses ``^\\d+-\\d+$`` for element
    ids), so it is rewritten as ``[0-9]``, keeping the constraint. Returns a
    new structure; the input is not modified.
    """
    if isinstance(node, dict):
        return {
            key: (
                value.replace("\\d", "[0-9]")
                if key == "pattern" and isinstance(value, str)
                else sanitize_schema(value)
            )
            for key, value in node.items()
        }
    if isinstance(node, list):
        return [sanitize_schema(item) for item in node]
    return node


@dataclass(frozen=True)
class OllamaModel:
    """A model installed on an Ollama instance."""

    name: str
    parameter_size: str | None
    parameter_billions: float | None

    @property
    def is_small(self) -> bool | None:
        """Whether it is under ``SMALL_MODEL_THRESHOLD_B`` (None if unknown)."""
        if self.parameter_billions is None:
            return None
        return self.parameter_billions < SMALL_MODEL_THRESHOLD_B


async def list_models(
    base_url: str, transport: httpx.AsyncBaseTransport | None = None
) -> list[OllamaModel]:
    """List the models installed on an Ollama instance (``GET /api/tags``).

    Args:
        base_url (str): The instance URL (normalized here).
        transport (httpx.AsyncBaseTransport | None): Test seam.

    Returns:
        list[OllamaModel]: The models, in the order Ollama lists them.

    Raises:
        ProviderUnavailableError: If the instance cannot be reached or
            answers with an error or an unreadable body.
    """
    url = normalize_ollama_url(base_url)
    try:
        async with httpx.AsyncClient(
            timeout=TAGS_TIMEOUT_SECONDS, transport=transport
        ) as client:
            response = await client.get(f"{url}/api/tags")
        response.raise_for_status()
        entries = response.json().get("models", [])
    except (httpx.HTTPError, ValueError, AttributeError) as error:
        raise ProviderUnavailableError(
            f"Could not reach Ollama at {url}: {error}"
        ) from error
    models = []
    for entry in entries:
        size = (entry.get("details") or {}).get("parameter_size") or None
        models.append(OllamaModel(entry["name"], size, parse_parameter_billions(size)))
    return models


def _to_ollama_message(message) -> dict:
    """Convert a Stagehand ``LLMMessage`` into an Ollama chat message.

    Text blocks are joined; image blocks (``extract(screenshot=True)``) go
    to Ollama's ``images`` field.
    """
    blocks = message.content if isinstance(message.content, list) else [message.content]
    texts: list[str] = []
    images: list[str] = []
    for block in blocks:
        content = block.root
        if content.type == "text":
            texts.append(content.text)
        elif content.type == "image":
            images.append(content.data)
    ollama_message = {"role": message.role.value, "content": "\n".join(texts)}
    if images:
        ollama_message["images"] = images
    return ollama_message


class OllamaProvider(AIProvider):
    """A self-hosted Ollama instance and one of its models."""

    name = "ollama"
    label = "Ollama"
    not_configured_message = (
        "Ollama is not configured. Please set its URL and model in Settings."
    )

    def __init__(
        self,
        base_url: str,
        model: str,
        transport: httpx.AsyncBaseTransport | None = None,
    ):
        self._base_url = normalize_ollama_url(base_url)
        self._model = model
        self._transport = transport
        # Set by the callback on an outage and read (then cleared) by
        # ``classify_error``: the error that reaches Python is Stagehand's
        # RPCError wrapping ours, so its type is lost.
        self._unavailable_reason: str | None = None

    @property
    def base_url(self) -> str:
        return self._base_url

    @property
    def model(self) -> str:
        return self._model

    def is_configured(self) -> bool:
        return bool(self._base_url and self._model)

    def describe(self) -> str:
        return f"Ollama at {self._base_url} (model {self._model})"

    def stagehand_options(self) -> dict[str, Any]:
        return {"model": self._generate}

    async def preflight(self) -> None:
        """Check the instance answers and still has the configured model."""
        models = await list_models(self._base_url, transport=self._transport)
        if self._model not in {model.name for model in models}:
            raise ProviderUnavailableError(
                f"Model {self._model} is not installed on Ollama at {self._base_url}"
            )

    def classify_error(self, error: BaseException) -> ProviderErrorKind | None:
        reason, self._unavailable_reason = self._unavailable_reason, None
        if isinstance(error, ProviderUnavailableError) or reason is not None:
            return ProviderErrorKind.UNAVAILABLE
        return None

    def _unavailable(self, reason: str) -> ProviderUnavailableError:
        self._unavailable_reason = reason
        return ProviderUnavailableError(
            f"Ollama at {self._base_url} is unavailable: {reason}"
        )

    async def _chat(self, payload: dict) -> dict:
        """POST to ``/api/chat``; outages raise ``ProviderUnavailableError``."""
        try:
            async with httpx.AsyncClient(
                timeout=GENERATE_TIMEOUT_SECONDS, transport=self._transport
            ) as client:
                response = await client.post(f"{self._base_url}/api/chat", json=payload)
        except httpx.HTTPError as error:
            raise self._unavailable(f"{error.__class__.__name__}: {error}") from error
        # 404 is "model not found" (removed from the instance): the user must
        # act on the instance, like when it is switched off.
        if response.status_code == 404 or response.status_code >= 500:
            raise self._unavailable(
                f"HTTP {response.status_code}: {response.text[:200]}"
            )
        if response.is_error:
            raise RuntimeError(
                f"Ollama returned HTTP {response.status_code}: {response.text[:500]}"
            )
        return response.json()

    async def _generate(self, params) -> LLMStructuredGenerateResult:
        """Stagehand's LLM callback: answer one structured generation."""
        response_format = getattr(params, "response_format", None)
        if response_format is None or response_format.type != "json_schema":
            raise TypeError("Ollama only supports structured (json_schema) requests")

        messages = []
        if params.system_prompt:
            messages.append({"role": "system", "content": params.system_prompt})
        messages.extend(_to_ollama_message(message) for message in params.messages)
        options = {}
        if params.temperature is not None:
            options["temperature"] = params.temperature

        body = await self._chat(
            {
                "model": self._model,
                "messages": messages,
                "format": sanitize_schema(
                    response_format.schema_.model_dump(mode="json")
                ),
                "stream": False,
                "think": False,
                "options": options,
            }
        )
        text = body["message"]["content"]
        input_tokens = body.get("prompt_eval_count", 0)
        output_tokens = body.get("eval_count", 0)
        return LLMStructuredGenerateResult.model_validate(
            {
                "role": "assistant",
                "content": {"type": "text", "text": text},
                "output_format": "json_schema",
                "structured_content": json.loads(text),
                "usage": {
                    "input_tokens": input_tokens,
                    "output_tokens": output_tokens,
                    "total_tokens": input_tokens + output_tokens,
                },
            }
        )
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_ai_ollama.py -v`
Expected: PASS. If `test_generate_forwards_the_request_to_api_chat` fails on the image block field name, check `LLMImageContent` in `.venv/lib/python3.12/site-packages/stagehand/_generated/models.py` for the alias of `mime_type` and adjust the test data (not the provider).

- [ ] **Step 5: Lint and commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd .. && git add backend/src/ai/ollama.py backend/tests/test_ai_ollama.py
git commit -m "feat(backend): add the Ollama AI provider"
```

---

### Task 3: Provider configuration and the provider factory

**Files:**
- Create: `backend/src/ai/factory.py`
- Modify: `backend/src/core/config.py`, `backend/src/schemas/config.py`, `backend/src/services/config_service.py`
- Test: `backend/tests/test_ai_factory.py`, `backend/tests/test_config.py`

**Interfaces:**
- Consumes: `GoogleAIStudioProvider` (Task 1), `OllamaProvider`, `normalize_ollama_url` (Task 2).
- Produces:
  - `src.core.config`: `AI_PROVIDER_OPTIONS = ("google_ai_studio", "ollama")`, `DEFAULT_AI_PROVIDER = "google_ai_studio"`, `AIProviderName = Literal["google_ai_studio", "ollama"]`, `get_ai_provider(session) -> str`.
  - `src.ai.factory.load_ai_provider(session) -> AIProvider`.
  - `ConfigUpdate`: `ai_provider: AIProviderName | None`, `ollama_url: str | None`, `ollama_model: str | None`.
  - `ConfigResponse`: `ai_provider: AIProviderName`, `ollama_url: str | None`, `ollama_model: str | None`, `ai_provider_options: list[str]`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_ai_factory.py`:

```python
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
```

Append to `backend/tests/test_config.py`:

```python
def test_ai_provider_defaults_to_google_ai_studio(client):
    body = client.get("/config/").json()
    assert body["ai_provider"] == "google_ai_studio"
    assert body["ai_provider_options"] == ["google_ai_studio", "ollama"]
    assert body["ollama_url"] is None
    assert body["ollama_model"] is None


def test_saves_the_ollama_settings_with_a_normalized_url(client):
    body = client.patch(
        "/config/",
        json={
            "ai_provider": "ollama",
            "ollama_url": " 192.168.1.20:11434/ ",
            "ollama_model": "qwen3.8:latest",
        },
    ).json()
    assert body["ai_provider"] == "ollama"
    assert body["ollama_url"] == "http://192.168.1.20:11434"
    assert body["ollama_model"] == "qwen3.8:latest"


def test_switching_provider_keeps_the_other_settings(client):
    client.patch("/config/", json={"google_api_key": "key"})
    client.patch("/config/", json={"ai_provider": "ollama"})
    body = client.patch("/config/", json={"ai_provider": "google_ai_studio"}).json()
    assert body["google_api_key"] == "key"


def test_rejects_an_unknown_ai_provider(client):
    assert client.patch("/config/", json={"ai_provider": "openai"}).status_code == 422


def test_corrupt_ai_provider_falls_back_to_google(client, session):
    session.add(Config(key="ai_provider", value="garbage"))
    session.commit()
    assert client.get("/config/").json()["ai_provider"] == "google_ai_studio"
```

If `Config` is not yet imported in `test_config.py`, add `from src.models.database_models import Config`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_ai_factory.py tests/test_config.py -v`
Expected: FAIL (`No module named 'src.ai.factory'`; `KeyError: 'ai_provider'`)

- [ ] **Step 3: Add the config helpers**

In `backend/src/core/config.py`, after the daily check report block:

```python
# AI provider behind Stagehand. Google AI Studio is the default.
AI_PROVIDER_OPTIONS = ("google_ai_studio", "ollama")
DEFAULT_AI_PROVIDER = "google_ai_studio"
AIProviderName = Literal["google_ai_studio", "ollama"]
```

Add to `CONFIG_DEFAULTS` (after `"google_api_key": ""`):

```python
    "ai_provider": DEFAULT_AI_PROVIDER,
    "ollama_url": "",
    "ollama_model": "",
```

At the end of the file:

```python
def get_ai_provider(session: Session) -> str:
    """Return the configured AI provider name.

    A missing or unknown stored value falls back to ``DEFAULT_AI_PROVIDER``,
    so installations from before the setting keep using Google AI Studio.

    Args:
        session (Session): The database session.

    Returns:
        str: One of ``AI_PROVIDER_OPTIONS``.
    """
    value = get_config_value(session, "ai_provider", DEFAULT_AI_PROVIDER)
    return value if value in AI_PROVIDER_OPTIONS else DEFAULT_AI_PROVIDER
```

Create `backend/src/ai/factory.py`:

```python
"""Build the active AI provider from the stored configuration."""

from sqlmodel import Session
from src.ai.base import AIProvider
from src.ai.google_ai_studio import GoogleAIStudioProvider
from src.ai.ollama import OllamaProvider
from src.core.config import get_ai_provider, get_config_value


def load_ai_provider(session: Session) -> AIProvider:
    """Return the provider selected in the settings (possibly unconfigured).

    Args:
        session (Session): Active database session.

    Returns:
        AIProvider: The Ollama provider when ``ai_provider`` is ``"ollama"``,
            otherwise Google AI Studio (the default).
    """
    if get_ai_provider(session) == OllamaProvider.name:
        return OllamaProvider(
            get_config_value(session, "ollama_url"),
            get_config_value(session, "ollama_model"),
        )
    return GoogleAIStudioProvider(get_config_value(session, "google_api_key"))
```

- [ ] **Step 4: Expose the settings in the config API**

In `backend/src/schemas/config.py`, import `AIProviderName` alongside the other literals and add:

- to `ConfigUpdate` (after `google_api_key`):

```python
    ai_provider: AIProviderName | None = None
    ollama_url: str | None = None
    ollama_model: str | None = None
```

- to `ConfigResponse` (after `google_api_key`, and `ai_provider_options` after `daily_check_report_options`):

```python
    ai_provider: AIProviderName
    ollama_url: str | None
    ollama_model: str | None
```

```python
    ai_provider_options: list[str]
```

In `backend/src/services/config_service.py`:
- import `AI_PROVIDER_OPTIONS` and `get_ai_provider` from `src.core.config`, and `normalize_ollama_url` from `src.ai.ollama`;
- in `get_all_config`, read `ollama_url = get_config_value(session, "ollama_url")` and `ollama_model = get_config_value(session, "ollama_model")` next to `google_key`, and pass:

```python
        ai_provider=get_ai_provider(session),
        ollama_url=ollama_url if ollama_url else None,
        ollama_model=ollama_model if ollama_model else None,
```

```python
        ai_provider_options=list(AI_PROVIDER_OPTIONS),
```

- in `update_config`, before `session.commit()`:

```python
    if config_update.ai_provider is not None:
        # Already restricted to AI_PROVIDER_OPTIONS by the schema (422).
        set_config_value(session, "ai_provider", config_update.ai_provider)

    if config_update.ollama_url is not None:
        set_config_value(
            session, "ollama_url", normalize_ollama_url(config_update.ollama_url)
        )

    if config_update.ollama_model is not None:
        set_config_value(session, "ollama_model", config_update.ollama_model.strip())
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_ai_factory.py tests/test_config.py -v`
Expected: PASS

- [ ] **Step 6: Lint and commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd .. && git add backend/src backend/tests
git commit -m "feat(backend): store the selected AI provider and its Ollama settings"
```

---

### Task 4: Route every Stagehand call through the active provider

Plumbing only: behaviour on the Google path must not change; the existing tests are the regression net.

**Files:**
- Modify: `backend/src/stagehand_utils.py`, `backend/src/services/offer_check_service.py`, `backend/src/product_status_cronjob.py`, `backend/src/services/product_service.py`
- Modify tests: `backend/tests/test_extraction.py`
- Delete: `backend/src/ollama_stagehand.py`

**Interfaces:**
- Consumes: `AIProvider`, `ProviderErrorKind` (Task 1), `load_ai_provider` (Task 3).
- Produces:
  - `get_product_info(provider: AIProvider, url, language, categories, fetch_favicon=True) -> ProductInfoResult`
  - `get_product_status(provider: AIProvider, url) -> ProductStatusExtraction`
  - `check_offer(session, offer, provider: AIProvider, tg, now, replace_today=False) -> CheckOutcome`
  - `_check_offers(session, offers, provider: AIProvider, now)` (same return as today in this task)
  - `is_rate_limit_error` is removed.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_extraction.py` (next to the `extract_product_info` tests):

```python
def test_extract_without_ollama_settings_returns_400(client, session, extraction_setup):
    session.add(Config(key="ai_provider", value="ollama"))
    session.commit()

    response = client.post(
        "/products/extract-info/", json={"url": "https://www.amazon.es/dp/1"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Ollama is not configured. Please set its URL and model in Settings."
    )
    assert extraction_setup == []


def test_extract_without_google_key_keeps_the_original_message(
    client, session, extraction_setup
):
    session.exec(delete(Config).where(Config.key == "google_api_key"))
    session.commit()

    response = client.post(
        "/products/extract-info/", json={"url": "https://www.amazon.es/dp/1"}
    )

    assert response.status_code == 400
    assert response.json()["detail"] == (
        "Google API key not configured. Please set it in Settings."
    )


def test_extract_passes_the_active_provider(client, session, monkeypatch):
    session.add(Category(name="Electronics", color="#000"))
    session.add(Config(key="google_api_key", value="key"))
    session.commit()
    seen = []

    async def fake_get_product_info(provider, url, language, categories, fetch_favicon):
        seen.append(provider)
        return ProductInfoResult(
            info=ProductInfoExtraction(
                name="W", category="Electronics", currency="EUR",
                description="d", store_name="S",
            )
        )

    monkeypatch.setattr(product_service, "get_product_info", fake_get_product_info)
    client.post("/products/extract-info/", json={"url": "https://www.amazon.es/dp/1"})

    assert isinstance(seen[0], GoogleAIStudioProvider)
```

Check the extraction route path used by the existing tests in this file (e.g. `test_extract_invalid_url_returns_422_without_scraping`) and use the same one. Add the imports the new tests need: `from sqlmodel import delete`, `from src.ai.google_ai_studio import GoogleAIStudioProvider` (and `Category`, `Config`, `product_service` if not already imported).

Also in this file, delete the `# --- is_rate_limit_error ---` section (the `QUOTA_MESSAGE` constant, `_rpc_error`, `test_quota_errors_are_rate_limit_errors`, `test_other_errors_are_not_rate_limit_errors`) and `is_rate_limit_error` from the imports: the same cases now live in `test_ai_google.py` (Task 1). In the `extraction_setup` fixture, rename the fake's first parameter from `google_api_key` to `provider`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_extraction.py -v`
Expected: FAIL (`test_extract_without_ollama_settings_returns_400` gets 200 or the Google message; `test_extract_passes_the_active_provider` receives a string)

- [ ] **Step 3: Make `stagehand_utils` take a provider**

In `backend/src/stagehand_utils.py`:
- Update the module docstring's first paragraph to: "Each public function launches a local headless Chrome, attaches a Stagehand instance driven by the active AI provider (see ``src.ai``), visits the product page, dismisses pop-ups and extracts structured data validated by a Pydantic model."
- Remove the `from src.ai.google_ai_studio import ...` line added in Task 1, `is_rate_limit_error` and the `RPCError` import; add `from src.ai.base import AIProvider`.
- `_open_product_page(provider: AIProvider, url: str)`: docstring arg `provider (AIProvider): The AI provider Stagehand runs its inference on.`; create Stagehand with:

```python
        stagehand = await Stagehand.create(
            browser=browser, **provider.stagehand_options()
        )
```

- `get_product_info(provider: AIProvider, url, language, categories, fetch_favicon=True)` and `get_product_status(provider: AIProvider, url)`: rename the parameter, pass `provider` to `_open_product_page`, update the docstrings (`provider (AIProvider): The AI provider to extract with.`).
- In `__main__`, replace the key lines with:

```python
    from src.ai.google_ai_studio import GoogleAIStudioProvider

    provider = GoogleAIStudioProvider(os.getenv("ASD_GOOGLE", ""))

    asyncio.run(
        get_product_info(provider, test_url, test_language, test_categories)
    )
    asyncio.run(get_product_status(provider, test_url))
```

- [ ] **Step 4: Route the offer checks and the cronjob through the provider**

In `backend/src/services/offer_check_service.py`:
- imports: remove `is_rate_limit_error` from the `stagehand_utils` import; add `from src.ai.base import AIProvider, ProviderErrorKind` and `from src.ai.factory import load_ai_provider`; drop `get_config_value` if it becomes unused.
- `check_offer(session, offer, provider: AIProvider, tg, now, replace_today=False)`; docstring `provider (AIProvider): The active AI provider.`; call `await get_product_status(provider, offer.url)`; replace the `except` block's quota check with:

```python
    except Exception as e:
        if provider.classify_error(e) is ProviderErrorKind.QUOTA_EXHAUSTED:
            logger.warning(f"Gemini quota exhausted while checking {label}: {str(e)}")
            return CheckOutcome.RATE_LIMITED
        logger.error(f"Error processing {label}: {str(e)}")
        return CheckOutcome.FAILED
```

- `check_offer_now`: replace the key lookup with

```python
        provider = load_ai_provider(session)
        if not provider.is_configured():
            logger.info(
                f"{provider.label} not configured; offer left for the daily run"
            )
            return
```

and pass `provider` to `check_offer`.

In `backend/src/product_status_cronjob.py`:
- add `from src.ai.base import AIProvider` and `from src.ai.factory import load_ai_provider`;
- `_check_offers(session, offers, provider: AIProvider, now)` (docstring `provider (AIProvider): The active AI provider.`), passing `provider` to `check_offer`;
- in `fetch_and_store_product_status` and `retry_rate_limited_products` replace

```python
        google_api_key = get_config_value(session, "google_api_key")
        if not google_api_key:
            logger.error("Google API key not configured in database. Exiting.")
            return
```

with

```python
        provider = load_ai_provider(session)
        if not provider.is_configured():
            logger.error(f"{provider.label} not configured in database. Exiting.")
            return
```

and pass `provider` instead of `google_api_key` to `_check_offers`.

In `backend/src/services/product_service.py` (`extract_product_info`): add `from src.ai.factory import load_ai_provider`; replace the Google key block with

```python
    # Active AI provider
    provider = load_ai_provider(session)
    if not provider.is_configured():
        raise HTTPException(status_code=400, detail=provider.not_configured_message)
```

and call `get_product_info(provider, request.url, ...)`. Update the docstring ("Reads the active AI provider, language, and category list…"; "400 if the AI provider or categories are missing").

- [ ] **Step 5: Delete the spike script**

```bash
rm backend/src/ollama_stagehand.py
```

- [ ] **Step 6: Run the whole backend suite (Google regression net)**

Run: `cd backend && uv run pytest -q`
Expected: all PASS. The cronjob and offer-check fakes take `(api_key, url)` positionally, so they keep working with a provider as first argument; do not change their assertions.

- [ ] **Step 7: Lint and commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd .. && git add -A backend
git commit -m "refactor(backend): run Stagehand through the active AI provider"
```

---

### Task 5: Stop and retry when the provider is unavailable

**Files:**
- Modify: `backend/src/models/database_models.py`, `backend/migrations/versions/20260927_e4c87bf1c218_initial_schema.py`, `backend/src/services/offer_check_service.py`, `backend/src/product_status_cronjob.py`, `backend/src/services/product_service.py`
- Test: `backend/tests/test_provider_unavailable.py`

**Interfaces:**
- Consumes: `load_ai_provider` (Task 3), `OllamaProvider.preflight` (Task 2), `ProviderUnavailableError` (Task 1).
- Produces:
  - `CheckOutcome.PROVIDER_UNAVAILABLE = "provider_unavailable"`, property `CheckOutcome.limit_reason -> str | None` (`"quota"` for `RATE_LIMITED`, `"unavailable"` for `PROVIDER_UNAVAILABLE`, else None) and `CheckOutcome.stops_run -> bool`.
  - Constants in `offer_check_service`: `LIMIT_REASON_QUOTA = "quota"`, `LIMIT_REASON_UNAVAILABLE = "unavailable"`.
  - `DailyCheckRun.limit_reason: str | None = None`, `unavailable_alert_sent: bool = False`, `recovered_alert_sent: bool = False`.
  - `_check_offers(...) -> tuple[list[int], int | None, str | None]` (pending ids, limit time, limit reason).
  - `_run_pass(session, offers, provider, now) -> tuple[list[int], int | None, str | None]` in the cronjob (preflight + `_check_offers`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_provider_unavailable.py`:

```python
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
        make_offer(session, make_product(session, category.id, name=f"P{i}").id,
                   url=f"https://example.com/{i}")
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
    session.add(DailyCheckRun(day_start=DAY_START, started_at=DAY_START, total_offers=2))
    session.commit()
    ollama.up = False

    asyncio.run(offer_check.check_offer_now(ollama.offer_ids[0], now=NOW))

    assert _pending_ids(session) == {ollama.offer_ids[0]}


def test_google_quota_still_records_a_quota_limit(session, ollama, monkeypatch):
    from stagehand.rpc_client import RPCError, _JSONRPCError

    session.exec(select(Config).where(Config.key == "ai_provider")).one().value = (
        "google_ai_studio"
    )
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
```

Append to `backend/tests/test_extraction.py`:

```python
def test_extract_with_ollama_down_returns_503(client, session, monkeypatch):
    session.add(Category(name="Electronics", color="#000"))
    for key, value in {
        "ai_provider": "ollama",
        "ollama_url": "http://ollama.local:11434",
        "ollama_model": "qwen3.8:latest",
    }.items():
        session.add(Config(key=key, value=value))
    session.commit()

    async def down(self):
        raise ProviderUnavailableError("Could not reach Ollama")

    monkeypatch.setattr(OllamaProvider, "preflight", down)

    response = client.post(
        "/products/extract-info/", json={"url": "https://www.amazon.es/dp/1"}
    )

    assert response.status_code == 503
    assert response.json()["detail"] == (
        "Could not reach Ollama at http://ollama.local:11434 (model qwen3.8:latest)"
    )
```

(use the same extraction route path as the other tests in the file; import `ProviderUnavailableError` from `src.ai.base` and `OllamaProvider` from `src.ai.ollama`).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_provider_unavailable.py tests/test_extraction.py -v`
Expected: FAIL (`AttributeError: PROVIDER_UNAVAILABLE`, `DailyCheckRun` has no `limit_reason`, 500 instead of 503)

- [ ] **Step 3: Add the `DailyCheckRun` columns to the model and the baseline migration**

In `backend/src/models/database_models.py`, `DailyCheckRun` becomes:

```python
class DailyCheckRun(SQLModel, table=True):
    """Summary of one local day's price check, created by its full run.

    ``limit_reached_at`` / ``pending_at_limit`` / ``limit_reason`` are the
    snapshot of the day's first provider-wide stop (null when it never
    happened): ``"quota"`` (the Gemini quota ran out) or ``"unavailable"``
    (the provider, e.g. Ollama, could not be reached). They are never
    overwritten by the retries. ``PendingStatusRetry`` holds the live list of
    offers still pending. The ``*_alert_sent`` flags make the Telegram
    "provider unavailable" / "back online" alerts go out at most once a day.
    """

    day_start: int = Field(primary_key=True)  # Unix seconds, local day start
    started_at: int  # Unix seconds
    total_offers: int
    limit_reached_at: int | None = None  # Unix seconds
    pending_at_limit: int | None = None
    limit_reason: str | None = None  # "quota" | "unavailable"
    report_sent: bool = False
    unavailable_alert_sent: bool = False
    recovered_alert_sent: bool = False
```

Update the `PendingStatusRetry` docstring's first line to "An offer whose daily status check hit a provider-wide stop (Gemini quota or provider unavailable)."

In `backend/migrations/versions/20260927_e4c87bf1c218_initial_schema.py`, the `dailycheckrun` table becomes:

```python
        sa.Column("limit_reached_at", sa.Integer(), nullable=True),
        sa.Column("pending_at_limit", sa.Integer(), nullable=True),
        sa.Column("limit_reason", sqlmodel.sql.sqltypes.AutoString(), nullable=True),
        sa.Column("report_sent", sa.Boolean(), nullable=False),
        sa.Column("unavailable_alert_sent", sa.Boolean(), nullable=False),
        sa.Column("recovered_alert_sent", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("day_start"),
```

- [ ] **Step 4: Add the outcome and use it in `check_offer`**

In `backend/src/services/offer_check_service.py`:

```python
# Why a pass stopped early (``DailyCheckRun.limit_reason``).
LIMIT_REASON_QUOTA = "quota"
LIMIT_REASON_UNAVAILABLE = "unavailable"


class CheckOutcome(Enum):
    ...existing members unchanged...
    PROVIDER_UNAVAILABLE = "provider_unavailable"  # The AI provider is unreachable.

    @property
    def limit_reason(self) -> str | None:
        """The ``DailyCheckRun.limit_reason`` this outcome stops a pass with."""
        return {
            CheckOutcome.RATE_LIMITED: LIMIT_REASON_QUOTA,
            CheckOutcome.PROVIDER_UNAVAILABLE: LIMIT_REASON_UNAVAILABLE,
        }.get(self)

    @property
    def stops_run(self) -> bool:
        """Whether every later check would fail too, so the pass must stop."""
        return self.limit_reason is not None
```

(keep the existing `CheckOutcome` members and their comments; add the new member and the two properties.)

In `check_offer`'s `except` block:

```python
    except Exception as e:
        kind = provider.classify_error(e)
        if kind is ProviderErrorKind.QUOTA_EXHAUSTED:
            logger.warning(f"Gemini quota exhausted while checking {label}: {str(e)}")
            return CheckOutcome.RATE_LIMITED
        if kind is ProviderErrorKind.UNAVAILABLE:
            logger.warning(f"{provider.describe()} unavailable while checking {label}: {str(e)}")
            return CheckOutcome.PROVIDER_UNAVAILABLE
        logger.error(f"Error processing {label}: {str(e)}")
        return CheckOutcome.FAILED
```

In `check_offer_now`, change the pending condition to `if outcome.stops_run and daily_run is not None:` and update its docstring ("an offer that hits a provider-wide stop (quota or unavailable) becomes a pending retry for today").

- [ ] **Step 5: Stop passes on either reason and run the preflight**

In `backend/src/product_status_cronjob.py`:
- import `ProviderUnavailableError` from `src.ai.base` and `LIMIT_REASON_UNAVAILABLE` from `offer_check_service`;
- `_check_offers` returns the reason too:

```python
    counts = {outcome: 0 for outcome in CheckOutcome}
    pending_ids: list[int] = []
    limit_reached_at: int | None = None
    limit_reason: str | None = None
    for index, offer in enumerate(offers):
        outcome = await check_offer(session, offer, provider, tg, now)
        counts[outcome] += 1
        if outcome.stops_run:
            limit_reached_at = _current_timestamp()
            limit_reason = outcome.limit_reason
            day_start, day_end = local_day_bounds(now)
            pending_ids = [offer.id] + [
                o.id
                for o in offers[index + 1 :]
                if not has_record_between(session, o.id, day_start, day_end)
            ]
            logger.warning(
                f"Stopping ({limit_reason}): {len(pending_ids)} offer(s) left "
                "for a retry on the next run"
            )
            break
    ...
    return pending_ids, limit_reached_at, limit_reason
```

(update its docstring: "stopping at the first provider-wide stop (Gemini quota or provider unavailable)" and the Returns section with the third element "the reason (``"quota"`` / ``"unavailable"``) or None".)

- add, below `_check_offers`:

```python
async def _run_pass(
    session: Session, offers: list[Offer], provider: AIProvider, now: datetime
) -> tuple[list[int], int | None, str | None]:
    """Check ``offers`` after making sure the provider can be reached.

    When the preflight fails (e.g. Ollama is switched off) nothing is
    scraped, so Chrome is not launched every 10 minutes just to fail: every
    offer without a record today is left pending.

    Returns:
        tuple[list[int], int | None, str | None]: Same as ``_check_offers``.
    """
    try:
        await provider.preflight()
    except ProviderUnavailableError as error:
        logger.warning(f"{provider.describe()} unavailable: {error}")
        day_start, day_end = local_day_bounds(now)
        pending_ids = [
            o.id for o in offers if not has_record_between(session, o.id, day_start, day_end)
        ]
        return pending_ids, _current_timestamp(), LIMIT_REASON_UNAVAILABLE
    return await _check_offers(session, offers, provider, now)
```

- `fetch_and_store_product_status`: call `_run_pass` and store the reason:

```python
        pending_ids, limit_reached_at, limit_reason = await _run_pass(
            session, offers, provider, now
        )

        for offer_id in pending_ids:
            session.add(PendingStatusRetry(offer_id=offer_id, day_start=day_start))
        if limit_reached_at is not None:
            daily_run.limit_reached_at = limit_reached_at
            daily_run.pending_at_limit = len(pending_ids)
            daily_run.limit_reason = limit_reason
            session.add(daily_run)
        session.commit()
```

- `retry_rate_limited_products`: `still_pending, _, _ = await _run_pass(session, offers, provider, now)`.
- Update the module docstring items 2–3 to say "If the AI provider stops the run (the Gemini quota runs out, or the provider — e.g. Ollama — cannot be reached)…", and the `fetch_and_store_product_status` / `retry_rate_limited_products` docstrings likewise ("hit a provider-wide stop").

- [ ] **Step 6: Return 503 when the provider is down during extraction**

In `backend/src/services/product_service.py` (`extract_product_info`), import `ProviderErrorKind`, `ProviderUnavailableError` from `src.ai.base`; after the `is_configured` check:

```python
    unavailable = HTTPException(
        status_code=503, detail=f"Could not reach {provider.describe()}"
    )
    try:
        await provider.preflight()
    except ProviderUnavailableError as error:
        raise unavailable from error
```

and wrap the `get_product_info` call:

```python
    try:
        result = await get_product_info(
            provider,
            request.url,
            selected_language,
            category_names,
            fetch_favicon=existing_store is None,
        )
    except Exception as error:
        if provider.classify_error(error) is ProviderErrorKind.UNAVAILABLE:
            raise unavailable from error
        raise
```

Add `503 if the AI provider cannot be reached` to the docstring's Raises.

- [ ] **Step 7: Run the backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all PASS, including `tests/test_migrations.py` (the baseline matches the models).

- [ ] **Step 8: Lint and commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd .. && git add backend
git commit -m "feat(backend): retry the day's checks while the AI provider is unavailable"
```

---

### Task 6: Telegram alerts, report texts and daily status by reason

**Files:**
- Modify: `backend/src/telegram_utils.py`, `backend/src/product_status_cronjob.py`, `backend/src/schemas/daily_check.py`, `backend/src/services/daily_check_service.py`
- Test: `backend/tests/test_daily_report.py`, `backend/tests/test_daily_check.py`, `backend/tests/test_provider_unavailable.py`

**Interfaces:**
- Consumes: `DailyCheckRun.limit_reason`, `unavailable_alert_sent`, `recovered_alert_sent`, `LIMIT_REASON_UNAVAILABLE` (Task 5), `load_ai_provider` (Task 3).
- Produces:
  - `build_daily_done_message(lang, recorded, total, failed, limit_time, pending_at_limit, limit_reason="quota", provider_label="Ollama") -> str`
  - `build_daily_unchecked_message(lang, pending, total, limit_time, pending_at_limit, limit_reason="quota", provider_label="Ollama") -> str`
  - `build_provider_unavailable_message(lang, provider_description, pending) -> str`
  - `build_provider_recovered_message(lang, provider_label, recorded) -> str`
  - `send_provider_alerts_if_due(now: datetime) -> None` (cronjob; called by `main` before the daily report).
  - `DailyCheckStatusResponse.limit_reason: str | None`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/test_daily_report.py` (messages section):

```python
def test_quota_texts_are_unchanged():
    assert "Gemini limit reached at 12:03" in build_daily_done_message(
        "english", 3, 3, 0, "12:03", 2
    )


def test_done_message_on_an_unavailable_day():
    message = build_daily_done_message(
        "english", 3, 3, 0, "12:03", 2, limit_reason="unavailable",
        provider_label="Ollama",
    )
    assert message == (
        "✅ Daily check completed: 3 of 3 prices recorded.\n"
        "Ollama was unavailable at 12:03 with 2 prices left; finished by retrying."
    )


def test_unchecked_message_on_an_unavailable_day_in_spanish():
    message = build_daily_unchecked_message(
        "spanish", 2, 3, "12:03", 2, limit_reason="unavailable",
        provider_label="Ollama",
    )
    assert message == (
        "⚠️ 2 de 3 precios no se han podido revisar hoy: Ollama no estaba "
        "disponible a las 12:03 con 2 precios pendientes. Mañana se revisarán "
        "primero."
    )


def test_provider_alert_messages():
    assert build_provider_unavailable_message(
        "english", "Ollama at http://h:11434 (model qwen3.8:latest)", 5
    ) == (
        "⚠️ I can't reach Ollama at http://h:11434 (model qwen3.8:latest). "
        "Please switch the instance on or check what is going on. 5 prices are "
        "pending; I'll retry every 10 minutes."
    )
    assert build_provider_recovered_message("spanish", "Ollama", 7) == (
        "✅ Ollama vuelve a estar disponible: 7 precios revisados."
    )


def test_unavailable_day_report_names_the_provider(session, report):
    _add_run(session)
    run = session.get(DailyCheckRun, DAY_START)
    run.limit_reason = "unavailable"
    session.add(Config(key="ai_provider", value="ollama"))
    session.commit()
    for product_id in report["ids"]:
        _record(session, product_id)

    _send()

    assert "Ollama was unavailable at" in report["sent"][0]
```

Update the `test_daily_report.py` import line to also import `build_provider_recovered_message` and `build_provider_unavailable_message`.

Append to `backend/tests/test_daily_check.py`:

```python
def test_status_exposes_the_limit_reason(session, products):
    session.add(
        DailyCheckRun(
            day_start=DAY_START, started_at=DAY_START, total_offers=3,
            limit_reached_at=DAY_START + 60, pending_at_limit=1,
            limit_reason="unavailable",
        )
    )
    session.commit()

    assert daily_check_service.get_status(session, NOW).limit_reason == "unavailable"
```

(adapt the names `DAY_START`, `NOW`, `products`, `daily_check_service` to the ones this file already defines/imports; check its top before pasting.)

Append to `backend/tests/test_provider_unavailable.py`:

```python
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
            day_start=DAY_START, started_at=DAY_START, total_offers=2,
            limit_reached_at=DAY_START + 60, pending_at_limit=2, limit_reason="quota",
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
    session.exec(select(Config).where(Config.key == "ai_provider")).one().value = (
        "google_ai_studio"
    )
    session.exec(PendingStatusRetry.__table__.delete())
    session.commit()

    _alert(NOW + timedelta(minutes=10))

    assert alerts.sent[-1] == "✅ Google AI Studio is available again: 0 prices checked."


def test_main_sends_the_provider_alert(session, ollama, alerts):
    ollama.up = False
    asyncio.run(cronjob.main(now=NOW))

    assert any(text.startswith("⚠️ I can't reach Ollama") for text in alerts.sent)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_daily_report.py tests/test_daily_check.py tests/test_provider_unavailable.py -v`
Expected: FAIL (`ImportError: build_provider_unavailable_message`, `TypeError: unexpected keyword argument 'limit_reason'`, no `send_provider_alerts_if_due`)

- [ ] **Step 3: Texts by reason and the alert builders**

In `backend/src/telegram_utils.py`, add to `_DAILY_REPORT_TEXTS["english"]`:

```python
        "done_unavailable": (
            "{provider} was unavailable at {limit_time} with {pending_at_limit} "
            "prices left; finished by retrying."
        ),
        "unchecked_unavailable": (
            "⚠️ {pending} of {total} prices could not be checked today: {provider} "
            "was unavailable at {limit_time} with {pending_at_limit} prices left. "
            "Tomorrow's run will check them first."
        ),
        "provider_down": (
            "⚠️ I can't reach {provider}. Please switch the instance on or check "
            "what is going on. {pending} prices are pending; I'll retry every 10 "
            "minutes."
        ),
        "provider_up": "✅ {provider} is available again: {recorded} prices checked.",
```

and to `_DAILY_REPORT_TEXTS["spanish"]`:

```python
        "done_unavailable": (
            "{provider} no estaba disponible a las {limit_time} con "
            "{pending_at_limit} precios pendientes; completada con reintentos."
        ),
        "unchecked_unavailable": (
            "⚠️ {pending} de {total} precios no se han podido revisar hoy: "
            "{provider} no estaba disponible a las {limit_time} con "
            "{pending_at_limit} precios pendientes. Mañana se revisarán primero."
        ),
        "provider_down": (
            "⚠️ No puedo conectar con {provider}. Enciende la instancia o revisa "
            "qué está pasando. Hay {pending} precios pendientes; reintentaré cada "
            "10 minutos."
        ),
        "provider_up": (
            "✅ {provider} vuelve a estar disponible: {recorded} precios revisados."
        ),
```

Change the two builders (keep the quota texts as the default path):

```python
def build_daily_done_message(
    lang: str,
    recorded: int,
    total: int,
    failed: int,
    limit_time: str | None,
    pending_at_limit: int | None,
    limit_reason: str = "quota",
    provider_label: str = "Ollama",
) -> str:
    ...docstring: add
        limit_reason (str): ``"quota"`` or ``"unavailable"``: picks the text.
        provider_label (str): Provider named by the "unavailable" text.
    texts = _daily_report_texts(lang)
    message = texts["done"].format(recorded=recorded, total=total)
    if failed:
        message += texts["failed"].format(failed=failed)
    message += "."
    if limit_time is not None:
        key = "done_unavailable" if limit_reason == "unavailable" else "done_limit"
        message += "\n" + texts[key].format(
            limit_time=limit_time,
            pending_at_limit=pending_at_limit,
            provider=provider_label,
        )
    return message


def build_daily_unchecked_message(
    lang: str,
    pending: int,
    total: int,
    limit_time: str,
    pending_at_limit: int,
    limit_reason: str = "quota",
    provider_label: str = "Ollama",
) -> str:
    ...docstring: same two new args
    key = "unchecked_unavailable" if limit_reason == "unavailable" else "unchecked"
    return _daily_report_texts(lang)[key].format(
        pending=pending,
        total=total,
        limit_time=limit_time,
        pending_at_limit=pending_at_limit,
        provider=provider_label,
    )


def build_provider_unavailable_message(
    lang: str, provider_description: str, pending: int
) -> str:
    """Build the alert sent when the AI provider cannot be reached.

    Args:
        lang (str): Language code ("english" or "spanish").
        provider_description (str): ``AIProvider.describe()`` (URL and model).
        pending (int): Offers pending a retry.

    Returns:
        str: The message text.
    """
    return _daily_report_texts(lang)["provider_down"].format(
        provider=provider_description, pending=pending
    )


def build_provider_recovered_message(
    lang: str, provider_label: str, recorded: int
) -> str:
    """Build the alert sent once the provider answers again and nothing is pending.

    Args:
        lang (str): Language code ("english" or "spanish").
        provider_label (str): ``AIProvider.label``.
        recorded (int): Offers (prices) recorded today.

    Returns:
        str: The message text.
    """
    return _daily_report_texts(lang)["provider_up"].format(
        provider=provider_label, recorded=recorded
    )
```

(`str.format` ignores unused keyword arguments, so passing `provider=` to the quota texts is safe.)

- [ ] **Step 4: Send the alerts from the cronjob and pass the reason to the report**

In `backend/src/product_status_cronjob.py`, import the two new builders, and in `_build_daily_report` pass the reason and label:

```python
    provider_label = load_ai_provider(session).label
    reason = run.limit_reason or "quota"
    ...
        return build_daily_done_message(
            lang,
            counts.recorded,
            run.total_offers,
            failed,
            limit_time,
            run.pending_at_limit,
            limit_reason=reason,
            provider_label=provider_label,
        )
    if is_end_of_day(now) and limit_time is not None:
        return build_daily_unchecked_message(
            lang,
            counts.pending,
            run.total_offers,
            limit_time,
            run.pending_at_limit,
            limit_reason=reason,
            provider_label=provider_label,
        )
```

Add, above `send_daily_report_if_due`:

```python
async def send_provider_alerts_if_due(now: datetime) -> None:
    """Send the Telegram "provider unavailable" / "back online" alerts.

    At most one of each per local day, whenever Telegram is configured
    (independently of the alert switches and of ``daily_check_report``):
    the first when today's run stopped because the provider was unavailable
    and offers are still pending; the second once nothing is pending after
    the first was sent. A flag is set only after a successful send, so a
    failed send is retried by the next run.

    Args:
        now (datetime): Naive local time of the run.
    """
    with Session(engine) as session:
        run = daily_check_service.get_today_run(session, now)
        if run is None or run.recovered_alert_sent:
            return
        tg = load_telegram_settings(session)
        if not tg["enabled"]:
            return
        counts = daily_check_service.count_today(session, now)
        provider = load_ai_provider(session)
        lang = get_config_value(session, "selected_language", "english")

        if not run.unavailable_alert_sent:
            if run.limit_reason != LIMIT_REASON_UNAVAILABLE or counts.pending == 0:
                return
            text = build_provider_unavailable_message(
                lang, provider.describe(), counts.pending
            )
            flag = "unavailable_alert_sent"
        elif counts.pending == 0:
            text = build_provider_recovered_message(
                lang, provider.label, counts.recorded
            )
            flag = "recovered_alert_sent"
        else:
            return

        try:
            await send_daily_check_report(tg["token"], tg["chat_id"], text)
        except Exception as e:
            logger.error(f"Failed to send the provider alert: {str(e)}")
            return
        setattr(run, flag, True)
        session.add(run)
        session.commit()
        logger.info(f"Provider alert sent ({flag})")
```

In `main`, before `await send_daily_report_if_due(now)`:

```python
        await send_provider_alerts_if_due(now)
```

Update the module docstring: add "5. Send a Telegram alert when the AI provider cannot be reached, and another once it is back and nothing is pending (at most once each per day)" and renumber the report item to 6.

- [ ] **Step 5: Expose the reason in the daily status**

`backend/src/schemas/daily_check.py`: add `limit_reason: str | None` after `pending_at_limit`.
`backend/src/services/daily_check_service.py` (`get_status`): add `limit_reason=run.limit_reason if run else None,`.

- [ ] **Step 6: Run the backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all PASS

- [ ] **Step 7: Lint and commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd .. && git add backend
git commit -m "feat(backend): alert on Telegram while the AI provider is unavailable"
```

---

### Task 7: List the models of an Ollama instance

**Files:**
- Create: `backend/src/schemas/ai.py`, `backend/src/services/ai_service.py`, `backend/src/routers/ai_router.py`
- Modify: `backend/src/api.py`
- Test: `backend/tests/test_ai_router.py`

**Interfaces:**
- Consumes: `list_models`, `normalize_ollama_url`, `OllamaModel`, `SMALL_MODEL_THRESHOLD_B` (Task 2).
- Produces: `GET /ai/ollama/models?url=<str>` → `OllamaModelsResponse {models: [{name, parameter_size, parameter_billions, is_small}], small_model_threshold_b: int}`; 502 with `detail` when unreachable; 422 on a blank URL.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_ai_router.py`:

```python
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
            {"name": "gemma4:e4b", "parameter_size": "8.0B",
             "parameter_billions": 8.0, "is_small": True},
            {"name": "mystery:latest", "parameter_size": None,
             "parameter_billions": None, "is_small": None},
            {"name": "qwen3.8:latest", "parameter_size": "27.3B",
             "parameter_billions": 27.3, "is_small": False},
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_ai_router.py -v`
Expected: FAIL (404 / import error)

- [ ] **Step 3: Implement schema, service and router**

`backend/src/schemas/ai.py`:

```python
"""Response schemas for the AI provider endpoints."""

from pydantic import BaseModel


class OllamaModelResponse(BaseModel):
    """A model installed on an Ollama instance."""

    name: str
    parameter_size: str | None
    parameter_billions: float | None
    is_small: bool | None  # Under ``small_model_threshold_b``; None if unknown.


class OllamaModelsResponse(BaseModel):
    """The models of an Ollama instance and the small-model threshold."""

    models: list[OllamaModelResponse]
    small_model_threshold_b: int
```

`backend/src/services/ai_service.py`:

```python
"""AI provider service — business logic behind the AI provider endpoints."""

from fastapi import HTTPException
from src.ai.base import ProviderUnavailableError
from src.ai.ollama import SMALL_MODEL_THRESHOLD_B, list_models, normalize_ollama_url
from src.schemas.ai import OllamaModelResponse, OllamaModelsResponse


async def list_ollama_models(url: str) -> OllamaModelsResponse:
    """List the models of the Ollama instance at ``url``, sorted by name.

    Args:
        url (str): The instance URL as typed (normalized here).

    Returns:
        OllamaModelsResponse: The models and the small-model threshold.

    Raises:
        HTTPException: 422 on a blank URL, 502 if the instance cannot be
            reached.
    """
    base_url = normalize_ollama_url(url)
    if not base_url:
        raise HTTPException(status_code=422, detail="The Ollama URL is required")
    try:
        models = await list_models(base_url)
    except ProviderUnavailableError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error
    return OllamaModelsResponse(
        models=[
            OllamaModelResponse(
                name=model.name,
                parameter_size=model.parameter_size,
                parameter_billions=model.parameter_billions,
                is_small=model.is_small,
            )
            for model in sorted(models, key=lambda model: model.name)
        ],
        small_model_threshold_b=SMALL_MODEL_THRESHOLD_B,
    )
```

`backend/src/routers/ai_router.py`:

```python
"""
AI provider router — GET /ai/ollama/models.
"""

from fastapi import APIRouter
from src.schemas.ai import OllamaModelsResponse
from src.services import ai_service

router = APIRouter(tags=["ai"])


@router.get("/ai/ollama/models")
async def list_ollama_models(url: str) -> OllamaModelsResponse:
    """List the models installed on the Ollama instance at ``url``."""
    return await ai_service.list_ollama_models(url)
```

In `backend/src/api.py`, add `ai_router` to the `src.routers` import and `app.include_router(ai_router.router)` before `config_router`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_ai_router.py -v`
Expected: PASS

- [ ] **Step 5: Lint and commit**

```bash
cd backend && uv run ruff check --fix . && uv run ruff format .
cd .. && git add backend
git commit -m "feat(backend): list the models of an Ollama instance"
```

---

### Task 8: The "AI provider" settings section

**Files:**
- Create: `frontend/src/lib/api/ai.js`, `frontend/src/hooks/useOllamaModels.js`, `frontend/src/hooks/useOllamaModels.test.jsx`, `frontend/src/components/settings/AIProviderSection.jsx`, `frontend/src/components/settings/AIProviderSection.test.jsx`
- Modify: `frontend/src/lib/api/index.js`, `frontend/src/lib/settingsDraft.js`, `frontend/src/lib/settingsDraft.test.js`, `frontend/src/components/settings/GeneralSection.jsx`, `frontend/src/components/settings/GeneralSection.test.jsx`, `frontend/src/components/settings/SettingsNav.jsx`, `frontend/src/components/settings/index.js`, `frontend/src/pages/SettingsPage.jsx`, `frontend/src/i18n/english.json`, `frontend/src/i18n/spanish.json`

**Interfaces:**
- Consumes: `GET /config/` fields `ai_provider`, `ai_provider_options`, `ollama_url`, `ollama_model` (Task 3); `GET /ai/ollama/models` (Task 7).
- Produces:
  - `ai.listOllamaModels(url: string, signal?: AbortSignal) => Promise<{models, small_model_threshold_b}>`
  - `useOllamaModels(url: string, { enabled?: boolean, delayMs?: number }) => { status: 'idle'|'loading'|'success'|'error', models, threshold, error, refresh }`
  - `<AIProviderSection provider onProviderChange providerOptions googleApiKey onGoogleApiKeyChange savedGoogleApiKey ollamaUrl onOllamaUrlChange ollamaModel onOllamaModelChange modelsDelayMs? />`

- [ ] **Step 1: Add the translations**

In `frontend/src/i18n/english.json`, under `pages.settings`:
- `sections`: add `"aiProvider": "AI provider"`.
- `fields`: add

```json
"aiProvider": {
  "label": "Provider",
  "helper": "Service that extracts product information and checks prices every day.",
  "options": {
    "google_ai_studio": "Google AI Studio",
    "ollama": "Ollama"
  }
},
"ollamaUrl": {
  "label": "Ollama URL",
  "helper": "Address of your Ollama instance, usually ip:11434.",
  "placeholder": "http://192.168.1.20:11434"
},
"ollamaModel": {
  "label": "Model",
  "helper": "Models installed on your Ollama instance.",
  "placeholder": "Select a model",
  "enterUrl": "Enter the Ollama URL to list its models",
  "loading": "Loading models…",
  "loadError": "Could not load the models: {{detail}}",
  "refresh": "Reload models",
  "notAvailable": "{{model}} (not available)",
  "smallWarning": "Models under {{threshold}}B parameters don't guarantee good results. Bigger models such as qwen3.8 work reliably."
}
```

In `frontend/src/i18n/spanish.json`, the same keys:

```json
"aiProvider": "Proveedor de IA"
```

```json
"aiProvider": {
  "label": "Proveedor",
  "helper": "Servicio que extrae la información de los productos y revisa los precios cada día.",
  "options": {
    "google_ai_studio": "Google AI Studio",
    "ollama": "Ollama"
  }
},
"ollamaUrl": {
  "label": "URL de Ollama",
  "helper": "Dirección de tu instancia de Ollama, normalmente ip:11434.",
  "placeholder": "http://192.168.1.20:11434"
},
"ollamaModel": {
  "label": "Modelo",
  "helper": "Modelos instalados en tu instancia de Ollama.",
  "placeholder": "Selecciona un modelo",
  "enterUrl": "Introduce la URL de Ollama para ver sus modelos",
  "loading": "Cargando modelos…",
  "loadError": "No se han podido cargar los modelos: {{detail}}",
  "refresh": "Recargar modelos",
  "notAvailable": "{{model}} (no disponible)",
  "smallWarning": "Los modelos de menos de {{threshold}}B parámetros no aseguran un buen rendimiento. Modelos mayores como qwen3.8 funcionan de forma fiable."
}
```

Also change the English `pages.settings.fields.googleApiKey.helper` to "Required to use Google AI Studio. Get your key from <link>Google AI Studio</link>." and the Spanish one to "Necesaria para usar Google AI Studio. Consigue tu clave en <link>Google AI Studio</link>.".

- [ ] **Step 2: Write the failing tests**

Add to `frontend/src/lib/settingsDraft.test.js` (reuse the file's config fixture; add `ai_provider: 'ollama'`, `ollama_url: 'http://h:11434'`, `ollama_model: null` to it):

```js
it('drafts the AI provider settings, with blank strings for unset values', () => {
  const draft = draftFromConfig({
    ...config,
    ai_provider: 'ollama',
    ollama_url: 'http://h:11434',
    ollama_model: null
  });
  expect(draft.ai_provider).toBe('ollama');
  expect(draft.ollama_url).toBe('http://h:11434');
  expect(draft.ollama_model).toBe('');
});

it('sends the AI provider settings in the patch', () => {
  const patch = buildConfigPatch({
    ...draftFromConfig(config),
    ai_provider: 'ollama',
    ollama_url: '192.168.1.20:11434',
    ollama_model: 'qwen3.8:latest'
  });
  expect(patch).toMatchObject({
    ai_provider: 'ollama',
    ollama_url: '192.168.1.20:11434',
    ollama_model: 'qwen3.8:latest'
  });
});
```

(use the file's existing config fixture variable name in place of `config`.)

Create `frontend/src/hooks/useOllamaModels.test.jsx`:

```jsx
import { renderHook, waitFor, act } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ai as aiApi } from '@/lib/api';
import { useOllamaModels } from './useOllamaModels';

vi.mock('@/lib/api', () => ({ ai: { listOllamaModels: vi.fn() } }));

const RESPONSE = {
  models: [{ name: 'qwen3.8:latest', parameter_size: '27.3B', is_small: false }],
  small_model_threshold_b: 20
};

beforeEach(() => vi.clearAllMocks());

describe('useOllamaModels', () => {
  it('is idle without a URL', () => {
    const { result } = renderHook(() => useOllamaModels('  ', { delayMs: 0 }));
    expect(result.current.status).toBe('idle');
    expect(aiApi.listOllamaModels).not.toHaveBeenCalled();
  });

  it('is idle while disabled', () => {
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { enabled: false, delayMs: 0 })
    );
    expect(result.current.status).toBe('idle');
  });

  it('loads the models of the URL', async () => {
    aiApi.listOllamaModels.mockResolvedValue(RESPONSE);
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { delayMs: 0 })
    );
    expect(result.current.status).toBe('loading');
    await waitFor(() => expect(result.current.status).toBe('success'));
    expect(result.current.models).toEqual(RESPONSE.models);
    expect(result.current.threshold).toBe(20);
    expect(aiApi.listOllamaModels).toHaveBeenCalledWith(
      'http://h:11434',
      expect.any(AbortSignal)
    );
  });

  it('reports the backend error', async () => {
    aiApi.listOllamaModels.mockRejectedValue(new Error('Could not reach Ollama'));
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { delayMs: 0 })
    );
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error).toBe('Could not reach Ollama');
  });

  it('reloads on refresh', async () => {
    aiApi.listOllamaModels.mockResolvedValue(RESPONSE);
    const { result } = renderHook(() =>
      useOllamaModels('http://h:11434', { delayMs: 0 })
    );
    await waitFor(() => expect(result.current.status).toBe('success'));
    act(() => result.current.refresh());
    await waitFor(() => expect(aiApi.listOllamaModels).toHaveBeenCalledTimes(2));
  });
});
```

Create `frontend/src/components/settings/AIProviderSection.test.jsx`:

```jsx
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ai as aiApi } from '@/lib/api';
import { renderWithProviders } from '@/test/renderWithProviders';
import { AIProviderSection } from './AIProviderSection';

vi.mock('@/lib/api', () => ({ ai: { listOllamaModels: vi.fn() } }));

// No test here opens the model `Select` (see `ProductPage.edit.test.jsx` for
// why Ark dismissable layers are opened at most once per test file).

const MODELS = {
  models: [
    { name: 'gemma4:e4b', parameter_size: '8.0B', parameter_billions: 8, is_small: true },
    { name: 'qwen3.8:latest', parameter_size: '27.3B', parameter_billions: 27.3, is_small: false }
  ],
  small_model_threshold_b: 20
};

const baseProps = {
  provider: 'google_ai_studio',
  onProviderChange: vi.fn(),
  providerOptions: ['google_ai_studio', 'ollama'],
  googleApiKey: '',
  onGoogleApiKeyChange: vi.fn(),
  savedGoogleApiKey: '',
  ollamaUrl: '',
  onOllamaUrlChange: vi.fn(),
  ollamaModel: '',
  onOllamaModelChange: vi.fn(),
  modelsDelayMs: 0
};

const renderSection = (props) =>
  renderWithProviders(<AIProviderSection {...baseProps} {...props} />);

beforeEach(() => {
  vi.clearAllMocks();
  aiApi.listOllamaModels.mockResolvedValue(MODELS);
});

describe('AIProviderSection', () => {
  it('shows the Google API key for Google AI Studio', () => {
    renderSection();
    expect(screen.getByLabelText('Google AI Studio API key')).toBeInTheDocument();
    expect(screen.queryByLabelText('Ollama URL')).not.toBeInTheDocument();
    expect(aiApi.listOllamaModels).not.toHaveBeenCalled();
  });

  it('switches the provider', async () => {
    const user = userEvent.setup();
    const onProviderChange = vi.fn();
    renderSection({ onProviderChange });
    await user.click(screen.getAllByText('Ollama')[0]);
    expect(onProviderChange).toHaveBeenCalledWith('ollama');
  });

  it('asks for the URL before listing models', () => {
    renderSection({ provider: 'ollama' });
    expect(screen.getByLabelText('Ollama URL')).toBeInTheDocument();
    expect(
      screen.getByText('Enter the Ollama URL to list its models')
    ).toBeInTheDocument();
  });

  it('updates the URL as the user types', async () => {
    const user = userEvent.setup();
    const onOllamaUrlChange = vi.fn();
    renderSection({ provider: 'ollama', onOllamaUrlChange });
    await user.type(screen.getByLabelText('Ollama URL'), 'h');
    expect(onOllamaUrlChange).toHaveBeenCalledWith('h');
  });

  it('warns when the selected model is small', async () => {
    renderSection({
      provider: 'ollama',
      ollamaUrl: 'http://h:11434',
      ollamaModel: 'gemma4:e4b'
    });
    expect(
      await screen.findByText(/Models under 20B parameters/)
    ).toBeInTheDocument();
  });

  it('does not warn for a big model', async () => {
    renderSection({
      provider: 'ollama',
      ollamaUrl: 'http://h:11434',
      ollamaModel: 'qwen3.8:latest'
    });
    await waitFor(() => expect(aiApi.listOllamaModels).toHaveBeenCalled());
    expect(screen.queryByText(/Models under 20B parameters/)).not.toBeInTheDocument();
  });

  it('keeps a saved model missing from the instance', async () => {
    renderSection({
      provider: 'ollama',
      ollamaUrl: 'http://h:11434',
      ollamaModel: 'old:latest'
    });
    expect(
      await screen.findByText('old:latest (not available)')
    ).toBeInTheDocument();
  });

  it('shows the error when the instance cannot be reached', async () => {
    aiApi.listOllamaModels.mockRejectedValue(
      new Error('Could not reach Ollama at http://h:11434')
    );
    renderSection({ provider: 'ollama', ollamaUrl: 'http://h:11434' });
    expect(
      await screen.findByText(
        'Could not load the models: Could not reach Ollama at http://h:11434'
      )
    ).toBeInTheDocument();
  });

  it('reloads the models on demand', async () => {
    const user = userEvent.setup();
    renderSection({ provider: 'ollama', ollamaUrl: 'http://h:11434' });
    await waitFor(() => expect(aiApi.listOllamaModels).toHaveBeenCalledTimes(1));
    await user.click(screen.getByRole('button', { name: 'Reload models' }));
    await waitFor(() => expect(aiApi.listOllamaModels).toHaveBeenCalledTimes(2));
  });
});
```

In `frontend/src/components/settings/GeneralSection.test.jsx`: drop the three Google props from `baseProps`, rename the first test to "renders the language field", replace its Google assertion with `expect(screen.queryByLabelText('Google AI Studio API key')).not.toBeInTheDocument();`, and delete the `calls onGoogleApiKeyChange as the user types` test (the same behaviour is covered by `SecretInput.test.jsx`).

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/settingsDraft.test.js src/hooks/useOllamaModels.test.jsx src/components/settings/AIProviderSection.test.jsx src/components/settings/GeneralSection.test.jsx`
Expected: FAIL (missing modules / fields)

- [ ] **Step 4: API client, draft and hook**

`frontend/src/lib/api/ai.js`:

```js
import { request } from './client';

/**
 * List the models installed on an Ollama instance
 * (`GET /ai/ollama/models`). The backend normalizes the URL and decides
 * which models are small.
 * @param {string} url - The instance URL as typed.
 * @param {AbortSignal} [signal]
 * @returns {Promise<{models: object[], small_model_threshold_b: number}>}
 */
export const listOllamaModels = (url, signal) =>
  request(`/ai/ollama/models?url=${encodeURIComponent(url)}`, { signal });
```

`frontend/src/lib/api/index.js`: add `export * as ai from './ai';`.

`frontend/src/lib/settingsDraft.js`: add `'ai_provider'`, `'ollama_url'`, `'ollama_model'` to `EDITABLE_FIELDS` (after `'google_api_key'`); in `draftFromConfig` add

```js
    ai_provider: config.ai_provider,
    ollama_url: config.ollama_url || '',
    ollama_model: config.ollama_model || '',
```

and in `buildConfigPatch`

```js
    ai_provider: draft.ai_provider,
    ollama_url: draft.ollama_url,
    ollama_model: draft.ollama_model,
```

`frontend/src/hooks/useOllamaModels.js`:

```js
import { useCallback, useEffect, useState } from 'react';
import { ai as aiApi } from '@/lib/api';

const IDLE = { status: 'idle', models: [], threshold: null, error: null };

/**
 * Loads the models of the Ollama instance at `url` from the backend,
 * debounced while the user types. The result is keyed by the request
 * (URL + refresh count), so the status is derived during render instead of
 * being reset from the effect: a result for an older URL reads as
 * `loading` until the new one arrives.
 *
 * @param {string} url - The draft Ollama URL.
 * @param {object} [options]
 * @param {boolean} [options.enabled] - Only load while Ollama is selected.
 * @param {number} [options.delayMs] - Debounce delay (0 in tests).
 * @returns {{status: 'idle'|'loading'|'success'|'error', models: object[],
 *   threshold: number|null, error: string|null, refresh: () => void}}
 */
export function useOllamaModels(url, { enabled = true, delayMs = 600 } = {}) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, ...IDLE });
  const trimmed = url.trim();
  const key = enabled && trimmed ? `${trimmed}#${attempt}` : null;
  const refresh = useCallback(() => setAttempt((count) => count + 1), []);

  useEffect(() => {
    if (key === null) return undefined;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await aiApi.listOllamaModels(trimmed, controller.signal);
        setResult({
          key,
          status: 'success',
          models: data.models,
          threshold: data.small_model_threshold_b,
          error: null
        });
      } catch (error) {
        if (controller.signal.aborted) return;
        setResult({ key, ...IDLE, status: 'error', error: error.message });
      }
    }, delayMs);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [key, trimmed, delayMs]);

  if (key === null) return { ...IDLE, refresh };
  if (result.key !== key) return { ...IDLE, status: 'loading', refresh };
  return { ...result, refresh };
}
```

- [ ] **Step 5: The section component**

`frontend/src/components/settings/AIProviderSection.jsx`:

```jsx
import { useMemo } from 'react';
import {
  Alert,
  HStack,
  IconButton,
  Input,
  Link,
  Spinner,
  Text,
  createListCollection
} from '@chakra-ui/react';
import { LuRefreshCw } from 'react-icons/lu';
import { Trans, useTranslation } from 'react-i18next';
import {
  SelectRoot,
  SelectTrigger,
  SelectValueText,
  SelectContent,
  SelectItem
} from '@/components/ui/select';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Field } from '@/components/ui/field';
import { useOllamaModels } from '@/hooks/useOllamaModels';
import { SecretInput } from './SecretInput';
import { SettingsSection } from './SettingsSection';

/**
 * The "AI provider" settings section: which provider runs the AI
 * extraction (Google AI Studio or a self-hosted Ollama) and its settings.
 * Ollama's models come from the backend (`GET /ai/ollama/models`), which
 * also flags the small ones; a saved model missing from the instance stays
 * listed (marked not available) so saving never blanks it silently.
 *
 * @param {object} props
 * @param {string} props.provider - `config.ai_provider`.
 * @param {(value: string) => void} props.onProviderChange
 * @param {string[]} props.providerOptions - `config.ai_provider_options`.
 * @param {string} props.googleApiKey
 * @param {(value: string) => void} props.onGoogleApiKeyChange
 * @param {string} props.savedGoogleApiKey
 * @param {string} props.ollamaUrl
 * @param {(value: string) => void} props.onOllamaUrlChange
 * @param {string} props.ollamaModel
 * @param {(value: string) => void} props.onOllamaModelChange
 * @param {number} [props.modelsDelayMs] - Debounce of the model list (tests).
 */
export const AIProviderSection = ({
  provider,
  onProviderChange,
  providerOptions,
  googleApiKey,
  onGoogleApiKeyChange,
  savedGoogleApiKey,
  ollamaUrl,
  onOllamaUrlChange,
  ollamaModel,
  onOllamaModelChange,
  modelsDelayMs
}) => {
  const { t } = useTranslation();
  const isOllama = provider === 'ollama';
  const models = useOllamaModels(ollamaUrl, {
    enabled: isOllama,
    delayMs: modelsDelayMs
  });

  const providerCollection = useMemo(
    () =>
      createListCollection({
        items: providerOptions.map((value) => ({
          label: t(`pages.settings.fields.aiProvider.options.${value}`),
          value
        }))
      }),
    [providerOptions, t]
  );

  const modelCollection = useMemo(() => {
    const items = models.models.map((model) => ({
      label: model.parameter_size
        ? `${model.name} · ${model.parameter_size}`
        : model.name,
      value: model.name
    }));
    const isMissing =
      ollamaModel && models.status === 'success' &&
      !items.some((item) => item.value === ollamaModel);
    if (isMissing) {
      items.unshift({
        label: t('pages.settings.fields.ollamaModel.notAvailable', {
          model: ollamaModel
        }),
        value: ollamaModel
      });
    }
    return createListCollection({ items });
  }, [models.models, models.status, ollamaModel, t]);

  const selectedModel = models.models.find((model) => model.name === ollamaModel);

  return (
    <SettingsSection
      id="ai-provider"
      title={t('pages.settings.sections.aiProvider')}
    >
      <Field
        label={t('pages.settings.fields.aiProvider.label')}
        helperText={t('pages.settings.fields.aiProvider.helper')}
      >
        <SegmentedControl
          hideBelow="sm"
          items={providerCollection.items}
          value={provider}
          onValueChange={(e) => onProviderChange(e.value)}
          size="md"
        />
        <SelectRoot
          hideFrom="sm"
          collection={providerCollection}
          value={[provider]}
          onValueChange={(details) => {
            const next = details.value[0];
            if (next) onProviderChange(next);
          }}
          size="md"
        >
          <SelectTrigger>
            <SelectValueText />
          </SelectTrigger>
          <SelectContent>
            {providerCollection.items.map((item) => (
              <SelectItem key={item.value} item={item.value}>
                {item.label}
              </SelectItem>
            ))}
          </SelectContent>
        </SelectRoot>
      </Field>

      {!isOllama && (
        <SecretInput
          label={t('pages.settings.fields.googleApiKey.label')}
          helperText={
            <Trans
              i18nKey="pages.settings.fields.googleApiKey.helper"
              components={{
                link: (
                  <Link
                    href="https://aistudio.google.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    color="fg"
                    textDecoration="underline"
                  />
                )
              }}
            />
          }
          value={googleApiKey}
          onChange={onGoogleApiKeyChange}
          savedValue={savedGoogleApiKey}
          placeholder={t('common.placeholders.googleApiKey')}
        />
      )}

      {isOllama && (
        <>
          <Field
            label={t('pages.settings.fields.ollamaUrl.label')}
            helperText={t('pages.settings.fields.ollamaUrl.helper')}
          >
            <Input
              value={ollamaUrl}
              onChange={(e) => onOllamaUrlChange(e.target.value)}
              placeholder={t('pages.settings.fields.ollamaUrl.placeholder')}
              inputMode="url"
              autoComplete="off"
            />
          </Field>

          <Field
            label={t('pages.settings.fields.ollamaModel.label')}
            helperText={t('pages.settings.fields.ollamaModel.helper')}
            errorText={
              models.status === 'error'
                ? t('pages.settings.fields.ollamaModel.loadError', {
                    detail: models.error
                  })
                : undefined
            }
            invalid={models.status === 'error'}
          >
            {models.status === 'idle' ? (
              <Text textStyle="body" color="fg.muted">
                {t('pages.settings.fields.ollamaModel.enterUrl')}
              </Text>
            ) : (
              <HStack w="full" gap={2}>
                <SelectRoot
                  collection={modelCollection}
                  value={ollamaModel ? [ollamaModel] : []}
                  onValueChange={(details) => {
                    const next = details.value[0];
                    if (next) onOllamaModelChange(next);
                  }}
                  disabled={models.status !== 'success'}
                  size="md"
                  flex="1"
                >
                  <SelectTrigger>
                    <SelectValueText
                      placeholder={
                        models.status === 'loading'
                          ? t('pages.settings.fields.ollamaModel.loading')
                          : t('pages.settings.fields.ollamaModel.placeholder')
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {modelCollection.items.map((item) => (
                      <SelectItem key={item.value} item={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </SelectRoot>
                <IconButton
                  aria-label={t('pages.settings.fields.ollamaModel.refresh')}
                  variant="outline"
                  size="md"
                  onClick={models.refresh}
                  disabled={models.status === 'loading'}
                >
                  {models.status === 'loading' ? <Spinner size="sm" /> : <LuRefreshCw />}
                </IconButton>
              </HStack>
            )}
          </Field>

          {selectedModel?.is_small && (
            <Alert.Root status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {t('pages.settings.fields.ollamaModel.smallWarning', {
                    threshold: models.threshold
                  })}
                </Alert.Description>
              </Alert.Content>
            </Alert.Root>
          )}
        </>
      )}
    </SettingsSection>
  );
};
```

Check `frontend/src/components/ui/field.jsx` for the exact prop names it forwards (`errorText`, `invalid`) and adapt if they differ. If the saved-but-missing model's label is not rendered while the `Select` is closed (Chakra only renders `SelectValueText` from the collection), the test `keeps a saved model missing from the instance` finds it through `SelectValueText`, which renders the selected item's label.

- [ ] **Step 6: Wire the section into the page and slim `GeneralSection`**

`frontend/src/components/settings/GeneralSection.jsx`: remove the Google key props, the `SecretInput` block, and the now-unused imports (`Link`, `Trans`, `SecretInput`); update its docstring to "The "General" settings section: display language."

`frontend/src/components/settings/index.js`: add `export { AIProviderSection } from './AIProviderSection';`.

`frontend/src/components/settings/SettingsNav.jsx`: `const SECTIONS = ['general', 'ai-provider', 'analysis', 'notifications'];` and translate each with a key map, since the anchor id is kebab-case:

```js
const SECTIONS = [
  { id: 'general', key: 'general' },
  { id: 'ai-provider', key: 'aiProvider' },
  { id: 'analysis', key: 'analysis' },
  { id: 'notifications', key: 'notifications' }
];
```

rendering `key={section.id}`, `href={`#${section.id}`}` and `t(`pages.settings.sections.${section.key}`)`.

`frontend/src/pages/SettingsPage.jsx`: add to `DEFAULT_DRAFT` `ai_provider: 'google_ai_studio', ollama_url: '', ollama_model: '',`; drop the Google props from `<GeneralSection>`; add after it:

```jsx
          <AIProviderSection
            provider={draft.ai_provider}
            onProviderChange={setField('ai_provider')}
            providerOptions={config.ai_provider_options}
            googleApiKey={draft.google_api_key}
            onGoogleApiKeyChange={setField('google_api_key')}
            savedGoogleApiKey={config.google_api_key || ''}
            ollamaUrl={draft.ollama_url}
            onOllamaUrlChange={setField('ollama_url')}
            ollamaModel={draft.ollama_model}
            onOllamaModelChange={setField('ollama_model')}
          />
```

and import `AIProviderSection` from `@/components/settings`.

- [ ] **Step 7: Update the config fixtures used by other tests**

Run `grep -rln "google_api_key" src e2e` and, in every config fixture object it lists (e.g. `AppShell.test.jsx`, `TelegramSetup*.test.jsx`, `NotificationsSection.test.jsx`, `settingsDraft.test.js`, `e2e/fixtures/config.js`'s `buildConfig`), add:

```js
    ai_provider: 'google_ai_studio',
    ai_provider_options: ['google_ai_studio', 'ollama'],
    ollama_url: null,
    ollama_model: null,
```

- [ ] **Step 8: Run the frontend tests and lint**

Run: `cd frontend && npx vitest run && npm run lint && npm run format`
Expected: all PASS, no lint errors.

- [ ] **Step 9: Commit**

```bash
git add frontend
git commit -m "feat(frontend): choose the AI provider and the Ollama model in Settings"
```

---

### Task 9: Dashboard notice by reason and end-to-end coverage

**Files:**
- Modify: `frontend/src/components/dashboard/DailyCheckNotice.jsx`, `frontend/src/components/dashboard/DailyCheckNotice.test.jsx`, `frontend/src/lib/api/dailyCheck.js`, `frontend/src/i18n/english.json`, `frontend/src/i18n/spanish.json`, `frontend/e2e/support/apiMock.js`, `frontend/e2e/settings.spec.js`

**Interfaces:**
- Consumes: `DailyCheckStatusResponse.limit_reason` (Task 6); `AIProviderSection` (Task 8).

- [ ] **Step 1: Add the translations**

`english.json` → `pages.dashboard.dailyCheck`:

```json
"unavailable_one": "Ollama unavailable since {{time}} with {{count}} price left to check today.",
"unavailable_other": "Ollama unavailable since {{time}} with {{count}} prices left to check today.",
"allCheckedUnavailable": "Ollama was unavailable at {{time}}; all prices were checked by retrying."
```

`spanish.json` → `pages.dashboard.dailyCheck`:

```json
"unavailable_one": "Ollama no disponible desde las {{time}} con {{count}} precio pendiente de revisar hoy.",
"unavailable_other": "Ollama no disponible desde las {{time}} con {{count}} precios pendientes de revisar hoy.",
"allCheckedUnavailable": "Ollama no estaba disponible a las {{time}}; todos los precios se revisaron con reintentos."
```

- [ ] **Step 2: Write the failing tests**

Add to `frontend/src/components/dashboard/DailyCheckNotice.test.jsx`:

```jsx
  it('names Ollama on an unavailable day', async () => {
    dailyCheckApi.get.mockResolvedValue(status({ limit_reason: 'unavailable' }));
    renderWithProviders(<DailyCheckNotice locale="en-GB" timeZone="UTC" />);

    expect(
      await screen.findByText(
        'Ollama unavailable since 12:03 with 15 prices left to check today.'
      )
    ).toBeInTheDocument();
  });

  it('keeps the Gemini text on a quota day', async () => {
    dailyCheckApi.get.mockResolvedValue(status({ limit_reason: 'quota' }));
    renderWithProviders(<DailyCheckNotice locale="en-GB" timeZone="UTC" />);

    expect(
      await screen.findByText(
        'Gemini limit reached at 12:03 with 15 prices left to check today.'
      )
    ).toBeInTheDocument();
  });

  it('says all were checked after an outage', async () => {
    dailyCheckApi.get.mockResolvedValue(
      status({ limit_reason: 'unavailable', pending_now: 0 })
    );
    renderWithProviders(<DailyCheckNotice locale="en-GB" timeZone="UTC" />);

    expect(
      await screen.findByText(
        'Ollama was unavailable at 12:03; all prices were checked by retrying.'
      )
    ).toBeInTheDocument();
  });
```

Add to `frontend/e2e/settings.spec.js`:

```js
  test('saves Ollama as the AI provider', async ({ page, apiMock }) => {
    apiMock.setConfig(CONFIG_NOT_CONFIGURED);
    apiMock.setCategories([]);
    apiMock.setProducts([]);
    apiMock.setOllamaModels({
      models: [
        { name: 'gemma4:e4b', parameter_size: '8.0B', parameter_billions: 8, is_small: true },
        { name: 'qwen3.8:latest', parameter_size: '27.3B', parameter_billions: 27.3, is_small: false }
      ],
      small_model_threshold_b: 20
    });
    await page.goto('/settings');

    await page.getByRole('radio', { name: 'Ollama' }).click();
    await page.getByLabel('Ollama URL').fill('192.168.1.20:11434');
    await page.getByRole('combobox', { name: 'Model' }).click();
    await page.getByRole('option', { name: 'gemma4:e4b · 8.0B' }).click();
    await expect(page.getByText(/Models under 20B parameters/)).toBeVisible();
    await page.getByRole('button', { name: 'Save' }).click();

    await expect.poll(() => apiMock.config.ai_provider).toBe('ollama');
    expect(apiMock.config.ollama_url).toBe('192.168.1.20:11434');
    expect(apiMock.config.ollama_model).toBe('gemma4:e4b');
  });
```

(If the segmented control's options are not exposed as `radio`, use the role the existing responsive/visual specs use for `SegmentedControl` items, or `page.getByText('Ollama', { exact: true })`.)

- [ ] **Step 3: Run the tests to verify they fail**

Run: `cd frontend && npx vitest run src/components/dashboard/DailyCheckNotice.test.jsx`
Expected: FAIL (Gemini text shown for the unavailable day)

- [ ] **Step 4: Pick the notice text by reason**

In `DailyCheckNotice.jsx`, after `const isPending = ...`:

```jsx
  const isUnavailable = data.limit_reason === 'unavailable';
  const pendingKey = isUnavailable ? 'unavailable' : 'limitReached';
  const doneKey = isUnavailable ? 'allCheckedUnavailable' : 'allChecked';
```

use `t(`pages.dashboard.dailyCheck.${pendingKey}`, { time, count: data.pending_at_limit })` and `t(`pages.dashboard.dailyCheck.${doneKey}`, { time })`, and update the component docstring's first line to "Dashboard notice for days the daily price check was stopped by the AI provider (Gemini quota reached or Ollama unavailable)". In `lib/api/dailyCheck.js`, update the docstring: "…pending a retry after the AI provider stopped the check (Gemini quota or provider unavailable)".

- [ ] **Step 5: Mock the models endpoint in the e2e API mock**

In `frontend/e2e/support/apiMock.js`: in the constructor add

```js
    /** `GET /ai/ollama/models` response. */
    this.ollamaModels = { models: [], small_model_threshold_b: 20 };
```

a setter

```js
  /** @param {object} response A full `OllamaModelsResponse`-shaped object. */
  setOllamaModels(response) {
    this.ollamaModels = response;
  }
```

and a route next to `/daily-check/`:

```js
    await page.route(`${API_URL}/ai/ollama/models?*`, (route) =>
      route.request().method() === 'GET'
        ? route.fulfill({ json: this.ollamaModels })
        : this._recordUnmatched(route)
    );
```

- [ ] **Step 6: Run the frontend unit and e2e suites**

Run: `cd frontend && npx vitest run && npx playwright test e2e/settings.spec.js e2e/navigation.spec.js e2e/responsive.spec.js && npm run lint && npm run format`
Expected: all PASS. If `e2e/visual.spec.js`'s settings snapshot changes because of the new section, review the diff visually and update it with `npx playwright test e2e/visual.spec.js --update-snapshots` only if the new section renders as intended.

- [ ] **Step 7: Commit**

```bash
git add frontend
git commit -m "feat(frontend): tell apart quota and provider outages on the dashboard"
```

---

### Task 10: Documentation and final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the README**

- Intro (line ~27) and features table: "an **AI agent** ([Stagehand](https://github.com/browserbase/stagehand) + Google Gemini or a self-hosted Ollama model)".
- Features: rename "Gemini Quota Handling" to "AI Provider Outages" and describe both cases: the Gemini quota running out, or the Ollama instance being unreachable; offers left are retried every 10 minutes; Telegram alerts when Ollama is unreachable and when it is back.
- Tech stack table: add `| [Ollama](https://ollama.com/) | Optional self-hosted LLM for the AI extraction |`.
- Data model: document `DailyCheckRun.limit_reason`, `unavailable_alert_sent`, `recovered_alert_sent`.
- Config table: add rows `ai_provider` (`google_ai_studio`; `google_ai_studio` or `ollama`), `ollama_url` (`""`; base URL of the Ollama instance, e.g. `http://192.168.1.20:11434`), `ollama_model` (`""`; Ollama model tag).
- API table: add `| GET | /ai/ollama/models?url=… | Models installed on an Ollama instance, with their size and whether they are under 20B parameters |`; mention `limit_reason` in the `/daily-check/` row.
- Prerequisites: "A **Google API key** with access to Gemini models, **or** an Ollama instance reachable from the backend (models of 20B+ parameters recommended; smaller ones don't guarantee good results)".
- Settings table: replace the Google API key row with an "AI provider" row (Google AI Studio with its API key, or Ollama with its URL and model).
- Cronjob section (lines ~660–692): say the run stops on a Gemini quota error **or** when the AI provider cannot be reached (checked with a cheap preflight before each pass for Ollama), and describe the two Telegram provider alerts (at most once each per day, whenever Telegram is configured).
- Add a short "Using Ollama" subsection: why the Stagehand callback is used (Stagehand v4 has no Ollama provider or `base_url`), the `\d` → `[0-9]` schema rewrite, and that Docker needs the instance to be reachable from the container (use its LAN IP, not `localhost`).

- [ ] **Step 2: Recreate the local database**

The baseline migration changed and the local `backend/db/database.db` is already stamped at it, so it would not get the new columns. Back it up and recreate it:

```bash
mv backend/db/database.db backend/db/database.db.bak-pre-ollama
just db-init
```

(Check `just --list` for the exact recipe name if `db-init` differs.)

- [ ] **Step 3: Full verification**

Run: `just lint && just test` (or, if `just test` is not defined, `cd backend && uv run pytest -q` and `cd frontend && npx vitest run`).
Expected: all PASS.

Manual smoke test with the real instance: set Ollama (`http://192.168.1.20:11434`, `qwen3.8:latest`) in Settings, add a product from a URL, then run `cd backend && uv run python -m src.product_status_cronjob` after setting the analysis hour to the current hour; switch the instance off and run it again to see the Telegram alert.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the Ollama AI provider"
```
