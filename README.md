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
- **Daily automated monitoring** — a configurable cronjob fetches product status once a day and stores the results; products left out because the Gemini quota ran out are retried every 10 minutes until they are checked. A newly added product or store gets its first price right away.
- **Instant Telegram alerts** — get notified the moment a price drops or an item is back in stock.
- **Complete price history** — visualize how prices evolve over time with interactive charts.
- **Multi-language support** — the UI is fully translated in English and Spanish (i18n).

---

## ✨ Key Features

| Feature                    | Description                                                                                                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Product Management**     | Add, edit, and delete wishlist items with custom categories and priority levels (High / Medium / Low).                                                                                                                                                                                                                     |
| **AI-Powered Extraction**  | Automatically extract product name, category, description, currency, store, price, and stock status from any URL using Stagehand v4 + Gemini.                                                                                                                                                                              |
| **Store Detection**        | Each store a product is tracked in records its name (AI-extracted) and favicon (downloaded from the page), shown on the dashboard and detail page. |
| **Multiple Stores per Product** | Track the same product in several stores. It counts once on the dashboard, valued by its best offer (the cheapest store in stock). Add stores from the product page or the "New product" dialog ("Same product as…"), merge two products into one, or unlink a store back into its own product. Each store keeps its own price history, stock, outdated warning and Telegram alerts. |
| **Price Tracking**         | One price check per store per day (invalid prices discarded), with a configurable window of 30, 60, 90 or 180 days.                                                                                                                                                                                                      |
| **Gemini Quota Handling**  | When the Gemini quota runs out, the products left are retried every 10 minutes for the rest of the day, least recently checked first; the dashboard shows when the limit was reached and how many products are still pending. |
| **Outdated Price Warning** | Products whose price has not been updated for 3 days or more (the store may be down, the product may have been removed, or the page may be blocking the agent) get a badge on the dashboard, a warning on their detail page, a count in the summary strip and their own filter. |
| **Interactive Dashboard**  | Overview of all products with current price, price change vs. the window's average (%), sparkline, stock status, and category indicators.                                                                                                                                                                                  |
| **Search & Filters**       | Live search on the dashboard by product or store name (case- and accent-insensitive), filters for store, category, priority, stock, price range, price drops, lowest price and outdated price, and sorting by name, price, price drop, priority, stock or last check. The state lives in the URL, so it survives going back and reloading. |
| **Product Detail View**    | Detailed product page with a stepped price history chart (Recharts), lowest and average price in the selected range, and out-of-stock bands.                                                                                                                                                                               |
| **Category System**        | User-defined categories with custom colors for visual organization.                                                                                                                                                                                                                                                        |
| **Telegram Notifications** | Real-time alerts for price drops and stock changes, with inline buttons linking to the product.                                                                                                                                                                                                                            |
| **Configurable Settings**  | Analysis hour, history window size, notification toggles, language selection, and API keys — all from the UI.                                                                                                                                                                                                              |
| **Multi-Language (i18n)**  | Full English and Spanish translations for the entire interface.                                                                                                                                                                                                                                                            |
| **Dark Mode**              | Theme toggle built into Chakra UI.                                                                                                                                                                                                                                                                                         |

---

## 🛠 Tech Stack

### Frontend

