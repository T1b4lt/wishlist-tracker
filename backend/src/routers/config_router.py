"""
Configuration router — GET/PATCH /config/ endpoints.
"""

from fastapi import APIRouter

from src.core.database import SessionDep
from src.schemas.config import ConfigResponse, ConfigUpdate
from src.services import config_service

router = APIRouter(tags=["config"])


@router.get("/config/")
def get_config(session: SessionDep) -> ConfigResponse:
    """Retrieve all application configuration values."""
    return config_service.get_all_config(session)


@router.patch("/config/")
def update_config(config_update: ConfigUpdate, session: SessionDep) -> ConfigResponse:
    """Partially update application configuration values."""
    return config_service.update_config(session, config_update)
