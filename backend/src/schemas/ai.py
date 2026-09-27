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
