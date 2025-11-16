import asyncio
from telegram import Bot
from telegram.error import TelegramError


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
            print("No conversations found. The bot needs to receive at least one message first.")
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
    Send a test message to the specified chat ID.

    Args:
        bot_token: The Telegram bot token
        chat_id: The chat ID to send the message to
        lang: Language code for localization ("english" or "spanish")
    """
    # Define messages for different languages
    messages = {
        "english": "Hello, I'm working!",
        "spanish": "Hola, estoy funcionando"
    }

    # Get the appropriate message text, default to English if lang is not recognized
    message_text = messages.get(lang.lower(), messages["english"])

    bot = Bot(token=bot_token)

    try:
        await bot.send_message(chat_id=chat_id, text=message_text)
        print(f"✓ Message sent successfully to chat_id: {chat_id}")

    except TelegramError as e:
        print(f"✗ Error sending message to chat_id {chat_id}: {e}")
    except Exception as e:
        print(f"Unexpected error: {e}")


if __name__ == "__main__":
    # To execute: python telegram_utils.py
    # Replace with your actual bot token and chat ID
    asyncio.run(send_test_message("8438293186:AAFYZeaHNt8u5W96PCiVpulEEtwzOukjdI0", "5650836295", "english"))
