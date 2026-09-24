"""
Configuration service — business logic for reading and updating app config.

Orchestrates the low-level get/set helpers from core.config and applies
validation rules before persisting changes.
"""

from fastapi import HTTPException
from sqlmodel import Session
from src.core.config import get_config_value, set_config_value
from src.schemas.config import ConfigResponse, ConfigUpdate


def _compute_telegram_status(token: str | None, chat_id: str | None) -> str:
    """Derive the Telegram connection status from the stored credentials.

    This is never persisted; it is recomputed on every read from the
    current token/chat id values.

    Args:
        token (str | None): The stored Telegram bot token, if any.
        chat_id (str | None): The stored Telegram chat id, if any.

    Returns:
        str: One of ``"not_configured"``, ``"token_only"`` or ``"connected"``.
    """
    if token and chat_id:
        return "connected"
    if token:
        return "token_only"
    return "not_configured"


def get_all_config(session: Session) -> ConfigResponse:
    """Build a full ConfigResponse from the database.

    Args:
        session (Session): Active database session.

    Returns:
        ConfigResponse: Current application configuration.
    """
    token = get_config_value(session, "telegram_bot_token")
    chat_id = get_config_value(session, "telegram_bot_chat_id")
    google_key = get_config_value(session, "google_api_key")

    return ConfigResponse(
        analysis_hour=int(get_config_value(session, "analysis_hour", "12")),
        hist_window_size=int(get_config_value(session, "hist_window_size", "60")),
        is_price_drop_alert=get_config_value(
            session, "is_price_drop_alert", "false"
        ).lower()
        == "true",
        is_stock_change_alert=get_config_value(
            session, "is_stock_change_alert", "false"
        ).lower()
        == "true",
        telegram_bot_token=token if token else None,
        telegram_bot_chat_id=chat_id if chat_id else None,
        selected_language=get_config_value(session, "selected_language", "english"),
        google_api_key=google_key if google_key else None,
        telegram_status=_compute_telegram_status(token, chat_id),
    )


def update_config(session: Session, config_update: ConfigUpdate) -> ConfigResponse:
    """Validate and apply partial configuration updates.

    Args:
        session (Session): Active database session.
        config_update (ConfigUpdate): Fields to update (only non-None values).

    Returns:
        ConfigResponse: The full configuration after applying changes.

    Raises:
        HTTPException: If a value fails validation (e.g. hour out of range).
    """
    if config_update.analysis_hour is not None:
        if config_update.analysis_hour < 0 or config_update.analysis_hour > 23:
            raise HTTPException(
                status_code=400, detail="analysis_hour must be between 0 and 23"
            )
        set_config_value(session, "analysis_hour", str(config_update.analysis_hour))

    if config_update.hist_window_size is not None:
        if config_update.hist_window_size < 30 or config_update.hist_window_size > 180:
            raise HTTPException(
                status_code=400, detail="hist_window_size must be between 30 and 180"
            )
        set_config_value(
            session, "hist_window_size", str(config_update.hist_window_size)
        )

    if config_update.is_price_drop_alert is not None:
        set_config_value(
            session,
            "is_price_drop_alert",
            str(config_update.is_price_drop_alert).lower(),
        )

    if config_update.is_stock_change_alert is not None:
        set_config_value(
            session,
            "is_stock_change_alert",
            str(config_update.is_stock_change_alert).lower(),
        )

    if config_update.telegram_bot_token is not None:
        set_config_value(
            session, "telegram_bot_token", config_update.telegram_bot_token
        )

    if config_update.telegram_bot_chat_id is not None:
        set_config_value(
            session, "telegram_bot_chat_id", config_update.telegram_bot_chat_id
        )

    if config_update.selected_language is not None:
        set_config_value(session, "selected_language", config_update.selected_language)

    if config_update.google_api_key is not None:
        set_config_value(session, "google_api_key", config_update.google_api_key)

    session.commit()

    return get_all_config(session)
