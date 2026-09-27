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
