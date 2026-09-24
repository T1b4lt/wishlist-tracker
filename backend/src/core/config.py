"""
Application configuration helpers.

Provides low-level get/set access to the Config table and
defines the default values used during database setup.
"""

from sqlmodel import Session, select
from src.models.database_models import Config

# Default configuration values used during initial database setup
# and as fallback when a key is missing.
CONFIG_DEFAULTS = {
    "analysis_hour": "12",
    "hist_window_size": "60",
    "is_price_drop_alert": "false",
    "is_stock_change_alert": "false",
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
