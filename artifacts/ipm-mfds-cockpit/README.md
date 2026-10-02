# IPM-MFDS Technician Cockpit

Real-time industrial predictive-maintenance cockpit for the CNC-01, CNC-02, and PRN-01 machines. It includes judge-controlled fault injection, live telemetry and diagnosis views, maintenance history, and work-order downloads.

## Run

Mock mode is the default and does not require a backend. In this Replit workspace, use the managed `artifacts/ipm-mfds-cockpit: web` workflow. For a local workspace run:

```sh
pnpm --filter @workspace/ipm-mfds-cockpit run dev
```

Check TypeScript with:

```sh
pnpm --filter @workspace/ipm-mfds-cockpit run typecheck
```

This repository is a pnpm workspace; its dependency catalog and managed Vite port configuration are not compatible with the standalone `npm install && npm run dev` command.

## Connect to FastAPI

Copy `.env.example` to `.env.local`, then set:

```dotenv
VITE_USE_MOCK=false
VITE_API_URL=http://localhost:8000
VITE_WS_URL=ws://localhost:8000/ws/telemetry/live
```

When the gateway cannot connect within three seconds, the cockpit switches to its local simulator. Live mode uses the gateway's health status without recalculating thresholds in the browser.

## Source map

- `src/types.ts` — typed machine, telemetry, health, fault, and maintenance contracts
- `src/api.ts` — FastAPI requests and local demo work-order PDF creation
- `src/hooks/useTelemetrySocket.ts` — socket lifecycle, reconnect, FPS, and stale detection
- `src/hooks/useCockpit.ts` — selected-machine state, telemetry buffers, gateway hydration, and chaos controls
- `src/mockEngine.ts` — 20 Hz simulator and chart seed history
- `src/components/` — Header, FleetBar, ChaosPanel, HealthGauge, AiScores, RulCard, TelemetryCharts, XaiPanel, MaintenanceTable, ActionPanel, and AlertBanner
- `src/App.tsx` and `src/index.css` — cockpit composition and industrial theme
- `.env.example` — mock/live mode and gateway URL examples

## Dependencies

React and Vite with TypeScript, Tailwind CSS, Recharts, lucide-react, and sonner. Package versions are declared in `package.json` using this repository's pnpm workspace catalog.