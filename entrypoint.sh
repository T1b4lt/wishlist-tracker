#!/bin/bash
set -e

echo "Starting deployment entrypoint..."

# 1. Initialize the database (clean db)
echo "Initializing clean database..."
cd /app/backend
python -m src.setup_backend

# 2. Establish cronjob for product-status_cronjob
echo "Setting up cronjob for product status checks..."
# Run every hour. The cron job runs as root and logs to /var/log/cron.log.
# We need to source environment variables if they are needed inside cron, but docker envs are not automatically available.
# A small wrapper to export envs might be useful or just run it.
env > /etc/environment
echo "0 * * * * cd /app/backend && /usr/local/bin/python -m src.product_status_cronjob >> /var/log/cron.log 2>&1" > /etc/cron.d/wishlist-cron
chmod 0644 /etc/cron.d/wishlist-cron
crontab /etc/cron.d/wishlist-cron

# Start cron service
service cron start

# 3. Start the API in the background using uvicorn
echo "Starting FastAPI backend..."
uvicorn src.api:app --host 127.0.0.1 --port 8000 &

# 4. Start Nginx in the foreground
echo "Starting Nginx on port 7755..."
nginx -g "daemon off;"
