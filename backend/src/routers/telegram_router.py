"""
Telegram router — endpoints for chat ID retrieval and test notifications.
"""

from fastapi import APIRouter
from src.core.database import SessionDep
from src.services import telegram_service

router = APIRouter(tags=["telegram"])


@router.get("/telegram-chat-id")
async def get_telegram_chat_id(session: SessionDep) -> dict:
    """Retrieve the most recent Telegram chat ID and save it."""
    return await telegram_service.fetch_and_save_chat_id(session)


@router.post("/telegram-test-message")
async def send_telegram_test_message(session: SessionDep) -> dict:
    """Send a test message to the configured Telegram chat."""
    return await telegram_service.send_test(session)
