"""
IPM-MFDS Master FastAPI Server
Serves:
1. REST API:
   - GET /machines
   - GET /history
   - GET /maintenance
   - PATCH /chaos/inject
   - GET /work-order/pdf
   - GET /health
2. High-Performance WebSocket:
   - /ws/telemetry/live (Streaming multi-machine inference at 10-20 FPS)
3. Background Ingestion & AI Loop with In-Memory Ring Buffer and SQLite Logging.
"""

import asyncio
import json
import time
import os
import base64
from typing import Dict, List, Any, Optional
from collections import deque
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, Response, status
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from simulator import FleetSimulator
from ai_engine import DualTrackAIEngine
from db import (
    init_db, log_telemetry_batch, get_machine_list,
    get_maintenance_history, get_recent_history, log_work_order,
    sign_off_work_order, get_work_orders
)
from pdf_generator import generate_work_order_pdf

# Global instances
fleet = FleetSimulator()
ai_engine = DualTrackAIEngine()

# Load environment variables from backend/.env if present
try:
    _env_path = os.path.join(os.path.dirname(__file__), ".env")
    if os.path.exists(_env_path):
        with open(_env_path, "r") as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith("#") and "=" in _line:
                    _k, _v = _line.split("=", 1)
                    if _k.strip() not in os.environ:
                        os.environ[_k.strip()] = _v.strip()
except Exception as _e:
    print(f"[ENV Warning] Failed to load .env: {_e}")

# In-Memory Ring Buffer: stores last 1,000 ticks per machine for instant UI hydration
BUFFER_MAX = 1000
ring_buffers: Dict[str, deque] = {
    "CNC-01": deque(maxlen=BUFFER_MAX),
    "CNC-02": deque(maxlen=BUFFER_MAX),
    "PRN-01": deque(maxlen=BUFFER_MAX),
    "PC-01": deque(maxlen=BUFFER_MAX)
}

# Latest tick per machine
latest_ticks: Dict[str, Dict[str, Any]] = {}

# State tracking for auto-alerting
machine_last_status: Dict[str, str] = {}
machine_last_failure_risk: Dict[str, float] = {}
machine_last_alert_time: Dict[str, float] = {}

# Active WebSocket connections
active_connections: List[WebSocket] = []

class ChaosRequest(BaseModel):
    machine_id: str = Field(pattern=r"^(CNC-01|CNC-02|PRN-01)$")
    fault_type: str = Field(pattern=r"^(bearing_spall|spindle_overheat|belt_slip|gradual_drift)$")
    intensity: float = Field(ge=0, le=100)

class SignOffRequest(BaseModel):
    machine_id: str
    technician: str = "Lead Technician"
    notes: Optional[str] = None
    part_replaced: Optional[str] = None


def get_auto_alert_reason(
    current_status: str,
    previous_status: str,
    current_risk: float,
    previous_risk: float,
) -> Optional[str]:
    if current_status == "CRITICAL" and previous_status != "CRITICAL":
        return "critical state entered"
    if current_risk >= 0.35 and (
        previous_risk < 0.35 or current_risk - previous_risk >= 0.15
    ):
        return "failure risk increased"
    return None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize Database and seed ring buffers
    init_db()
    print("[Server Startup] Database initialized. Seeding initial baseline telemetry buffer...")
    now = time.time()
    for i in range(100):
        t_hist = now - (100 - i) * 0.1
        for m_id, sim in fleet.simulators.items():
            raw = sim.generate_raw_tick(timestamp=t_hist)
            evaluated = ai_engine.evaluate_tick(raw)
            ring_buffers[m_id].append(evaluated)
            latest_ticks[m_id] = evaluated

    print("[Server Startup] Starting background 10-20 FPS telemetry & AI streaming loop...")
    task = asyncio.create_task(background_telemetry_loop())
    yield
    task.cancel()
    print("[Server Shutdown] Stopped telemetry loop.")

