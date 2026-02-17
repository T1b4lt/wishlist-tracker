import asyncio
from dotenv import load_dotenv

from telegram import Bot, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.error import TelegramError

# Map common currency codes to their symbols
currency_symbols = {
    "EUR": "€",
    "USD": "$",
    "GBP": "£",
    "JPY": "¥",
    "CNY": "¥",
    "CAD": "$",
    "AUD": "$"
}


def escape_markdown(text: str) -> str:
    """Escape special characters for Telegram MarkdownV2 format.

    Args:
        text (str): The text to escape.

    Returns:
        str: The escaped text safe for MarkdownV2 parsing.
    """
    special_chars = ['_', '*', '[', ']',
                     '(', ')', '~', '`', '>', '#', '+', '-', '=', '|', '{', '}', '.', '!']
    for char in special_chars:
        text = text.replace(char, f'\\{char}')
    return text


async def get_chat_id(bot_token: str) -> str:
    """
    Retrieve the chat ID of the most recent conversation the bot has had.

    Args:
        bot_token: The Telegram bot token

    Returns:
        The chat ID as a string, or None if no conversations are found.
    """
    bot = Bot(token=bot_token)

    try:
        # Get updates to find the most recent chat ID
        updates = await bot.get_updates(limit=1, timeout=10)

        if not updates:
            print(
                "No conversations found. The bot needs to receive at least one message first.")
            return None

        # Extract the chat ID from the most recent update
        latest_update = updates[-1]
        if latest_update.message and latest_update.message.chat:
            return str(latest_update.message.chat.id)
        elif latest_update.edited_message and latest_update.edited_message.chat:
            return str(latest_update.edited_message.chat.id)
        elif latest_update.channel_post and latest_update.channel_post.chat:
            return str(latest_update.channel_post.chat.id)
        elif latest_update.callback_query and latest_update.callback_query.message:
            return str(latest_update.callback_query.message.chat.id)

        print("No valid chat found in the latest update.")
        return None

    except TelegramError as e:
        print(f"Error connecting to Telegram: {e}")
        return None
    except Exception as e:
        print(f"Unexpected error: {e}")
        return None


async def send_test_message(bot_token: str, chat_id: str, lang: str):
    """
    Send a test message to the specified chat ID using real alert methods.

    Args:
        bot_token: The Telegram bot token
        chat_id: The chat ID to send the message to
        lang: Language code for localization ("english" or "spanish")
    """
    # Define initial messages for different languages
    messages = {
        "english": (
            "🎉 *Wishlist Tracker Test Notification*\n\n"
            "Everything is working correctly\\!\n"
            "From now on, you will receive alerts like the examples below\\."
        ),
        "spanish": (
            "🎉 *Notificación de Prueba de Wishlist Tracker*\n\n"
            "¡Todo está funcionando correctamente\\!\n"
            "A partir de ahora, recibirás alertas como los ejemplos a continuación\\."
        )
    }

    # Get the appropriate message text
    message_text = messages.get(lang.lower(), messages["english"])

    bot = Bot(token=bot_token)

    try:
        # Send initial test message
        await bot.send_message(chat_id=chat_id, text=message_text, parse_mode='MarkdownV2')
        print(
            f"✓ Initial test message sent successfully to chat_id: {chat_id}")

        # Send example price drop alert
        await send_price_drop_alert(
            bot_token=bot_token,
            chat_id=chat_id,
            product_name="Example Product",
            product_url="https://www.amazon.es",
            old_price=20.0,
            new_price=10.0,
            lang=lang,
            currency="EUR"
        )
        print(
            f"✓ Example price drop alert sent successfully to chat_id: {chat_id}")

        # Send example stock alert
        await send_stock_alert(
            bot_token=bot_token,
            chat_id=chat_id,
            product_name="Example Product",
            product_url="https://www.amazon.es",
            current_price=10.0,
            lang=lang,
            currency="EUR"
        )
        print(f"✓ Example stock alert sent successfully to chat_id: {chat_id}")

    except TelegramError as e:
        print(f"✗ Error sending message to chat_id {chat_id}: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")


