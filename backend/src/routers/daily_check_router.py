"""
Daily check router — today's price-check status for the dashboard.
"""

from fastapi import APIRouter
from src.core.database import SessionDep
from src.schemas.daily_check import DailyCheckStatusResponse
from src.services import daily_check_service

router = APIRouter(tags=["daily-check"])


@router.get("/daily-check/")
def get_daily_check(session: SessionDep) -> DailyCheckStatusResponse:
    """Return today's check snapshot and how many products are still pending."""
    return daily_check_service.get_status(session)