app = FastAPI(title="MachinexAI Telemetry & AI Gateway", lifespan=lifespan)

# Allow CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

async def background_telemetry_loop():
    """
    Core Streaming Loop: Runs at 15-20 FPS (approx 60ms per tick),
    evaluating AI models and pushing enriched frames to connected WebSockets.
    """
    db_save_counter = 0
    ticks_to_save = []

    while True:
        try:
            t_now = time.time()
            for m_id, sim in fleet.simulators.items():
                raw = sim.generate_raw_tick(timestamp=t_now)
                evaluated = ai_engine.evaluate_tick(raw)

                # Alert when the machine enters Critical or crosses / sharply
                # increases above the elevated-risk threshold.
                curr_status = evaluated.get("health", {}).get("status", "NOMINAL")
                prev_status = machine_last_status.get(m_id, "NOMINAL")
                curr_risk = float(evaluated.get("ai", {}).get("failure_probability", 0.0))
                prev_risk = machine_last_failure_risk.get(m_id, 0.0)
                machine_last_status[m_id] = curr_status
                machine_last_failure_risk[m_id] = curr_risk

                alert_reason = get_auto_alert_reason(
                    curr_status, prev_status, curr_risk, prev_risk
                )
                if alert_reason:
                    now_ts = time.time()
                    if now_ts - machine_last_alert_time.get(m_id, 0) > 60:
                        machine_last_alert_time[m_id] = now_ts
                        print(f"[AUTO-ALERT] {m_id}: {alert_reason} (risk {curr_risk:.0%}, {curr_status}); dispatching alert")
                        asyncio.create_task(dispatch_emergency_alert(m_id, evaluated))

                # Update Ring Buffer
                ring_buffers[m_id].append(evaluated)
                latest_ticks[m_id] = evaluated
                ticks_to_save.append(evaluated)

                # Broadcast over active WebSockets using concurrent non-blocking fan-out
                if active_connections:
                    message_str = json.dumps(evaluated)
                    results = await asyncio.gather(
                        *[ws.send_text(message_str) for ws in active_connections],
                        return_exceptions=True
                    )
                    dead_sockets = [
                        ws for ws, res in zip(active_connections, results)
                        if isinstance(res, Exception)
                    ]
                    for ds in dead_sockets:
                        if ds in active_connections:
                            active_connections.remove(ds)

            # Persist to SQLite every 20 ticks (1 second) in thread pool (non-blocking)
            db_save_counter += 1
            if db_save_counter >= 20:
                batch_copy = list(ticks_to_save)
                ticks_to_save.clear()
                db_save_counter = 0
                asyncio.create_task(asyncio.to_thread(log_telemetry_batch, batch_copy))

            # Target 15-20 FPS (~60ms tick interval)
            await asyncio.sleep(0.065)
        except asyncio.CancelledError:
            break
        except Exception as e:
            print(f"[Loop Error] {e}")
            await asyncio.sleep(0.1)

# ==================== REST ENDPOINTS ====================

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "machinexai-backend", "time": time.time()}

@app.get("/machines")
def get_machines():
    """Returns the fleet of machines with operating hours and metadata."""
    return get_machine_list()


@app.get("/model/metrics")
def get_model_metrics():
    """Expose held-out synthetic validation results for demo transparency."""
    return {
        machine_id: {
            "failure_risk": model["failure_validation"],
            "fault_diagnosis": model["diagnosis_validation"],
        }
        for machine_id, model in ai_engine.models.items()
    }

@app.get("/history")
def get_history(
    machine_id: str = Query(..., description="Machine ID, e.g. CNC-01"),
    limit: int = Query(1000, ge=1, le=1000),
):
    """
    Return durable telemetry plus newer in-memory frames for UI hydration.
    """
    persisted = get_recent_history(machine_id, limit)
    buffered = list(ring_buffers.get(machine_id, ()))
    if not persisted:
        return buffered[-limit:]

    # Merge the durable history with newer in-memory frames and deduplicate by
    # timestamp. This keeps hydration useful after restarts without dropping
    # the most recent ticks that have not reached the SQLite batch writer yet.
    by_timestamp = {tick["timestamp"]: tick for tick in persisted}
    by_timestamp.update({tick["timestamp"]: tick for tick in buffered})
    return sorted(by_timestamp.values(), key=lambda tick: tick["timestamp"])[-limit:]

