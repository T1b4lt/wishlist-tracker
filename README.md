# 🛒 Wishlist Tracker AI

> A self-hosted, AI-powered wishlist tracker that monitors product prices and stock availability across the web, sending real-time Telegram notifications when prices drop or items come back in stock.

---

## 📖 Table of Contents

- [Introduction](#-introduction)
- [Key Features](#-key-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Database Schema](#-database-schema)
- [API Reference](#-api-reference)
- [Installation & Setup](#-installation--setup)
- [Task Runner (just)](#-task-runner-just)
- [Git Hooks](#-git-hooks)
- [Configuration](#-configuration)
- [Usage Guide](#-usage-guide)
- [Cronjob Setup](#-cronjob-setup)
- [License](#-license)

---

## 🧠 Introduction

**Wishlist Tracker AI** is a full-stack application designed to help users keep track of products they wish to buy. Unlike traditional wishlists, this project leverages an **AI agent** ([Stagehand](https://github.com/browserbase/stagehand) + Google Gemini) to autonomously visit product pages, extract pricing and stock data, and build a historical record over time.

Key highlights:

- **Any product from any website** — the AI agent can navigate and extract data from virtually any e-commerce page.
- **Daily automated monitoring** — a configurable cronjob fetches product status once a day and stores the results.
- **Instant Telegram alerts** — get notified the moment a price drops or an item is back in stock.
- **Complete price history** — visualize how prices evolve over time with interactive charts.
- **Multi-language support** — the UI is fully translated in English and Spanish (i18n).

---

## ✨ Key Features

| Feature                    | Description                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Product Management**     | Add, edit, and delete wishlist items with custom categories and priority levels (High / Medium / Low).                                 |
| **AI-Powered Extraction**  | Automatically extract product name, category, description, currency, price, and stock status from any URL using Stagehand v4 + Gemini. |
| **Price Tracking**         | Historical price records stored daily, with configurable tracking window (30–180 days).                                                |
| **Interactive Dashboard**  | Overview of all products with current price, price change trend (%), stock status, and category indicators.                            |
| **Product Detail View**    | Detailed product page with full price history chart (Recharts), minimum price in window, and stock timeline.                           |
| **Category System**        | User-defined categories with custom colors for visual organization.                                                                    |
| **Telegram Notifications** | Real-time alerts for price drops and stock changes, with inline buttons linking to the product.                                        |
| **Configurable Settings**  | Analysis hour, history window size, notification toggles, language selection, and API keys — all from the UI.                          |
| **Multi-Language (i18n)**  | Full English and Spanish translations for the entire interface.                                                                        |
| **Dark Mode**              | Theme toggle built into Chakra UI.                                                                                                     |

---

## 🛠 Tech Stack

### Frontend

| Technology                                                | Purpose                                   |
| --------------------------------------------------------- | ----------------------------------------- |
| [Vite](https://vite.dev/)                                 | Build tool and dev server                 |
| [React 19](https://react.dev/)                            | UI library (functional components, hooks) |
| [Chakra UI v3](https://www.chakra-ui.com/)                | Component library and design system       |
| [Wouter](https://github.com/molefrog/wouter)              | Lightweight client-side routing           |
| [Recharts](https://recharts.org/)                         | Interactive charting for price history    |
| [react-icons](https://react-icons.github.io/react-icons/) | Icon library                              |
| [react-i18next](https://react.i18next.com/)               | Internationalization framework            |
| [next-themes](https://github.com/pacocoursey/next-themes) | Theme management (dark/light mode)        |

### Backend

| Technology                                                         | Purpose                           |
| ------------------------------------------------------------------ | --------------------------------- |
| [FastAPI](https://fastapi.tiangolo.com/)                           | Async REST API framework          |
| [SQLModel](https://sqlmodel.tiangolo.com/)                         | ORM (SQLAlchemy + Pydantic)       |
| [SQLite](https://www.sqlite.org/)                                  | Lightweight embedded database     |
| [Stagehand v4](https://github.com/browserbase/stagehand)           | AI browser agent for web scraping |
| [Google Gemini](https://ai.google.dev/)                            | LLM powering the AI extraction    |
| [python-telegram-bot](https://python-telegram-bot.readthedocs.io/) | Telegram Bot API integration      |
| [python-dotenv](https://pypi.org/project/python-dotenv/)           | Environment variable management   |

---

## 📁 Project Structure

```
wishlist-tracker/
├── README.md                         # This file
├── justfile                          # Task runner recipes (setup, dev, lint, db, docker)
├── Dockerfile                        # Multi-stage image (Node 24 build + Python 3.12 runtime)
├── .dockerignore                     # Files excluded from the Docker build context
├── entrypoint.sh                     # Container entrypoint (DB init, cron, API, Nginx)
├── nginx.conf                        # Nginx config (serves frontend, proxies /api)
├── .gitignore
│
├── backend/                          # Python backend (FastAPI)
│   ├── .env                          # Environment variables (API keys)
│   ├── pyproject.toml                # Python project & dependencies
│   ├── uv.lock                       # Locked dependency versions (uv)
│   ├── db/
│   │   └── database.db               # SQLite database (auto-generated)
│   └── src/
│       ├── api.py                    # FastAPI app factory (routers + middleware)
│       ├── core/                     # Shared infrastructure
│       │   ├── database.py           # DB engine, session, SQLite pragma, lifespan
│       │   └── config.py             # Config get/set helpers & default values
│       ├── models/
│       │   └── database_models.py    # SQLModel table definitions
│       ├── schemas/                  # Pydantic request/response schemas
│       │   ├── config.py             # ConfigUpdate, ConfigResponse
│       │   ├── category.py           # CategoryCreate, CategoryUpdate
│       │   └── product.py            # Product CRUD, Dashboard & Detail schemas
│       ├── services/                 # Business logic layer
│       │   ├── config_service.py     # Configuration read/update logic
│       │   ├── category_service.py   # Category CRUD operations
│       │   ├── product_service.py    # Product CRUD, dashboard, detail & AI extraction
│       │   └── telegram_service.py   # Telegram chat ID & test message orchestration
│       ├── routers/                  # FastAPI route definitions (thin controllers)
│       │   ├── config_router.py      # GET/PATCH /config/
│       │   ├── category_router.py    # CRUD /categories/
│       │   ├── product_router.py     # CRUD /products/ + /extract-product-info/
│       │   └── telegram_router.py    # /telegram-chat-id, /telegram-test-message
│       ├── stagehand_utils.py        # Stagehand v4 AI scraping functions
│       ├── telegram_utils.py         # Telegram notification helpers
│       ├── product_status_cronjob.py # Daily price tracking script
│       └── setup_backend.py          # Database initialization script
│
└── frontend/                         # React frontend (Vite)
    ├── index.html                    # HTML entry point
    ├── package.json                  # Node.js dependencies
    ├── vite.config.js                # Vite configuration (aliases)
    ├── eslint.config.js              # ESLint configuration
    ├── .prettierrc                   # Prettier formatting rules
    ├── public/
    │   └── vite.svg                  # Favicon
    └── src/
        ├── main.jsx                  # React entry point (Provider, Toaster, i18n)
        ├── App.jsx                   # Root component with routing
        ├── assets/                   # Static assets
        ├── i18n/
        │   ├── index.js              # i18next configuration
        │   ├── english.json          # English translations
        │   └── spanish.json          # Spanish translations
        ├── lib/
        │   └── web_utils.js          # Shared utility functions
        ├── components/
        │   ├── HeaderComponent.jsx   # App header with navigation
        │   ├── FooterComponent.jsx   # App footer
        │   ├── NewProductModal.jsx   # Modal for adding products (AI-assisted)
        │   ├── CategoryModal.jsx     # Modal for managing categories
        │   ├── DeleteProductDialog.jsx # Confirmation dialog for deletion
        │   └── ui/                   # Chakra UI primitive wrappers
        │       ├── provider.jsx
        │       ├── color-mode.jsx
        │       ├── dialog.jsx
        │       ├── drawer.jsx
        │       ├── field.jsx
        │       ├── select.jsx
        │       ├── switch.jsx
        │       ├── tag.jsx
        │       ├── toaster.jsx
        │       ├── close-button.jsx
        │       └── segmented-control.jsx
        └── pages/
            ├── DashboardPage.jsx     # Main dashboard with product grid
            ├── ProductPage.jsx       # Product detail with price chart
            ├── CategoriesPage.jsx    # Category management page
            ├── SettingsPage.jsx      # App settings & Telegram setup
            └── NotFoundPage.jsx      # 404 page
```

---

## 🗄 Database Schema

The application uses **SQLite** with **SQLModel** as ORM. There are 4 tables:

```
┌──────────────┐       ┌──────────────┐
│   Category   │       │    Config    │
├──────────────┤       ├──────────────┤
│ id (PK)      │       │ id (PK)      │
│ name         │       │ key (UNIQUE) │
│ color        │       │ value        │
└──────┬───────┘       └──────────────┘
       │ 1:N
       ▼
┌──────────────┐       ┌──────────────┐
│   Product    │       │ ProductHist  │
├──────────────┤       ├──────────────┤
│ id (PK)      │──1:N──│ id (PK)      │
│ name         │       │ product_id   │ (FK → Product, CASCADE DELETE)
│ url          │       │ price        │
│ priority     │       │ is_in_stock  │
│ category_id  │ (FK)  │ timestamp    │ (Unix seconds)
│ description  │       └──────────────┘
│ currency     │
└──────────────┘
```

**Config keys** stored in the `Config` table:

| Key                     | Default   | Description                                                       |
| ----------------------- | --------- | ----------------------------------------------------------------- |
| `analysis_hour`         | `12`      | Hour of the day (0–23) when the cronjob runs price analysis       |
| `hist_window_size`      | `60`      | Number of historical records used for trend calculations (30–180) |
| `is_price_drop_alert`   | `false`   | Enable Telegram alerts on price drops                             |
| `is_stock_change_alert` | `false`   | Enable Telegram alerts on stock changes                           |
| `telegram_bot_token`    | `""`      | Telegram Bot API token                                            |
| `telegram_bot_chat_id`  | `""`      | Telegram chat ID for notifications                                |
| `selected_language`     | `english` | UI language (`english` / `spanish`)                               |
| `google_api_key`        | `""`      | Google API key for Gemini (used by Stagehand)                     |

---

## 🔌 API Reference

The backend exposes the following REST API endpoints (base URL: `http://localhost:8000`):

### Configuration

| Method  | Endpoint   | Description                    |
| ------- | ---------- | ------------------------------ |
| `GET`   | `/config/` | Get all configuration values   |
| `PATCH` | `/config/` | Partially update configuration |

### Categories

| Method   | Endpoint           | Description                                 |
| -------- | ------------------ | ------------------------------------------- |
| `POST`   | `/categories/`     | Create a new category                       |
| `GET`    | `/categories/`     | List all categories                         |
| `GET`    | `/categories/{id}` | Get a specific category                     |
| `PATCH`  | `/categories/{id}` | Update a category                           |
| `DELETE` | `/categories/{id}` | Delete a category (fails if products exist) |

### Products

| Method   | Endpoint                      | Description                                  |
| -------- | ----------------------------- | -------------------------------------------- |
| `POST`   | `/products/`                  | Create a new product                         |
| `GET`    | `/products/`                  | List all products                            |
| `GET`    | `/products/dashboard-summary` | Get enriched product list for dashboard view |
| `GET`    | `/products/{id}`              | Get full product detail with price history   |
| `PATCH`  | `/products/{id}`              | Update a product                             |
| `DELETE` | `/products/{id}`              | Delete a product (cascades to price history) |

### AI Extraction

| Method | Endpoint                 | Description                              |
| ------ | ------------------------ | ---------------------------------------- |
| `POST` | `/extract-product-info/` | AI-extract product info from a given URL |

### Telegram

| Method | Endpoint                 | Description                                     |
| ------ | ------------------------ | ----------------------------------------------- |
| `GET`  | `/telegram-chat-id`      | Retrieve and save the bot's most recent chat ID |
| `POST` | `/telegram-test-message` | Send a test notification to the configured chat |

> 📄 Interactive API documentation is available at `http://localhost:8000/docs` (Swagger UI) and `http://localhost:8000/redoc` (ReDoc).

---

## 🚀 Installation & Setup

### Prerequisites

- **Python 3.12+** and [uv](https://github.com/astral-sh/uv)
- **Node.js 24+** and **npm**
- **Google Chrome** installed on the system (required by Stagehand v4 for local browser scraping)
- A **Google API key** with access to Gemini models
- _(Optional)_ A **Telegram Bot** token for notifications

### 1. Clone the Repository

```bash
git clone https://github.com/T1b4lt/wishlist-tracker.git
cd wishlist-tracker
```

### 2. Backend Setup

```bash
cd backend

# Create the virtual environment and install dependencies from uv.lock
uv sync
source .venv/bin/activate    # Linux/macOS
# .venv\Scripts\activate     # Windows

# Set up the database
python -m src.setup_backend           # Create tables only
python -m src.setup_backend --populate  # Create tables + demo data

# Start the API server
uvicorn src.api:app --reload

# Run the test suite
uv run pytest
```

The API will start at `http://localhost:8000`. See [`backend/README.md`](backend/README.md) for testing details.

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev

# Run the test suite
npm test
```

The app will be available at `http://localhost:5173`. See [`frontend/README.md`](frontend/README.md) for testing details.

### 4. Docker Setup

You can run the entire application (Frontend, Backend, and Cronjob) in a single container. The image is built in two stages: the frontend is compiled with **Node.js 24**, and the runtime is **Python 3.12** with Nginx, cron and Chromium (for Stagehand).

```bash
# Build the Docker image
docker build -t wishlist-tracker:latest .

# Run the container (exposes the app on port 7755 and persists the database)
docker run -d \
  -p 7755:7755 \
  -v wishlist-tracker-db:/app/backend/db \
  --restart unless-stopped \
  --name wishlist-tracker-app \
  wishlist-tracker:latest
```

The application will be available at `http://localhost:7755`.

Inside the container:

- **Nginx** listens on port `7755`, serves the compiled frontend and proxies `/api/*` to the FastAPI backend (the `/api` prefix is stripped).
- **Uvicorn** runs the API on `127.0.0.1:8000` (not exposed outside the container).
- **Cron** runs the price tracking job every hour; its output appears in `docker logs wishlist-tracker-app`.
- The **SQLite database** lives in `/app/backend/db`. It is created on first start and reused afterwards, so mount a volume there (as above) to keep your data across container upgrades.
- If the API or Nginx process dies, the container exits so Docker can restart it.

### 5. Environment Variables

Create a `backend/.env` file with your credentials:

```env
# Required for AI extraction
ASD_GOOGLE=your_google_api_key

# Optional — for Telegram notifications
DSA_TELEGRAM=your_telegram_bot_token
```

> ⚠️ **Note**: These environment variables are used only by the standalone test scripts (`stagehand_utils.py`, `telegram_utils.py`). In production, the API keys are managed through the **Settings page** and stored in the database.

---

## 🧰 Task Runner (just)

Common tasks are available as [just](https://just.systems) recipes defined in the root [`justfile`](justfile). Run `just` to list them all.

```bash
just setup          # Install backend + frontend deps, git hooks and create the database
just dev            # Run API (:8000) and Vite dev server (:5173) together
just check          # Format (ruff, prettier, eslint --fix) and then lint
just lint           # Lint and check formatting without modifying files
just test           # Run the backend (pytest) and frontend (Vitest) test suites
just db-reset --populate  # Delete and recreate the database with demo data
just docker-build   # Build the Docker image (then: just docker-run)
```

| Group   | Recipes                                                                      |
| ------- | ---------------------------------------------------------------------------- |
| setup   | `setup`, `install`, `install-backend`, `install-frontend`, `hooks`, `update` |
| quality | `format`, `lint`, `check`, `pre-commit`                                      |
| test    | `test`, `test-backend`, `test-frontend`                                     |
| dev     | `dev`, `dev-backend`, `dev-frontend`, `cronjob`, `build`, `clean`            |
| db      | `db-init`, `db-seed`, `db-clean`, `db-reset`                                 |
| docker  | `docker-build`, `docker-run`, `docker-stop`, `docker-logs`                   |

> Ruff is pinned as a backend dev dependency to the same version used by the pre-commit hook, so `just lint` and the hooks always agree. Keep both in sync when upgrading.

---

## 🪝 Git Hooks

Git hooks are managed with [pre-commit](https://pre-commit.com), declared as a dev dependency of the backend but applied to the whole repository. The configuration lives in [`.pre-commit-config.yaml`](.pre-commit-config.yaml).

### Setup

```bash
# Install backend dev dependencies (includes pre-commit)
cd backend && uv sync && cd ..

# Frontend hooks use the local Prettier/ESLint installs
cd frontend && npm install && cd ..

# Install the pre-commit and commit-msg hooks
backend/.venv/bin/pre-commit install
```

Run all hooks manually against the entire repository with:

```bash
backend/.venv/bin/pre-commit run --all-files
```

### Hooks

| Scope      | Hook                                       | Purpose                                                                       |
| ---------- | ------------------------------------------ | ----------------------------------------------------------------------------- |
| All files  | `trailing-whitespace`, `end-of-file-fixer` | Remove trailing whitespace and ensure a final newline                         |
| All files  | `mixed-line-ending`                        | Enforce LF line endings (also set in `.gitattributes`)                        |
| All files  | `check-json`, `check-yaml`, `check-toml`   | Validate syntax of config/data files                                          |
| All files  | `detect-private-key`, `gitleaks`           | Block commits containing private keys or secrets                              |
| Backend    | `ruff-check`, `ruff-format`                | Lint (with autofix) and format Python code                                    |
| Backend    | `uv-lock`                                  | Keep `backend/uv.lock` in sync with `pyproject.toml`                          |
| Frontend   | `prettier`                                 | Format frontend files using `frontend/.prettierrc`                            |
| Frontend   | `eslint`                                   | Lint (with autofix) JS/JSX using `frontend/eslint.config.js`                  |
| Commit msg | `conventional-pre-commit`                  | Enforce [Conventional Commits](https://www.conventionalcommits.org/) messages |

Ruff settings are in `backend/pyproject.toml` (`[tool.ruff]`). Frontend formatting can also be run with `npm run format` / `npm run format:check`.

---

## ⚙️ Configuration

All application settings can be managed through the **Settings** page (`/settings`) in the web interface:

| Setting                 | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| **Google API Key**      | Required for AI-powered product extraction (Gemini).                     |
| **Analysis Hour**       | Hour of the day (0–23) when the cronjob should run.                      |
| **History Window**      | Number of days used for price trend calculations (30–180).               |
| **Language**            | Switch between English and Spanish.                                      |
| **Telegram Bot Token**  | Your Telegram Bot API token (from [@BotFather](https://t.me/BotFather)). |
| **Telegram Chat ID**    | Auto-detected when you send a message to the bot.                        |
| **Price Drop Alerts**   | Toggle Telegram notifications for price drops.                           |
| **Stock Change Alerts** | Toggle Telegram notifications when items return to stock.                |

---

## 📘 Usage Guide

### Adding a Product

1. Click the **"+ Add Product"** button on the Dashboard.
2. Paste the product URL — the AI agent will automatically visit the page and extract:
   - Product name, description, category, and currency.
3. Review and adjust the extracted information.
4. Set the priority level (High / Medium / Low).
5. Save — the product now appears on your Dashboard.

### Managing Categories

- Navigate to the **Categories** page from the header.
- Create categories with custom names and colors.
- Categories are used to visually organize your products on the Dashboard.
- A category cannot be deleted if products are associated with it.

### Monitoring Prices

- The **Dashboard** shows all products with:
  - Current price, price trend (% change vs. historical average), and stock status.
- Click on any product to see its **detail page** with a full price history chart.
- The trend is calculated using the configurable history window size.

### Telegram Notifications

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and copy the token.
2. Paste the token into the Settings page.
3. Send any message to your bot, then click **"Get Chat ID"** in Settings.
4. Enable **Price Drop Alerts** and/or **Stock Change Alerts**.
5. Click **"Send Test Message"** to verify everything works.
6. Set up the cronjob (see below) to receive automatic daily alerts.

---

## ⏰ Cronjob Setup

The price tracking runs via the script `backend/src/product_status_cronjob.py`. It is designed to be **executed every hour** — it checks internally whether the current hour matches the configured `analysis_hour` before running.

### Linux (crontab)

```bash
# Edit your crontab
crontab -e

# Add this line to run every hour (adjust the path as needed)
0 * * * * cd /path/to/wishlist-tracker/backend && /path/to/.venv/bin/python -m src.product_status_cronjob
```

### What the Cronjob Does

1. Checks if the current hour matches the configured **analysis hour**.
2. If it matches, iterates over all products and:
   - Opens each product URL via the AI agent (Stagehand + Gemini).
   - Extracts the current price and stock status.
   - Stores a new `ProductHist` record in the database.
3. Compares current values with the previous record:
   - If the price dropped → sends a **price drop alert** via Telegram (if enabled).
   - If the item is back in stock → sends a **stock alert** via Telegram (if enabled).

---

## 📄 License

This project is open source. See the [LICENSE](LICENSE) file for details.
