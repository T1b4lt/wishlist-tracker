# ==========================================
# Stage 1: Build the Vite React Frontend
# ==========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files and install dependencies
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
FROM python:3.11-slim

# Install system dependencies: Nginx, cron, and Chromium for Stagehand local mode
RUN apt-get update && apt-get install -y \
    nginx \
    cron \
    chromium \
    chromium-driver \
    && rm -rf /var/lib/apt/lists/*

ENV CHROME_PATH=/usr/bin/chromium

WORKDIR /app/backend

# Copy backend requirements and install Python dependencies
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt



# Copy the backend source code
COPY backend/ ./

# Expose port
EXPOSE 7755

# Apply Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy the frontend compiled files from the builder stage to Nginx's default directory
COPY --from=frontend-builder /app/dist /usr/share/nginx/html

# Copy and setup the entrypoint script
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Run the entrypoint script
ENTRYPOINT ["/app/entrypoint.sh"]
