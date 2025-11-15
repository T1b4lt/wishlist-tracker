# wishlist-tracker

A simple application to track and manage your wishlist items, but with some AI-powered features to enhance your experience.

## Features

- Add, edit, and delete wishlist items.
- Categorize items for better organization. Create your own categories.
- Set priority levels for each item: High, Medium, Low.
- AI-powered price tracking. An AI agent will monitor prices.
- Receive notifications throw Telegram when prices drop.

## Installation

WIP (but it will be a Docker-based self-hosted OSS application.)

## Tech Stack

### Frontend

Vite, React with JavaScript, Chakra UI and Wouter for routing.

### Backend

FastAPI with Python, SQLite for the database, Stagehand for AI agent scraping and monitoring and Telegram Bot API for notifications.

## Development Setup

1. Clone the repository
2. Navigate to the backend directory: `cd backend`
3. Create a virtual environment: `uv venv -p 3.11`
4. Install the required packages: `pip install -r requirements.txt`
5. Install playwright deps and browsers: `playwright install-deps & playwright install`
6. Set up environment variables by creating a `.env` file based on the provided `.env.example`.
7. Set up the database: `python src/setup_backend.py --populate` (use `--populate` or `-p` to add test data)
8. Run the backend server: `uvicorn src.api:app --reload`
9. WIP