@app.get("/maintenance")
def get_maintenance(machine_id: str = Query(..., description="Machine ID, e.g. CNC-01")):
    """
    Returns historical maintenance and repair logs (Problem Statement 8 requirement).
    """
    return get_maintenance_history(machine_id)

@app.patch("/chaos/inject", status_code=status.HTTP_200_OK)
async def inject_chaos(req: ChaosRequest):
    """
    ⚡ THE FORCED TICK CIRCUIT:
    Sets fault type & intensity, then forces an immediate tick evaluation and WebSocket push
    so the UI updates in <400ms under the judge's finger!
    """
    sim = fleet.get_machine(req.machine_id)
    if not sim:
        return {"status": "error", "message": f"Machine {req.machine_id} not found"}

    fleet.set_fault(req.machine_id, req.fault_type, req.intensity)

    # Force immediate tick
    raw = sim.generate_raw_tick()
    evaluated = ai_engine.evaluate_tick(raw)
    ring_buffers[req.machine_id].append(evaluated)
    latest_ticks[req.machine_id] = evaluated

    # Broadcast forced tick immediately
    if active_connections:
        message_str = json.dumps(evaluated)
        for ws in active_connections:
            try:
                await ws.send_text(message_str)
            except Exception:
                pass

    return {
        "status": "success",
        "machine_id": req.machine_id,
        "fault_type": req.fault_type,
        "intensity": req.intensity,
        "health_score": evaluated["health"]["score"],
        "health_status": evaluated["health"]["status"]
    }

@app.get("/work-order/pdf")
def get_work_order_pdf(machine_id: str = Query(..., description="Machine ID")):
    """
    Generates and returns an official ISO 10816 stamped Work-Order PDF.
    """
    tick_data = latest_ticks.get(machine_id)
    pdf_bytes = generate_work_order_pdf(machine_id, tick_data)

    # Log work order to database
    try:
        wo_id = log_work_order(machine_id, tick_data)
        print(f"[Work Order] Generated WO #{wo_id} for {machine_id}")
    except Exception as e:
        print(f"[Work Order] DB logging failed: {e}")

    headers = {
        "Content-Disposition": f'attachment; filename="WO_{machine_id}_{int(time.time())}.pdf"'
    }
    return Response(content=pdf_bytes, media_type="application/pdf", headers=headers)

