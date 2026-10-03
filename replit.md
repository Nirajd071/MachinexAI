# MachinexAI Technician Cockpit

Predictive maintenance dashboard for simulated CNC and 3D printer equipment, with an optional live FastAPI telemetry gateway.

## Run

- `pnpm --filter @workspace/ipm-mfds-cockpit run dev` starts the cockpit on port 5173 in local simulator mode.
- `python3 -m pip install -r backend/requirements.txt` installs the FastAPI gateway dependencies.
- From `backend/`, run `python3 -m uvicorn server:app --host 0.0.0.0 --port 8000` to start the optional gateway.
- Set `VITE_USE_MOCK=false` and configure `VITE_API_URL` / `VITE_WS_URL` to connect the cockpit to that gateway.
- `pnpm --filter @workspace/ipm-mfds-cockpit run typecheck` checks cockpit TypeScript.

## Architecture

- `artifacts/ipm-mfds-cockpit` — React/Vite cockpit and local simulator.
- `backend` — FastAPI telemetry gateway, simulator, AI engine, SQLite persistence, PDF generation, and optional SMTP alerting.
- `artifacts/api-server`, `lib/api-spec`, `lib/api-zod`, `lib/api-client-react`, and `lib/db` — separate Express health-check/API scaffold; this is not the FastAPI gateway used by the cockpit.

## Operations notes

- Mock mode is the default. Live mode does not silently switch to mock mode when the gateway is unavailable.
- Alert delivery is disabled unless SMTP settings and an alert recipient are configured. Ethereal preview delivery requires explicit `SMTP_TEST_MODE=true`.
- `backend/stress_pc.py` is a CPU load generator for the physical host telemetry demo. Use it only when intentionally running that demonstration.
