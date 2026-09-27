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