| Technology                                                                                  | Purpose                                                   |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| [Vite](https://vite.dev/)                                                                   | Build tool and dev server                                 |
| [React 19](https://react.dev/)                                                              | UI library (functional components, hooks)                 |
| [Chakra UI v3](https://www.chakra-ui.com/)                                                  | Component library and design system (theme, tokens)       |
| [Wouter](https://github.com/molefrog/wouter)                                                | Lightweight client-side routing                           |
| [Zustand](https://zustand.docs.pmnd.rs/)                                                    | State management (products, categories and config stores) |
| [Motion](https://motion.dev/)                                                               | Animations (page transitions, list and state changes)     |
| [Recharts](https://recharts.org/)                                                           | Interactive charting for price history                    |
| [Lucide](https://lucide.dev/) via [react-icons](https://react-icons.github.io/react-icons/) | Icons (`react-icons/lu`)                                  |
| [react-i18next](https://react.i18next.com/)                                                 | Internationalization framework                            |
| [next-themes](https://github.com/pacocoursey/next-themes)                                   | Theme management (dark/light mode)                        |
| [Fontsource](https://fontsource.org/)                                                       | Self-hosted Geist and Geist Mono variable fonts           |
| [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/)             | Unit and component tests                                  |
| [Playwright](https://playwright.dev/)                                                       | End-to-end smoke tests and visual snapshots (mocked API)  |

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
│   ├── tests/                        # pytest suite (in-memory SQLite, never db/database.db)
│   └── src/
│       ├── api.py                    # FastAPI app factory (routers + middleware)
│       ├── core/                     # Shared infrastructure
│       │   ├── database.py           # DB engine, session, SQLite pragma, lifespan
│       │   └── config.py             # Config get/set helpers & default values
│       ├── models/
│       │   └── database_models.py    # SQLModel table definitions
│       ├── schemas/                  # Pydantic request/response schemas
│       │   ├── config.py             # ConfigUpdate, ConfigResponse
│       │   ├── category.py           # CategoryCreate, CategoryUpdate, CategoryResponse
│       │   ├── product.py            # Product CRUD, Dashboard & Detail schemas
│       │   └── store.py              # StoreResponse
│       ├── services/                 # Business logic layer
│       │   ├── config_service.py     # Configuration read/update logic
│       │   ├── daily_check_service.py # Today's daily check summary & counts
│       │   ├── category_service.py   # Category CRUD operations
│       │   ├── best_offer.py         # Pure best-offer rules (which store represents a product)
│       │   ├── offer_service.py      # Offers (a product in one store): add, edit URL, unlink, delete
│       │   ├── offer_check_service.py # Check one offer's price & stock (daily run and right after adding it)
│       │   ├── price_stats.py        # Pure price statistics (window, average, change, lowest)
│       │   ├── product_service.py    # Product CRUD, dashboard, detail & AI extraction
│       │   ├── store_service.py      # Store lookup/creation by domain & favicon access
│       │   └── telegram_service.py   # Telegram chat ID & test message orchestration
│       ├── routers/                  # FastAPI route definitions (thin controllers)
│       │   ├── config_router.py      # GET/PATCH /config/
│       │   ├── daily_check_router.py # GET /daily-check/
│       │   ├── category_router.py    # CRUD /categories/
│       │   ├── offer_router.py       # /products/{id}/offers, /offers/{id}, /offers/{id}/unlink
│       │   ├── product_router.py     # CRUD /products/, /products/{id}/merge + /extract-product-info/
│       │   ├── store_router.py       # GET /stores/{id}/favicon
│       │   └── telegram_router.py    # /telegram-chat-id, /telegram-test-message
│       ├── stagehand_utils.py        # Stagehand v4 AI scraping functions
│       ├── telegram_utils.py         # Telegram notification helpers
│       ├── product_status_cronjob.py # Daily price tracking, quota retries & daily report (every 10 min)
│       └── setup_backend.py          # Database initialization script
│
└── frontend/                         # React frontend (Vite)
    ├── index.html                    # HTML entry point
    ├── package.json                  # Node.js dependencies and scripts
    ├── vite.config.js                # Vite + Vitest configuration (aliases, TZ pinned to UTC for tests)
    ├── playwright.config.js          # Playwright e2e configuration (desktop + mobile projects)
    ├── eslint.config.js              # ESLint configuration
    ├── .prettierrc                   # Prettier formatting rules
    ├── public/
    │   └── favicon.svg               # Favicon
    ├── e2e/                          # Playwright specs (mocked API, no backend needed)
    │   ├── *.spec.js                 # Smoke tests per page/flow + visual.spec.js (snapshots)
    │   ├── visual.spec.js-snapshots/ # Visual snapshot baselines (platform-specific)
    │   ├── fixtures/                 # API response fixtures (config, categories, products, time)
    │   └── support/                  # apiMock fixture (fails on unmocked requests), constants
    └── src/
        ├── main.jsx                  # React entry point (MotionConfig, Provider, Toaster, i18n)
        ├── App.jsx                   # Root component with routing
        ├── theme/                    # Chakra system: tokens, semantic tokens, text styles, recipes, motion
        ├── stores/                   # Zustand stores (products, categories, config)
        ├── hooks/                    # useDocumentTitle, useUnsavedChangesGuard, useDashboardFilters
        ├── i18n/
        │   ├── index.js              # i18next configuration
        │   ├── english.json          # English translations
        │   └── spanish.json          # Spanish translations
        ├── lib/
        │   ├── api/                  # Typed-by-JSDoc API client (config, categories, products, telegram)
        │   ├── format.js             # Locale-aware price, percent and date formatting
        │   ├── productHistory.js     # Chart ranges, stats and out-of-stock bands
        │   ├── productFilters.js     # Dashboard search, filters, sort and their URL params
        │   └── ...                   # Dashboard summary, settings draft, priority visuals, utils
        ├── components/
        │   ├── layout/               # AppShell, AppHeader, AppFooter, PageContainer, PageHeader
        │   ├── motion/               # Motion presets (FadeIn, Stagger, AnimatedList, PageTransition)
        │   ├── common/               # Shared UI (Empty/Error/Loading states, ConfirmDialog, badges, ...)
        │   ├── dashboard/            # Summary strip, search/filter bar, product table, mobile cards, sparkline
        │   ├── product/              # Product detail: stats row, price history chart, description
        │   ├── products/             # ProductFormDialog (add and edit, AI-assisted)
        │   ├── categories/           # Category list and form dialog
        │   ├── settings/             # Settings sections, secret inputs, Telegram setup, save bar
        │   └── ui/                   # Chakra UI snippet wrappers (provider, dialog, drawer, select, ...)
        ├── pages/
        │   ├── DashboardPage.jsx     # Wishlist overview (summary strip + product list)
        │   ├── ProductPage.jsx       # Product detail with price chart
        │   ├── CategoriesPage.jsx    # Category management page
        │   ├── SettingsPage.jsx      # App settings & Telegram setup
        │   └── NotFoundPage.jsx      # 404 page
        └── test/                     # Vitest setup and test helpers
```

---

## 🗄 Database Schema

The application uses **SQLite** with **SQLModel** as ORM. There are 8 tables. A **product** is what you want to buy; an **offer** is that product in one store (URL, store, currency) with its own price history. Every product has at least one offer, and all offers of a product share one currency.

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
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│   Product    │       │    Offer     │       │  OfferHist   │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │──1:N──│ id (PK)      │──1:N──│ id (PK)      │
│ name         │       │ product_id   │       │ offer_id     │
│ priority     │       │ url          │       │ price        │
│ category_id  │ (FK)  │ store_id     │ (FK)  │ is_in_stock  │
│ description  │       │ currency     │       │ timestamp    │
└──────────────┘       └──────▲───────┘       └──────────────┘
                              │ N:1
┌──────────────┐              │
│    Store     │──────────────┘
├──────────────┤
│ id (PK)      │
│ domain       │ (UNIQUE, e.g. "amazon.es")
│ name         │
│ favicon      │ (BLOB, nullable)
│ favicon_mime │
└──────────────┘

┌────────────────────┐
│ PendingStatusRetry │
├────────────────────┤
│ offer_id (PK)      │ (FK → Offer, CASCADE DELETE)
│ day_start          │ (Unix seconds, start of the local day)
└────────────────────┘

┌────────────────────┐
│   DailyCheckRun    │
├────────────────────┤
│ day_start (PK)     │ (Unix seconds, start of the local day)
│ started_at         │
│ total_offers       │
│ limit_reached_at   │ (nullable, first Gemini quota error)
│ pending_at_limit   │ (nullable)
│ report_sent        │
└────────────────────┘
```

`Offer.product_id` and `OfferHist.offer_id` cascade on delete, and `OfferHist.timestamp` is in Unix seconds. `PendingStatusRetry` holds the offers whose daily check hit the Gemini quota; the cronjob retries them every 10 minutes for the rest of that local day. `DailyCheckRun` keeps one summary row per local day: when the daily check started, how many offers (prices) it covered, and the first Gemini quota error (time and prices left), shown on the dashboard (see [What the Cronjob Does](#what-the-cronjob-does)).

**Config keys** stored in the `Config` table:

| Key                     | Default   | Description                                                                           |
| ----------------------- | --------- | ------------------------------------------------------------------------------------- |
| `analysis_hour`         | `12`      | Hour of the day (0–23) when the cronjob runs price analysis                           |
| `hist_window_size`      | `60`      | Days of history used for price trends, averages and lowest prices (30, 60, 90 or 180) |
| `is_price_drop_alert`   | `false`   | Enable Telegram alerts on price drops                                                 |
| `is_stock_change_alert` | `false`   | Enable Telegram alerts on stock changes                                               |
| `daily_check_report`    | `limit_days` | Telegram daily check report: `off`, `limit_days` (only on days the Gemini limit was reached) or `every_day` |
| `telegram_bot_token`    | `""`      | Telegram Bot API token                                                                |
| `telegram_bot_chat_id`  | `""`      | Telegram chat ID for notifications                                                    |
| `selected_language`     | `english` | UI language (`english` / `spanish`)                                                   |
| `google_api_key`        | `""`      | Google API key for Gemini (used by Stagehand)                                         |

**How price statistics are computed** (dashboard and product detail):

- The window covers the last *N* calendar days (`hist_window_size` on the
  dashboard, the selected range on the detail page).
- Only in-stock checks count for averages, lowest prices, price changes,
  "at lowest" and price-drop alerts; out-of-stock checks are still drawn on
  the charts.
- The price change compares the current price with the average of the
  previous in-stock checks in the window.
- The daily job stores at most one check per store per day and discards
  invalid prices (zero, negative or not a number).
- A product tracked in several stores is represented by its **best offer**:
  the cheapest store whose latest check is in stock (the cheapest overall
  when none is; ties go to the most recently checked). Its price, change and
  sparkline are the best offer's; it is in stock when any store is, "at
  lowest" when the best offer's price is not above the lowest in-stock price
  of any store in the window, and outdated when any store is.
- A store is outdated when its price has not been updated for 3 days or more.

The backend is the single source of truth for these rules: it computes every
value (best offer, statistics of every chart range, staleness, config
options) and the frontend only presents them. The formulas are pinned by
table-driven cases in `backend/tests/cases/`.

---

## 🔌 API Reference

The backend exposes the following REST API endpoints (base URL: `http://localhost:8000`):

### Configuration

| Method  | Endpoint   | Description                                                                                                    |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| `GET`   | `/config/` | Get all configuration values, plus a derived `telegram_status` (`not_configured`, `token_only` or `connected`) |
| `PATCH` | `/config/` | Partially update configuration                                                                                 |

### Categories

| Method   | Endpoint           | Description                                        |
| -------- | ------------------ | -------------------------------------------------- |
| `POST`   | `/categories/`     | Create a new category                              |
| `GET`    | `/categories/`     | List all categories, each with its `product_count` |
| `GET`    | `/categories/{id}` | Get a specific category, with its `product_count`  |
| `PATCH`  | `/categories/{id}` | Update a category                                  |
| `DELETE` | `/categories/{id}` | Delete a category (fails if products exist)        |

### Products

| Method   | Endpoint                      | Description |
| -------- | ----------------------------- | ----------- |
| `POST`   | `/products/`                  | Create a product with its first store: `{name, priority, category_id, description, offer: {url, currency, store_id?}}` |
| `GET`    | `/products/`                  | List all products with their offers |
| `GET`    | `/products/dashboard-summary` | One entry per product, valued by its best offer (current price, `price_change_pct`, stock, `is_at_lowest`, `recent_prices` for the sparkline, `best_offer_id`) with its `offers` (store fields, current price, stock, `last_checked_at`) |
| `GET`    | `/products/{id}`              | Full product detail: shared fields and every offer with its store fields and price history |
| `PATCH`  | `/products/{id}`              | Update the shared fields (name, priority, category, description) |
| `DELETE` | `/products/{id}`              | Delete a product (cascades to its offers and their price history) |
| `POST`   | `/products/{id}/merge`        | Merge another product into this one: `{source_product_id, keep}` (`keep` is `target` or `source`: whose shared fields to keep). 400 with itself, 409 for another currency or a shared URL |

### Offers

| Method   | Endpoint                 | Description |
| -------- | ------------------------ | ----------- |
| `POST`   | `/products/{id}/offers`  | Add a store to a product: `{url, currency, store_id?}`. 409 for another currency or a URL already tracked |
| `PATCH`  | `/offers/{id}`           | Change a store's URL: `{url}` (the store is re-resolved) |
| `POST`   | `/offers/{id}/unlink`    | Move the store (with its history) into a new product with the same fields. 409 for a product's only store |
| `DELETE` | `/offers/{id}`           | Remove a store and its history. 409 for a product's only store |

Offers are linked to a store resolved from their URL's domain on create and on URL change.

### Stores

| Method | Endpoint               | Description                                                    |
| ------ | ---------------------- | -------------------------------------------------------------- |
| `GET`  | `/stores/{id}/favicon` | Store favicon image (cached for a week; 404 if none was found) |
| `GET`  | `/daily-check/` | Today's daily check: full-run snapshot (start, total products, Gemini limit time and products left then; nulls before it runs) and products still pending |

### AI Extraction

| Method | Endpoint                 | Description                                                                                                                |
| ------ | ------------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `POST` | `/extract-product-info/` | AI-extract product info from a given URL, including its `store` (created with its favicon the first time a domain is seen) |

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

> The schema has no migrations. After pulling a change to the database models (such as the split of products into offers per store), recreate the database: `just db-clean && just db-init` (or `just db-seed` for demo data).

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the development server
npm run dev

# Run the unit test suite (Vitest)
npm test

# Run the end-to-end smoke tests (Playwright, install the browser once)
npx playwright install chromium
npm run test:e2e
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
  -e TZ=Europe/Madrid \
  -v wishlist-tracker-db:/app/backend/db \
  --restart unless-stopped \
  --name wishlist-tracker-app \
  wishlist-tracker:latest
```

The application will be available at `http://localhost:7755`.

Inside the container:

- **Nginx** listens on port `7755`, serves the compiled frontend and proxies `/api/*` to the FastAPI backend (the `/api` prefix is stripped).
- **Uvicorn** runs the API on `127.0.0.1:8000` (not exposed outside the container).
- **Cron** runs the price tracking job every 10 minutes; its output appears in `docker logs wishlist-tracker-app`.
- The **SQLite database** lives in `/app/backend/db`. It is created on first start and reused afterwards, so mount a volume there (as above) to keep your data across container upgrades.
- If the API or Nginx process dies, the container exits so Docker can restart it.
- **`TZ`** (default `UTC`) sets the local time used for the analysis hour and for "one check per product per day"; set it to your own time zone. `just docker-run` forwards your shell's `TZ`.

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
just test-e2e       # Run the frontend Playwright e2e smoke tests (mocked API)
just db-reset --populate  # Delete and recreate the database with demo data
just docker-build   # Build the Docker image (then: just docker-run)
```

| Group   | Recipes                                                                      |
| ------- | ---------------------------------------------------------------------------- |
| setup   | `setup`, `install`, `install-backend`, `install-frontend`, `hooks`, `update` |
| quality | `format`, `lint`, `check`, `pre-commit`                                      |
| test    | `test`, `test-backend`, `test-frontend`, `test-e2e`                          |
| dev     | `dev`, `dev-backend`, `dev-frontend`, `cronjob`, `build`, `clean`            |
| db      | `db-init`, `db-seed`, `db-clean`, `db-reset`                                 |
| docker  | `docker-build`, `docker-run`, `docker-stop`, `docker-logs`                   |

> `just test-e2e` needs Chromium installed once: `cd frontend && npx playwright install chromium`.
> It is not part of the default `just test` (which stays fast, unit-tests-only) since it needs
> a browser and starts its own throwaway Vite dev server; see [`frontend/README.md`](frontend/README.md#end-to-end-tests-playwright).

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

Tests are not part of any hook. Run them manually before committing: `just test` (frontend and backend unit tests) and `just test-e2e` (Playwright).

Ruff settings are in `backend/pyproject.toml` (`[tool.ruff]`). Frontend formatting can also be run with `npm run format` / `npm run format:check`.

---

## ⚙️ Configuration

All application settings can be managed through the **Settings** page (`/settings`) in the web interface:

| Setting                 | Description                                                              |
| ----------------------- | ------------------------------------------------------------------------ |
| **Google API Key**      | Required for AI-powered product extraction (Gemini).                     |
| **Analysis Hour**       | Hour of the day (0–23) when the daily check starts (first run at or after it). |
| **History Window**      | Days used for price trends, averages and lowest prices (30, 60, 90 or 180). |
| **Language**            | Switch between English and Spanish.                                      |
| **Telegram Bot Token**  | Your Telegram Bot API token (from [@BotFather](https://t.me/BotFather)). |
| **Telegram Chat ID**    | Auto-detected when you send a message to the bot.                        |
| **Price Drop Alerts**   | Toggle Telegram notifications for price drops.                           |
| **Stock Change Alerts** | Toggle Telegram notifications when items return to stock.                |
| **Daily Check Report**  | Telegram report of the day's check: off, only on days the Gemini limit is reached, or every day. |

---

## 📘 Usage Guide

### Adding a Product

1. Click the **"+ Add Product"** button on the Dashboard.
2. Paste the product URL — the AI agent will automatically visit the page and extract:
   - Product name, description, category, and currency.
3. Review and adjust the extracted information.
4. Set the priority level (High / Medium / Low).
5. Save — the product now appears on your Dashboard.

### Tracking a Product in Several Stores

- **Add a store** from the product page (**Stores** card → **Add store**): paste the other store's URL; its store and currency are extracted, and its first price is checked right away (see [Prices of New Stores](#prices-of-new-stores)).
- Or, in the **Add product** dialog, pick the product in **Same product as…**: the URL is added as another store of that product instead of a new product.
- Already added the same item twice? Open one of them and use **⋯ → Merge with…** to combine both (stores and price histories), choosing whose name, category, priority and description to keep.
- From a store's menu you can edit its URL, **unlink** it into its own product, or remove it (a product always keeps at least one store).
- The dashboard counts the product once, at its best offer's price; a **+N** chip lists every store with its price.
- All stores of a product must use the same currency.

### Managing Categories

- Navigate to the **Categories** page from the header.
- Create categories with custom names and colors.
- Categories are used to visually organize your products on the Dashboard.
- A category cannot be deleted if products are associated with it.

### Monitoring Prices

- The **Dashboard** shows all products with:
  - Current price, price trend (% change vs. the average of the previous in-stock checks in the window), and stock status.
- Click on any product to see its **detail page** with a full price history chart.
- If a product has had no new price record for **3 days or more**, the daily check is failing for it: the store may be down, the product may have been removed, or the page may be blocking the agent. The dashboard marks it with a **"No updates for N days"** badge (with the likely causes in a tooltip) and counts it as **Outdated** in the summary strip, and its detail page shows a warning with the date of the last price and a link to check the store page. Products that were never checked are not flagged.
- The trend is calculated over the configurable history window (in days); see "How price statistics are computed" below the config keys.

### Searching and Filtering

- Type in the **search box** above the product list to filter it as you type: `DJI` shows every product (or store) containing "DJI" in its name, e.g. the same drone tracked on Amazon, PcComponentes and the DJI Store.
- Use the **sort** menu to order by name, price (low/high), biggest price drops, priority, availability or most recently checked.
- Open **Filters** to narrow the list by stock, price range, deals (price dropped / at lowest price), price updates (not updated for 3+ days, URL param `stale=1`), store, category and priority. Every active filter shows up as a removable chip; **Clear all** removes them while keeping the search.
- The search, filters and sort are stored in the page URL (e.g. `/?q=dji&stock=in&sort=price_asc`), so they are kept when you open a product and go back, reload the page or bookmark it.
- The summary strip (items, total value, price drops, at lowest price, and outdated when any) always covers your whole wishlist.

### Telegram Notifications

1. Create a Telegram bot via [@BotFather](https://t.me/BotFather) and copy the token.
2. Paste the token into the Settings page.
3. Send any message to your bot, then click **"Get Chat ID"** in Settings.
4. Enable **Price Drop Alerts** and/or **Stock Change Alerts**.
5. Click **"Send Test Message"** to verify everything works.
6. Set up the cronjob (see below) to receive automatic daily alerts.

---

## ⏰ Cronjob Setup

The price tracking runs via the script `backend/src/product_status_cronjob.py`. It is designed to be **executed every 10 minutes** — it decides internally whether to start the day's check (first run at or after the configured `analysis_hour`) or to retry the products left by a Gemini quota error.

### Linux (crontab)

```bash
# Edit your crontab
crontab -e

# Add this line to run every 10 minutes (adjust the path as needed)
*/10 * * * * cd /path/to/wishlist-tracker/backend && /path/to/.venv/bin/python -m src.product_status_cronjob
```

### What the Cronjob Does

1. The first run at or after the configured **analysis hour** each day starts the daily check (once per day, even if the container was stopped at that hour) and records it in `DailyCheckRun`.
2. It iterates over all offers (a product in one store) not yet checked today — least recently checked first (never-checked ones at the front), so if the daily quota cannot cover every offer, the ones left out one day go first the next — and:
   - Opens each offer URL via the AI agent (Stagehand + Gemini).
   - Extracts the current price and stock status.
   - Stores a new `OfferHist` record in the database.
3. Compares current values with the previous record:
   - If the price dropped → sends a **price drop alert** via Telegram (if enabled), naming the store.
   - If the item is back in stock → sends a **stock alert** via Telegram (if enabled), naming the store.
4. If the **Gemini quota** runs out (requests per minute or per day), the run stops right away — every later call would fail too — and the offers left are saved in `PendingStatusRetry`.
5. At every later run that day (every 10 minutes), it retries only today's pending offers (same steps 2–3), stopping again at the next quota error, until all of them have their record:
   - An offer leaves the list once it is stored, or if it fails for another reason (e.g. an invalid price or a page that does not load), so it does not keep spending quota.
   - Pending offers are dropped when the local day ends; the next analysis-hour run checks everything again.
6. After each run, sends the **daily check report** on Telegram once per day (setting `daily_check_report`): ✅ as soon as no price is pending (with how many were recorded and how many failed), or ⚠️ on the 23:50 run with the count the Gemini limit left unchecked. `limit_days` only reports days the Gemini limit was reached, `every_day` reports every day, `off` never. A failed send is retried by the next run.

Example: with 10 offers and a quota that allows 5 calls, the analysis-hour run stores 5 records and leaves 5 pending; the next run retries those 5, and so on until none are left.

Runs never overlap: each run holds an exclusive lock (`backend/db/cronjob.lock`), so a tick that fires while a long check is still running just exits.

A quota error is recognized from the message Stagehand raises (`You exceeded your current quota … Quota exceeded for metric …`, i.e. Gemini's HTTP 429 `RESOURCE_EXHAUSTED`). Stagehand already retries each model call a few times before raising.

### Prices of New Stores

A store does not wait for the daily check to get its first price: right after a product is created, a store is added to a product, or a store's URL changes, the API checks that store's price in the background, and the app refreshes the product when the price arrives (it keeps trying for up to 3 minutes).

- Added **before** the analysis hour: the daily check skips it that day, since it already has its price for the day.
- Added **after** the day's check started: it counts in that day's total, and if the Gemini quota runs out it joins the pending retries.
- After a **URL change**, the new price replaces the day's price of the old URL (if the check fails, the old one stays).
- These checks send no Telegram alerts. Other failures (an invalid price, a page that does not load) leave the store for the next daily check.

---

## 📄 License

This project is open source. See the [LICENSE](LICENSE) file for details.
