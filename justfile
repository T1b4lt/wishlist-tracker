# Task runner for the Wishlist Tracker repository (https://just.systems).
# Run `just` to list all available recipes.

set shell := ["bash", "-euo", "pipefail", "-c"]

backend := "backend"
frontend := "frontend"
db_path := "backend/db/database.db"
image := "wishlist-tracker:latest"
container := "wishlist-tracker-app"
port := "7755"

# List all available recipes
default:
    @just --list

# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------

# Install all dependencies, git hooks and initialize the database
[group('setup')]
setup: install hooks db-init

# Install backend and frontend dependencies
[group('setup')]
install: install-backend install-frontend

# Install backend dependencies (including dev tools) with uv
[group('setup')]
install-backend:
    cd {{ backend }} && uv sync

# Install frontend dependencies from package-lock.json
[group('setup')]
install-frontend:
    cd {{ frontend }} && npm ci

# Install the pre-commit and commit-msg git hooks
[group('setup')]
hooks:
    {{ backend }}/.venv/bin/pre-commit install

# Upgrade backend and frontend dependencies within their allowed ranges
[group('setup')]
update:
    cd {{ backend }} && uv lock --upgrade && uv sync
    cd {{ frontend }} && npm update

# ---------------------------------------------------------------------------
# Code quality
# ---------------------------------------------------------------------------

# Format and autofix backend and frontend code
[group('quality')]
format:
    cd {{ backend }} && uv run ruff check --fix . && uv run ruff format .
    cd {{ frontend }} && npm run format && npx eslint --fix .

# Lint and check formatting without modifying files (CI-friendly)
[group('quality')]
lint:
    cd {{ backend }} && uv run ruff check . && uv run ruff format --check .
    cd {{ frontend }} && npm run lint && npm run format:check

# Format the code, then verify it passes all lint checks
[group('quality')]
check: format lint

# Run every pre-commit hook against the whole repository
[group('quality')]
pre-commit:
    {{ backend }}/.venv/bin/pre-commit run --all-files

# ---------------------------------------------------------------------------
# Development
# ---------------------------------------------------------------------------

# Run the API and the frontend dev server together (Ctrl+C stops both)
[group('dev')]
dev:
    #!/usr/bin/env bash
    set -euo pipefail
    trap 'kill 0' EXIT
    just dev-backend &
    just dev-frontend &
    wait

# Run the FastAPI server with auto-reload on http://localhost:8000
[group('dev')]
dev-backend:
    cd {{ backend }} && uv run uvicorn src.api:app --reload

# Run the Vite dev server on http://localhost:5173
[group('dev')]
dev-frontend:
    cd {{ frontend }} && npm run dev

# Run the product status cronjob once (it only acts at the configured analysis hour)
[group('dev')]
cronjob:
    cd {{ backend }} && uv run python -m src.product_status_cronjob

# Build the frontend for production into frontend/dist
[group('dev')]
build:
    cd {{ frontend }} && npm run build

# Remove build artifacts and caches (keeps node_modules, .venv and the database)
[group('dev')]
clean:
    rm -rf {{ frontend }}/dist .ruff_cache {{ backend }}/.ruff_cache
    find {{ backend }} -type d -name __pycache__ -not -path '*/.venv/*' -prune -exec rm -rf {} +

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------

# Create the database tables and default config (no-op if it already exists)
[group('db')]
db-init:
    cd {{ backend }} && uv run python -m src.setup_backend

# Create the database and populate it with demo data
[group('db')]
db-seed:
    cd {{ backend }} && uv run python -m src.setup_backend --populate

# Delete the SQLite database (all data is lost)
[confirm('This will permanently delete the database. Continue? [y/N]')]
[group('db')]
db-clean:
    rm -f {{ db_path }} {{ db_path }}-wal {{ db_path }}-shm
    @echo "Database removed: {{ db_path }}"

# Delete and recreate the database (pass --populate to add demo data)
[group('db')]
db-reset *flags: db-clean
    cd {{ backend }} && uv run python -m src.setup_backend {{ flags }}

# ---------------------------------------------------------------------------
# Docker
# ---------------------------------------------------------------------------

# Build the Docker image
[group('docker')]
docker-build:
    docker build -t {{ image }} .

# Run the container in the background on http://localhost:7755
[group('docker')]
docker-run:
    docker run -d \
      -p {{ port }}:7755 \
      -v wishlist-tracker-db:/app/backend/db \
      --restart unless-stopped \
      --name {{ container }} \
      {{ image }}

# Stop and remove the container (the database volume is kept)
[group('docker')]
docker-stop:
    docker rm -f {{ container }}

# Follow the container logs
[group('docker')]
docker-logs:
    docker logs -f {{ container }}
