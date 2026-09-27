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