async def send_price_drop_alert(
    bot_token: str,
    chat_id: str,
    product_name: str,
    product_url: str,
    old_price: float,
    new_price: float,
    lang: str,
    currency: str
):
    """
    Send a price drop alert notification to the specified chat ID.

    Args:
        bot_token: The Telegram bot token
        chat_id: The chat ID to send the message to
        product_name: The name of the product
        product_url: The URL of the product
        old_price: The previous price
        new_price: The new (lower) price
        lang: Language code for localization ("english" or "spanish")
        currency: Currency code (e.g., EUR, USD, GBP)
    """

    # Get the currency symbol, default to currency code if not found
    currency_symbol = currency_symbols.get(currency.upper(), currency)

    # Calculate price drop percentage
    price_drop_percentage = ((old_price - new_price) / old_price) * 100

    escaped_product_name = escape_markdown(product_name)

    # Format prices with proper escaping
    old_price_str = f"{old_price:.2f}{currency_symbol}".replace(
        '.', '\\.').replace('-', '\\-')
    new_price_str = f"{new_price:.2f}{currency_symbol}".replace(
        '.', '\\.').replace('-', '\\-')
    percentage_str = f"{price_drop_percentage:.0f}%".replace(
        '.', '\\.').replace('-', '\\-')

    # Define messages for different languages
    messages = {
        "english": (
            f"📉 *Price Drop Alert*\\!\n\n"
            f"Product: {escaped_product_name}\n"
            f"Old Price: ~{old_price_str}~\n"
            f"New Price: *{new_price_str}* \\({percentage_str}\\)\n"
            f"*Great Deal\\!*"
        ),
        "spanish": (
            f"📉 *Alerta de Bajada de Precio*\\!\n\n"
            f"Producto: {escaped_product_name}\n"
            f"Precio Anterior: ~{old_price_str}~\n"
            f"Precio Nuevo: *{new_price_str}* \\({percentage_str}\\)\n"
            f"*¡Gran Oferta\\!*"
        )
    }

    # Get the appropriate message text, default to English if lang is not recognized
    message_text = messages.get(lang.lower(), messages["english"])

    # Create an inline keyboard with a button to the product URL
    button_text = "🛒 View Product" if lang.lower() == "english" else "🛒 Ver Producto"
    keyboard = [[InlineKeyboardButton(button_text, url=product_url)]]
    reply_markup = InlineKeyboardMarkup(keyboard)

    bot = Bot(token=bot_token)

    try:
        await bot.send_message(
            chat_id=chat_id,
            text=message_text,
            parse_mode='MarkdownV2',
            reply_markup=reply_markup
        )
        return True
    except TelegramError as e:
        print(f"✗ Error sending price drop alert: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error sending price drop alert: {e}")
        return False


async def send_stock_alert(
    bot_token: str,
    chat_id: str,
    product_name: str,
    product_url: str,
    current_price: float,
    lang: str,
    currency: str
):
    """
    Send a stock availability alert notification to the specified chat ID.

    Args:
        bot_token: The Telegram bot token
        chat_id: The chat ID to send the message to
        product_name: The name of the product
        product_url: The URL of the product
        current_price: The current price of the product
        lang: Language code for localization ("english" or "spanish")
        currency: Currency code (e.g., EUR, USD, GBP)
    """

    # Get the currency symbol, default to currency code if not found
    currency_symbol = currency_symbols.get(currency.upper(), currency)

    escaped_product_name = escape_markdown(product_name)

    # Format price with proper escaping
    price_str = f"{current_price:.2f}{currency_symbol}".replace(
        '.', '\\.').replace('-', '\\-')

    # Define messages for different languages
    messages = {
        "english": (
            f"✅ *Stock Alert*\\!\n\n"
            f"Product: {escaped_product_name}\n"
            f"Status: *Back in Stock\\!*\n"
            f"Current Price: *{price_str}*\n"
            f"*Don't miss out\\!*"
        ),
        "spanish": (
            f"✅ *Alerta de Stock*\\!\n\n"
            f"Producto: {escaped_product_name}\n"
            f"Estado: *¡Vuelve a estar en stock\\!*\n"
            f"Precio Actual: *{price_str}*\n"
            f"*¡No te lo pierdas\\!*"
        )
    }

    # Get the appropriate message text, default to English if lang is not recognized
    message_text = messages.get(lang.lower(), messages["english"])

    # Create an inline keyboard with a button to the product URL
    button_text = "🛒 View Product" if lang.lower() == "english" else "🛒 Ver Producto"
    keyboard = [[InlineKeyboardButton(button_text, url=product_url)]]
    reply_markup = InlineKeyboardMarkup(keyboard)

    bot = Bot(token=bot_token)

    try:
        await bot.send_message(
            chat_id=chat_id,
            text=message_text,
            parse_mode='MarkdownV2',
            reply_markup=reply_markup
        )
        return True
    except TelegramError as e:
        print(f"✗ Error sending stock alert: {e}")
        return False
    except Exception as e:
        print(f"✗ Unexpected error sending stock alert: {e}")
        return False


if __name__ == "__main__":
    # To execute: python telegram_utils.py
    # Replace with your actual bot token and chat ID
    import os

    load_dotenv(override=True)
    telegram_bot_token = os.getenv("DSA_TELEGRAM")
    asyncio.run(send_test_message(telegram_bot_token, "5650836295", "english"))
