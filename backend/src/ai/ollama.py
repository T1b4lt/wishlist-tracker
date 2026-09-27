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
        models = []
        for entry in response.json().get("models", []):
            size = (entry.get("details") or {}).get("parameter_size") or None
            models.append(
                OllamaModel(entry["name"], size, parse_parameter_billions(size))
            )
    # A malformed URL (``httpx.InvalidURL``) or an answer that is not an
    # Ollama tag list (e.g. another service's JSON) means the configured
    # instance cannot be used: treated like an unreachable one.
    except (
        httpx.HTTPError,
        httpx.InvalidURL,
        ValueError,
        AttributeError,
        TypeError,
        KeyError,
    ) as error:
        raise ProviderUnavailableError(
            f"Could not reach Ollama at {url}: {error}"
        ) from error
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
        except (httpx.HTTPError, httpx.InvalidURL) as error:
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
