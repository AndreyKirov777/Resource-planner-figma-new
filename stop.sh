#!/usr/bin/env bash
# Stop the Resource Planner app (processes on ports 3001 and 5173).
# Usage: npm run stop   or   ./stop.sh

cd "$(dirname "$0")"

stopped=0

# Optionally kill by saved PIDs first (so we only touch our own processes)
if [ -f .app.pids ]; then
  while read -r pid; do
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      kill -9 "$pid" 2>/dev/null && echo "Stopped process $pid" && stopped=1
    fi
  done < .app.pids
  rm -f .app.pids
fi

# Then ensure nothing is left on our ports (handles stray or old runs)
for port in 3001 5173; do
  if lsof -ti:"$port" >/dev/null 2>&1; then
    lsof -ti:"$port" | xargs kill -9 2>/dev/null
    echo "Stopped process(es) on port $port"
    stopped=1
  fi
done

if [ "$stopped" = 1 ]; then
  echo "App stopped."
else
  echo "No app processes were running (ports 3001 and 5173 are free)."
fi
