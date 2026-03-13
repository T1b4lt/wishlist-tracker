"""
Telegram service — orchestrates config retrieval and Telegram utility calls.

This service reads Telegram credentials and language settings from the
database and delegates the actual Telegram API calls to telegram_utils.
"""

from fastapi import HTTPException
from sqlmodel import Session

from src.core.config import get_config_value, set_config_value
from src.models.database_models import Config
from src.telegram_utils import get_chat_id, send_test_message


async def fetch_and_save_chat_id(session: Session) -> dict:
    """Retrieve the most recent Telegram chat ID and persist it.

    Args:
        session (Session): Active database session.

    Returns:
        dict: Confirmation message.

    Raises:
        HTTPException: 400 if the bot token is missing, 404 if no chat found.
    """
    telegram_bot_token = get_config_value(session, "telegram_bot_token")
    if not telegram_bot_token:
        raise HTTPException(
            status_code=400, detail="Telegram bot token not configured")

    chat_id = await get_chat_id(telegram_bot_token)
    if not chat_id:
        raise HTTPException(
            status_code=404,
            detail="No chat ID found. Please send a message to the bot first.",
        )

    # Persist the chat ID
    set_config_value(session, "telegram_bot_chat_id", chat_id)
    session.commit()

    return {"message": "Chat ID saved successfully"}


async def send_test(session: Session) -> dict:
    """Send a test notification to the configured Telegram chat.

    Args:
        session (Session): Active database session.

    Returns:
        dict: Confirmation message.

    Raises:
        HTTPException: 400 if token or chat ID missing, 500 on send failure.
    """
    telegram_bot_token = get_config_value(session, "telegram_bot_token")
    if not telegram_bot_token:
        raise HTTPException(
            status_code=400, detail="Telegram bot token not configured")

    telegram_bot_chat_id = get_config_value(session, "telegram_bot_chat_id")
    if not telegram_bot_chat_id:
        raise HTTPException(
            status_code=400,
            detail="Telegram chat ID not configured. Please call /telegram-chat-id first.",
        )

    selected_language = get_config_value(
        session, "selected_language", "english")

    try:
        await send_test_message(
            telegram_bot_token, telegram_bot_chat_id, selected_language
        )
        return {"message": "Test message sent successfully"}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to send test message: {str(e)}")
