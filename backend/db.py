"""
IPM-MFDS SQLite Database Layer (WAL Mode)
Provides high-performance, non-blocking telemetry logging,
historical maintenance tracking, and work order auditing.
"""

import sqlite3
import json
import os
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "ipm_mfds.db")

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high-throughput, non-blocking concurrent reads & writes
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn

def init_db():
    conn = get_connection()
    with conn:
        # 1. Machines Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS machines (
                machine_id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                operating_hours REAL NOT NULL,
                service_age_hrs REAL NOT NULL,
                created_at TEXT NOT NULL
            );
        """)

        # 2. Historical Maintenance Records (Problem Statement 8 requirement)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS maintenance_records (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_id TEXT NOT NULL,
                date TEXT NOT NULL,
                action TEXT NOT NULL,
                technician TEXT NOT NULL,
                part TEXT,
                FOREIGN KEY (machine_id) REFERENCES machines(machine_id)
            );
        """)

        # 3. Telemetry History Buffer
        conn.execute("""
            CREATE TABLE IF NOT EXISTS telemetry_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_id TEXT NOT NULL,
                timestamp TEXT NOT NULL,
                temperature_c REAL NOT NULL,
                vibration_rms REAL NOT NULL,
                crest_factor REAL NOT NULL,
                motor_current_a REAL NOT NULL,
                spindle_rpm REAL NOT NULL,
                workload_pct REAL NOT NULL,
                health_score REAL NOT NULL,
                health_status TEXT NOT NULL,
                anomaly_score REAL NOT NULL,
                failure_prob REAL NOT NULL,
                payload_json TEXT NOT NULL
            );
        """)

        # 4. Work Orders Table
        conn.execute("""
            CREATE TABLE IF NOT EXISTS work_orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                machine_id TEXT NOT NULL,
                created_at TEXT NOT NULL,
                status TEXT NOT NULL,
                fault_diagnosed TEXT NOT NULL,
                confidence_pct REAL NOT NULL,
                spare_part TEXT NOT NULL,
                pdf_path TEXT
            );
        """)

        # Performance indexes for telemetry queries
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_machine ON telemetry_history(machine_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_history(machine_id, timestamp);")

        # Seed machines if empty
        cursor = conn.execute("SELECT COUNT(*) as count FROM machines;")
        if cursor.fetchone()["count"] == 0:
            now = datetime.now(timezone.utc).isoformat()
            seeds = [
                ("CNC-01", "CNC Mill #1", "Spindle Lathe", 1248.5, 320.0, now),
                ("CNC-02", "CNC Mill #2", "Heavy Milling", 2816.2, 187.0, now),
                ("PRN-01", "Ender-3 Pro", "3D Printer", 684.7, 94.0, now),
                ("PC-01", "Acer Nitro Host PC", "Live Hardware Rig", 312.4, 45.0, now),
            ]
            conn.executemany("INSERT INTO machines VALUES (?, ?, ?, ?, ?, ?);", seeds)

            # Seed initial historical maintenance records
            maintenance_seeds = [
                ("CNC-01", "2026-09-20T08:30:00Z", "Spindle bearing inspection & lubrication", "M. Alvarez", "SKF 6205-2RSH bearing"),
                ("CNC-01", "2026-08-18T14:15:00Z", "Coolant filtration and line flush", "J. Chen", "Coolant filter cartridge"),
                ("CNC-02", "2026-09-12T10:00:00Z", "Drive belt tensioning and alignment", "R. Patel", "Optibelt Red Power 3"),
                ("CNC-02", "2026-07-29T16:45:00Z", "Axis gib adjustment and leadscrew lube", "M. Alvarez", "Mobil Vactra #2 Way Oil"),
                ("PRN-01", "2026-09-24T11:20:00Z", "Nozzle replacement and bed re-leveling", "S. Kumar", "Hardened steel 0.4mm nozzle"),
                ("PC-01", "2026-09-28T09:00:00Z", "Thermal paste repaste & fan cleaning", "System Admin", "Thermal Grizzly Kryonaut"),
            ]
            conn.executemany("INSERT INTO maintenance_records (machine_id, date, action, technician, part) VALUES (?, ?, ?, ?, ?);", maintenance_seeds)
        else:
            # Ensure PC-01 exists even if DB was previously initialized
            now = datetime.now(timezone.utc).isoformat()
            conn.execute("INSERT OR IGNORE INTO machines VALUES (?, ?, ?, ?, ?, ?);", ("PC-01", "Acer Nitro Host PC", "Live Hardware Rig", 312.4, 45.0, now))
    conn.close()

def log_telemetry_batch(ticks: List[Dict[str, Any]]):
    if not ticks:
        return
    try:
        conn = get_connection()
        rows = []
        for t in ticks:
            tel = t["telemetry"]
            rows.append((
                t["machine_id"],
                t["timestamp"],
                tel["temperature_c"],
                tel["vibration_rms_mm_s"],
                tel["vibration_crest_factor"],
                tel["motor_current_a"],
                tel["spindle_rpm"],
                tel["workload_pct"],
                t["health"]["score"],
                t["health"]["status"],
                t["ai"]["anomaly_score"],
                t["ai"]["failure_probability"],
                json.dumps(t)
            ))
        with conn:
            conn.executemany("""
                INSERT INTO telemetry_history
                (machine_id, timestamp, temperature_c, vibration_rms, crest_factor, motor_current_a, spindle_rpm, workload_pct, health_score, health_status, anomaly_score, failure_prob, payload_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, rows)
        conn.close()
    except Exception as e:
        print(f"[DB Error: log_telemetry_batch] {e}")

def get_machine_list() -> List[Dict[str, Any]]:
    try:
        conn = get_connection()
        cursor = conn.execute("SELECT machine_id, name, type, operating_hours, service_age_hrs FROM machines;")
        machines = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return machines
    except Exception as e:
        print(f"[DB Error: get_machine_list] {e}")
        return []

def get_maintenance_history(machine_id: str) -> List[Dict[str, Any]]:
    try:
        conn = get_connection()
        cursor = conn.execute("""
            SELECT date, action, technician, part
            FROM maintenance_records
            WHERE machine_id = ?
            ORDER BY date DESC;
        """, (machine_id,))
        records = [dict(row) for row in cursor.fetchall()]
        conn.close()
        return records
    except Exception as e:
        print(f"[DB Error: get_maintenance_history] {e}")
        return []

def get_recent_history(machine_id: str, limit: int = 1000) -> List[Dict[str, Any]]:
    try:
        conn = get_connection()
        cursor = conn.execute("""
            SELECT payload_json
            FROM telemetry_history
            WHERE machine_id = ?
            ORDER BY id DESC
            LIMIT ?;
        """, (machine_id, limit))
        rows = cursor.fetchall()
        conn.close()
        ticks = [json.loads(row["payload_json"]) for row in reversed(rows)]
        return ticks
    except Exception as e:
        print(f"[DB Error: get_recent_history] {e}")
        return []

def log_work_order(machine_id: str, tick_data: dict) -> int:
    """Log a generated work order to the database. Returns the work order ID."""
    conn = get_connection()
    diag = tick_data.get("diagnostics", {}) if tick_data else {}
    fault = diag.get("probable_fault") or "Unknown"
    confidence = diag.get("confidence_pct") or 0.0

    fault_lower = str(fault).lower()

    # Machine-specific spare parts (mirrors pdf_generator.py)
    MACHINE_PARTS = {
        'PC-01': {'thermal': 'PTM7950 Phase-Change TIM & Dual FDB Blower Fan', 'fan': 'FDB 5V CPU/GPU Blower Fan', 'default': 'Host PC Heatsink Service Pack'},
        'PRN-01': {'thermal': 'E3D V6 All-Metal Hotend & 24V Heater Cartridge', 'bearing': 'Bondtech BMG Dual-Drive Extruder', 'belt': 'Gates 2GT Timing Belt Kit', 'default': 'Ender-3 24V Maintenance Pack'},
        'CNC-01': {'bearing': 'SKF 6205-2RSH Spindle Ball Bearing', 'thermal': '440V Flood Coolant Pump Assembly', 'belt': 'Optibelt Red Power 3 Drive Belt', 'default': 'Haas VF-2 Maintenance Pack'},
        'CNC-02': {'bearing': 'SKF NN 3016 K Roller Bearing', 'thermal': '440V Oil Heat Exchanger', 'belt': 'Gates Carbon Timing Belt', 'default': 'DMG MORI Service Kit'},
    }
    parts = MACHINE_PARTS.get(machine_id, MACHINE_PARTS['CNC-01'])

    if 'thermal' in fault_lower or 'overheat' in fault_lower or 'throttling' in fault_lower or 'runaway' in fault_lower:
        spare_part = parts.get('thermal', parts['default'])
    elif 'bearing' in fault_lower or 'spall' in fault_lower or 'extruder' in fault_lower or 'jam' in fault_lower:
        spare_part = parts.get('bearing', parts['default'])
    elif 'belt' in fault_lower or 'slip' in fault_lower or 'slack' in fault_lower:
        spare_part = parts.get('belt', parts['default'])
    elif 'fan' in fault_lower:
        spare_part = parts.get('fan', parts['default'])
    else:
        spare_part = parts['default']

    now = datetime.now(timezone.utc).isoformat()
    with conn:
        cursor = conn.execute(
            "INSERT INTO work_orders (machine_id, created_at, status, fault_diagnosed, confidence_pct, spare_part) VALUES (?, ?, ?, ?, ?, ?);",
            (machine_id, now, "DISPATCHED", fault, confidence, spare_part)
        )
        wo_id = cursor.lastrowid
    conn.close()
    return wo_id

def sign_off_work_order(machine_id: str, technician: str, notes: Optional[str] = None, part_replaced: Optional[str] = None) -> Dict[str, Any]:
    """
    Signs off an active work order, updates work order status to COMPLETED,
    and inserts a record into maintenance_records for closed-loop compliance.
    """
    conn = get_connection()
    now = datetime.now(timezone.utc).isoformat()
    with conn:
        cursor = conn.execute("""
            SELECT id, spare_part, fault_diagnosed FROM work_orders
            WHERE machine_id = ? AND status = 'DISPATCHED'
            ORDER BY id DESC LIMIT 1;
        """, (machine_id,))
        row = cursor.fetchone()

        part = part_replaced or (row["spare_part"] if row else "Standard Maintenance Component")
        action = notes or (f"Repaired {row['fault_diagnosed'] if row else 'machine fault'}; replaced {part}")

        if row:
            conn.execute("UPDATE work_orders SET status = 'COMPLETED' WHERE id = ?;", (row["id"],))
            wo_id = row["id"]
        else:
            c = conn.execute("""
                INSERT INTO work_orders (machine_id, created_at, status, fault_diagnosed, confidence_pct, spare_part)
                VALUES (?, ?, 'COMPLETED', 'Preventive Maintenance', 100.0, ?);
            """, (machine_id, now, part))
            wo_id = c.lastrowid

        conn.execute("""
            INSERT INTO maintenance_records (machine_id, date, action, technician, part)
            VALUES (?, ?, ?, ?, ?);
        """, (machine_id, now, action, technician, part))

    conn.close()
    return {
        "status": "success",
        "work_order_id": wo_id,
        "machine_id": machine_id,
        "date": now,
        "action": action,
        "technician": technician,
        "part": part
    }

def get_work_orders(machine_id: Optional[str] = None) -> List[Dict[str, Any]]:
    """Returns work orders, optionally filtered by machine_id."""
    conn = get_connection()
    if machine_id:
        cursor = conn.execute("SELECT * FROM work_orders WHERE machine_id = ? ORDER BY id DESC;", (machine_id,))
    else:
        cursor = conn.execute("SELECT * FROM work_orders ORDER BY id DESC;")
    orders = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return orders

if __name__ == "__main__":
    init_db()
    print("Database initialized successfully at:", DB_PATH)
