#!/usr/bin/env bash
# Start the FastAPI gateway and Vite cockpit without terminating other services.

set -u

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"

echo "Starting MachinexAI services from $SCRIPT_DIR"

cd "$BACKEND_DIR" || exit 1
nohup python3 -m uvicorn server:app --host 0.0.0.0 --port 8000 > "$BACKEND_DIR/backend.log" 2>&1 &
BACKEND_PID=$!
echo "Backend process: $BACKEND_PID"

backend_ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:8000/health > /dev/null; then
    backend_ready=true
    break
  fi
  if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$backend_ready" != true ]]; then
  echo "Backend failed to become ready; inspect $BACKEND_DIR/backend.log" >&2
  exit 1
fi

cd "$SCRIPT_DIR" || exit 1
nohup pnpm --filter @workspace/ipm-mfds-cockpit run dev --port 5173 > "$SCRIPT_DIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
echo "Frontend process: $FRONTEND_PID"

frontend_ready=false
for _ in $(seq 1 30); do
  if curl --fail --silent http://127.0.0.1:5173/ > /dev/null; then
    frontend_ready=true
    break
  fi
  if ! kill -0 "$FRONTEND_PID" 2>/dev/null; then
    break
  fi
  sleep 1
done

if [[ "$frontend_ready" != true ]]; then
  echo "Frontend failed to become ready; inspect $SCRIPT_DIR/frontend.log" >&2
  exit 1
fi

echo "Dashboard: http://localhost:5173"
echo "Backend:   http://localhost:8000/health"
echo "CPU demo:  python3 $BACKEND_DIR/stress_pc.py (intentionally loads the host CPU)"
