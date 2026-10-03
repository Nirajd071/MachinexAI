# IPM-MFDS Backend Engine

Intelligent Predictive Maintenance and Machine Failure Detection System for CNC Machines & 3D Printers (Problem Statement 8).

---

## Architecture Overview

The backend is built around a **5-Layer Architecture**:

1. **Layer 0 (Offline Training & Synthetic Ground Truth):**
   - Fits unsupervised `IsolationForest` (novelty/anomaly detection) and supervised `RandomForestClassifier` (failure probability risk) per machine profile.
   - Preserves per-machine baselines (CNC lathe, Heavy mill, 3D printer) and extracts `feature_importances_` for XAI attribution.

2. **Layer 1 (Hot Ingestion & 30-Sample Rolling Buffers):**
   - Ingests raw telemetry frames at 15–20 FPS (~60ms).
   - `RollingFeatureBuffer` maintains statistical distributions and baseline z-scores for ML model inference.

3. **Layer 2 (Dual-Track AI & Diagnostics Core):**
   - **Track A (Isolation Forest):** Normalized 0–100 Anomaly Score measuring multi-sensor drift from healthy operational envelope.
   - **Track B (Random Forest Classifier):** Probability of critical failure in the next 24 operating hours (`P(failure) in [0, 1]`).
   - **ISO 10816-3 Severity Standard:** Vibration severity assessment into Zones A (Good), B (Acceptable), C (Unsatisfactory), and D (Danger).
   - **Fused Health Score:** Deterministic weighted formula:
     Health = 98.5 - (0.40 * Anomaly + 0.35 * (FailureProb * 100) + 0.25 * ISOPenalty)
   - **Multi-Sensor Fault Diagnosis:** Distinguishes Bearing Spall, Spindle Overheat, Belt Slip, and Gradual Mechanical Drift.
   - **Explainable AI (XAI):** Importance-weighted z-score attribution: Weight_i proportional to Importance_i * |Z_i|.
   - **Prognostics (RUL):** Remaining Useful Life in operating hours with 90% confidence intervals.

4. **Layer 3 (Digital Twin Simulator & Forced-Tick Circuit):**
   - Coupled thermodynamic and kinematic physics engine.
   - Injects 4 fault modes with continuous intensity (0–100%).
   - Forced-tick circuit evaluates and broadcasts changes immediately (< 400ms end-to-end response time).

5. **Layer 4 & 5 (Storage & Actuation):**
   - Hot Store: In-memory ring buffer (1,000 ticks/machine).
   - Cold Store: SQLite with Write-Ahead Logging (WAL) and performance indexes.
   - Automated ISO 10816-stamped PDF work order generation via ReportLab.
   - Simulated emergency dispatch (Email, SMS, Push notification).
   - Closed-loop technician sign-off workflow restoring machines to nominal operation.

---

## Getting Started

### Prerequisites
- Python 3.10+
- Dependencies listed in `requirements.txt`:
  ```bash
  pip install -r requirements.txt
  ```

### Running the Server
```bash
python3 -m uvicorn server:app --host 0.0.0.0 --port 8000
```

---

## API Specification

### REST Endpoints
- `GET /health` — Service health probe.
- `GET /machines` — List of fleet machines with operating hours and metadata.
- `GET /history?machine_id={id}&limit=1000` — Ring buffer history for instant frontend hydration.
- `GET /maintenance?machine_id={id}` — Historical maintenance records.
- `PATCH /chaos/inject` — Injects faults (`bearing_spall`, `spindle_overheat`, `belt_slip`, `gradual_drift`) with intensity 0–100%.
- `GET /work-order/pdf?machine_id={id}` — Generates downloadable ISO-stamped PDF work order.
- `POST /work-order/sign-off` — Closed-loop technician sign-off; updates work order, records maintenance log, and restores machine.
- `GET /work-orders?machine_id={id}` — List logged work orders with status (`DISPATCHED`, `COMPLETED`).
- `POST /notify/critical?machine_id={id}` — Dispatches simulated multi-channel emergency alert.

### WebSocket
- `ws://localhost:8000/ws/telemetry/live` — High-frequency 15–20 FPS multi-machine telemetry and AI stream.
