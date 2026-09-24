"""Request and response schemas for application configuration."""

from pydantic import BaseModel


class ConfigUpdate(BaseModel):
    """Partial update payload for application configuration."""

    analysis_hour: int | None = None
    hist_window_size: int | None = None
    is_price_drop_alert: bool | None = None
    is_stock_change_alert: bool | None = None
    telegram_bot_token: str | None = None
    telegram_bot_chat_id: str | None = None
    selected_language: str | None = None
    google_api_key: str | None = None


class ConfigResponse(BaseModel):
    """Full configuration snapshot returned to the client."""

    analysis_hour: int
    hist_window_size: int
    is_price_drop_alert: bool
    is_stock_change_alert: bool
    telegram_bot_token: str | None
    telegram_bot_chat_id: str | None
    selected_language: str
    google_api_key: str | None
    telegram_status: str
