"""
Application configuration helpers.

Provides low-level get/set access to the Config table and
defines the default values used during database setup.
"""

from typing import Literal

from sqlmodel import Session, select
from src.models.database_models import Config

# Historical window options, in days. Mirrored by the frontend
# (``frontend/src/lib/histWindow.js``) and pinned for both sides by
# ``contracts/hist-window.json``.
HIST_WINDOW_OPTIONS = (30, 60, 90, 180)
DEFAULT_HIST_WINDOW = 60
HistWindowSize = Literal[30, 60, 90, 180]

# Telegram daily check report modes. Mirrored by the frontend
# (``frontend/src/lib/dailyCheckReport.js``) and pinned for both sides by
# ``contracts/daily-check-report.json``.
DAILY_CHECK_REPORT_OPTIONS = ("off", "limit_days", "every_day")
DEFAULT_DAILY_CHECK_REPORT = "limit_days"
DailyCheckReport = Literal["off", "limit_days", "every_day"]

# Default configuration values used during initial database setup
# and as fallback when a key is missing.
CONFIG_DEFAULTS = {
    "analysis_hour": "12",
    "hist_window_size": str(DEFAULT_HIST_WINDOW),
    "is_price_drop_alert": "false",
    "is_stock_change_alert": "false",
    "daily_check_report": DEFAULT_DAILY_CHECK_REPORT,
    "telegram_bot_token": "",
    "telegram_bot_chat_id": "",
    "selected_language": "english",
    "google_api_key": "",
}


def get_config_value(session: Session, key: str, default: str = "") -> str:
    """Retrieve a configuration value from the database.

    Args:
        session (Session): The database session.
        key (str): The configuration key to look up.
        default (str): The default value if the key is not found.

    Returns:
        str: The configuration value, or the default.
    """
    config = session.exec(select(Config).where(Config.key == key)).first()
    return config.value if config else default


def set_config_value(session: Session, key: str, value: str) -> None:
    """Create or update a configuration value in the database.

    This function does **not** commit the transaction. The caller is
    responsible for calling ``session.commit()`` after one or more
    updates have been staged.

    Args:
        session (Session): The database session.
        key (str): The configuration key.
        value (str): The value to set.
    """
    config = session.exec(select(Config).where(Config.key == key)).first()
    if config:
        config.value = value
    else:
        session.add(Config(key=key, value=value))


def get_hist_window_size(session: Session) -> int:
    """Return the configured historical window size, in days.

    A stored value that is not a positive integer (e.g. a corrupted row)
    falls back to ``DEFAULT_HIST_WINDOW``. A positive value outside
    ``HIST_WINDOW_OPTIONS`` (saved before the options were enforced) is
    returned as-is.

    Args:
        session (Session): The database session.

    Returns:
        int: The window size in days.
    """
    raw = get_config_value(session, "hist_window_size", str(DEFAULT_HIST_WINDOW))
    try:
        value = int(raw)
    except ValueError:
        return DEFAULT_HIST_WINDOW
    return value if value > 0 else DEFAULT_HIST_WINDOW


def get_daily_check_report(session: Session) -> str:
    """Return the configured Telegram daily check report mode.

    An unknown stored value falls back to ``DEFAULT_DAILY_CHECK_REPORT``.

    Args:
        session (Session): The database session.

    Returns:
        str: One of ``DAILY_CHECK_REPORT_OPTIONS``.
    """
    value = get_config_value(session, "daily_check_report", DEFAULT_DAILY_CHECK_REPORT)
    return value if value in DAILY_CHECK_REPORT_OPTIONS else DEFAULT_DAILY_CHECK_REPORT
