"""Request and response schemas for application configuration."""

from pydantic import BaseModel
from src.core.config import DailyCheckReport, HistWindowSize


class ConfigUpdate(BaseModel):
    """Partial update payload for application configuration."""

    analysis_hour: int | None = None
    hist_window_size: HistWindowSize | None = None
    is_price_drop_alert: bool | None = None
    is_stock_change_alert: bool | None = None
    daily_check_report: DailyCheckReport | None = None
    telegram_bot_token: str | None = None
    telegram_bot_chat_id: str | None = None
    selected_language: str | None = None
    google_api_key: str | None = None


class ConfigResponse(BaseModel):
    """Full configuration snapshot returned to the client.

    The ``*_options`` fields and ``stale_after_days`` are read-only: they
    tell the client which values it can offer and how the backend decides
    staleness, so the client never hard-codes them.
    """

    analysis_hour: int
    hist_window_size: HistWindowSize
    is_price_drop_alert: bool
    is_stock_change_alert: bool
    daily_check_report: DailyCheckReport
    telegram_bot_token: str | None
    telegram_bot_chat_id: str | None
    selected_language: str
    google_api_key: str | None
    telegram_status: str
    hist_window_options: list[int]
    daily_check_report_options: list[str]
    stale_after_days: int
