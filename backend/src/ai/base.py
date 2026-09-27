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
