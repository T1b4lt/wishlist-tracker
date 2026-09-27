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