async def dispatch_emergency_alert(machine_id: str, tick: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Core dispatcher that invokes Nodemailer to transmit emergency email/SMS
    to maintenance administration.
    """
    if not tick:
        tick = latest_ticks.get(machine_id, {})
    health = tick.get("health", {})
    diag = tick.get("diagnostics", {})
    prog = tick.get("prognostics", {})

    # Generate ISO-10816 work order PDF in-memory and attach base64
    pdf_base64 = None
    pdf_filename = None
    try:
        pdf_bytes = generate_work_order_pdf(machine_id, tick)
        pdf_base64 = base64.b64encode(pdf_bytes).decode("utf-8")
        pdf_filename = f"WO_{machine_id}_{int(time.time())}.pdf"
    except Exception as e:
        print(f"[Work Order PDF Generation Error] {e}")

    payload = {
        "machine_id": machine_id,
        "health_score": health.get("score", 0),
        "health_status": health.get("status", "CRITICAL"),
        "iso_zone": health.get("iso_zone", "Zone D (Danger)"),
        "diagnosed_fault": diag.get("probable_fault", "Mechanical Failure"),
        "confidence_pct": diag.get("confidence_pct", 95.0),
        "rul_hours": prog.get("rul_hours", 4.2),
        "xai_contributors": diag.get("xai_contributors", []),
        "telemetry": tick.get("telemetry", {}),
        "pdf_base64": pdf_base64,
        "pdf_filename": pdf_filename,
        "admin_email": os.environ.get("ADMIN_EMAIL", ""),
        "admin_phone_email": os.environ.get("ADMIN_PHONE_EMAIL", "")
    }

    mailer_script = os.path.join(os.path.dirname(__file__), "notify_mailer.js")
    try:
        proc = await asyncio.create_subprocess_exec(
            "node", mailer_script,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await proc.communicate(input=json.dumps(payload).encode())
        if proc.returncode == 0:
            result = json.loads(stdout.decode())
            print(f"[NODEMAILER] Dispatch status for {machine_id}: {result.get('status')}. Message: {result.get('message_ids')}")
            if result.get("preview_url"):
                print(f"[NODEMAILER] Ethereal preview: {result['preview_url']}")
            return result
        else:
            print(f"[NODEMAILER Error] {stderr.decode()}")
    except Exception as e:
        print(f"[NODEMAILER Exception] {e}")

    return {
        "status": "error",
        "machine_id": machine_id,
        "channels": ["EMAIL", "SMS_PHONE_EMAIL"],
        "message": f"Alert dispatch failed for {machine_id} — check SMTP credentials and Node.js"
    }

@app.post("/notify/critical")
async def notify_critical(machine_id: str = Query(...)):
    """
    Manual API endpoint: Dispatches rich HTML emergency alert and SMS notification
    using Nodemailer.
    """
    return await dispatch_emergency_alert(machine_id)

@app.post("/alert/admin")
async def alert_admin(req: dict):
    """
    Alias endpoint for admin alerts matching frontend contracts
    """
    machine_id = req.get("machine_id", "CNC-01")
    return await dispatch_emergency_alert(machine_id)

@app.post("/work-order/sign-off")
async def sign_off_work_order_endpoint(req: SignOffRequest):
    """
    Closed-loop technician sign-off:
    1. Updates latest work order to COMPLETED
    2. Logs maintenance record into SQLite database
    3. Resets machine fault in simulator to restore machine to NOMINAL
    4. Broadcasts recovery tick immediately over WebSockets
    """
    res = sign_off_work_order(req.machine_id, req.technician, req.notes, req.part_replaced)

    # Self-heal / clear fault on the machine
    fleet.set_fault(req.machine_id, None, 0.0)
    sim = fleet.get_machine(req.machine_id)
    if sim:
        raw = sim.generate_raw_tick()
        evaluated = ai_engine.evaluate_tick(raw)
        ring_buffers[req.machine_id].append(evaluated)
        latest_ticks[req.machine_id] = evaluated
        if active_connections:
            msg = json.dumps(evaluated)
            await asyncio.gather(*[ws.send_text(msg) for ws in active_connections], return_exceptions=True)

    print(f"[SIGN-OFF] Machine {req.machine_id} signed off by {req.technician}. Restored to NOMINAL.")
    return res

@app.get("/work-orders")
def list_work_orders(machine_id: Optional[str] = Query(None, description="Optional machine ID")):
    """Returns logged work orders."""
    return get_work_orders(machine_id)

# ==================== WEBSOCKET ENDPOINT ====================

@app.websocket("/ws/telemetry/live")
async def websocket_telemetry(websocket: WebSocket):
    await websocket.accept()
    active_connections.append(websocket)
    print(f"[WebSocket] Client connected. Total active: {len(active_connections)}")
    try:
        # Keep socket open and receive any ping/control messages from client
        while True:
            data = await websocket.receive_text()
            # Client can send custom heartbeats
    except WebSocketDisconnect:
        if websocket in active_connections:
            active_connections.remove(websocket)
        print(f"[WebSocket] Client disconnected. Total active: {len(active_connections)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=False)
