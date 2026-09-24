#!/bin/bash
set -e

echo "Starting deployment entrypoint..."

cd /app/backend

# 1. Initialize the database (no-op if it already exists, e.g. in a mounted volume)
echo "Initializing database..."
python -m src.setup_backend

# 2. Establish cronjob for product status checks
echo "Setting up cronjob for product status checks..."
# Cron does not inherit the container environment, so dump it (properly quoted)
# to a file that the job sources before running.
declare -px > /app/cron.env
chmod 0600 /app/cron.env
# Run every hour as root; the job itself checks the configured analysis hour.
# Output goes to PID 1's stdout/stderr so it shows up in `docker logs`.
cat > /etc/cron.d/wishlist-cron <<'EOF'
SHELL=/bin/bash
0 * * * * root source /app/cron.env && cd /app/backend && python -m src.product_status_cronjob > /proc/1/fd/1 2> /proc/1/fd/2
EOF
chmod 0644 /etc/cron.d/wishlist-cron

# Start cron service
service cron start

# 3. Start the API in the background using uvicorn
echo "Starting FastAPI backend..."
uvicorn src.api:app --host 127.0.0.1 --port 8000 &
UVICORN_PID=$!

# 4. Start Nginx in the background
echo "Starting Nginx on port 7755..."
nginx -g "daemon off;" &
NGINX_PID=$!

# Forward stop signals to the children so `docker stop` shuts down cleanly
shutdown() {
    echo "Shutting down..."
    kill -TERM "$UVICORN_PID" "$NGINX_PID" 2>/dev/null || true
    service cron stop || true
    wait
}
trap 'shutdown; exit 0' TERM INT

# Exit (and let Docker restart the container) as soon as either process dies
set +e
wait -n "$UVICORN_PID" "$NGINX_PID"
EXIT_CODE=$?
echo "A core process exited with code $EXIT_CODE, stopping container..."
shutdown
exit "$EXIT_CODE"
