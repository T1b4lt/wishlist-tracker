# ==========================================
# Stage 1: Build the Vite React Frontend
# ==========================================
FROM node:24-alpine AS frontend-builder

WORKDIR /app

# Copy package files and install dependencies (cached unless they change)
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy the rest of the frontend source code
COPY frontend/ ./

# Build the frontend.
# We set VITE_API_URL so the compiled app requests /api/... which Nginx will proxy.
ENV VITE_API_URL=/api
RUN npm run build

# ==========================================
# Stage 2: Serve with Python, Nginx & Cron
# ==========================================
FROM python:3.12-slim

# Install system dependencies: Nginx, cron, and Chromium for Stagehand local mode.
# The Debian default Nginx site (port 80) is removed so only our config is served.
RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    cron \
    chromium \
    && rm -f /etc/nginx/sites-enabled/default \
    && rm -rf /var/lib/apt/lists/*

# Install uv to install the backend dependencies from the lockfile
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

ENV CHROME_PATH=/usr/bin/chromium \
    PYTHONUNBUFFERED=1 \
    UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PATH="/app/backend/.venv/bin:$PATH"

WORKDIR /app/backend

# Install Python dependencies (cached unless pyproject.toml or uv.lock change)
COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --locked --no-dev --no-install-project --no-cache

# Copy the backend source code
COPY backend/ ./

# Apply Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the frontend compiled files from the builder stage
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy and setup the entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# SQLite database location; mount a volume here to persist data
VOLUME ["/app/backend/db"]

# Expose port
EXPOSE 7755

# Run the entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
