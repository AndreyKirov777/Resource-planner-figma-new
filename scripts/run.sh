#!/usr/bin/env bash
# Start the Resource Planner app (backend on 3001, frontend on 5173).
# Usage: npm run run   or   ./scripts/run.sh

set -e
cd "$(dirname "$0")/.."

# Stop any existing processes on our ports first
for port in 3001 5173; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    echo "Port $port is in use. Run 'npm run stop' first, or we will stop it now."
    lsof -ti:"$port" | xargs kill -9 2>/dev/null || true
    sleep 1
  fi
done

mkdir -p logs
: > .app.pids

echo "Starting backend (port 3001)..."
nohup npm run dev:server >> logs/server.log 2>&1 &
echo $! >> .app.pids

echo "Starting frontend (port 5173)..."
nohup npm run dev >> logs/vite.log 2>&1 &
echo $! >> .app.pids

sleep 2
echo ""
echo "App is running."
echo "  Frontend: http://localhost:5173"
echo "  Backend:  http://localhost:3001"
echo ""
echo "To stop: npm run stop"
