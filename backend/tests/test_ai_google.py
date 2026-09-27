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
