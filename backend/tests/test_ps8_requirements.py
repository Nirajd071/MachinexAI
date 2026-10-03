import asyncio
import os
import sys
import tempfile
import unittest
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

import db
import server
from pydantic import ValidationError


class PS8RequirementTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory(prefix="machinexai-tests-")
        db.DB_PATH = os.path.join(cls.temp_dir.name, "ps8.sqlite3")
        db.init_db()

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def test_model_includes_operating_hours_and_trend_output(self):
        for model in server.ai_engine.models.values():
            self.assertIn("operating_hours", model["feature_names"])
            self.assertEqual(len(model["feature_names"]), len(model["train_mean"]))
            age_index = model["feature_names"].index("operating_hours")
            self.assertGreater(model["importances"][age_index], 0)
            self.assertEqual(model["failure_validation"]["sample_count"], 450)
            self.assertGreaterEqual(model["failure_validation"]["recall"], 0)
            self.assertGreaterEqual(model["diagnosis_validation"]["accuracy"], 0)

        raw = server.fleet.get_machine("CNC-01").generate_raw_tick()
        tick = server.ai_engine.evaluate_tick(raw)
        self.assertIn("operating_hours", tick["telemetry"])
        self.assertGreaterEqual(tick["prognostics"]["degradation_trend"], 0)
        self.assertLessEqual(tick["prognostics"]["degradation_trend"], 1)

    def test_fault_injection_moves_risk_and_reports_a_diagnosis(self):
        sim = server.fleet.get_machine("CNC-01")
        sim.set_fault(None, 0)
        normal = [server.ai_engine.evaluate_tick(sim.generate_raw_tick()) for _ in range(20)]
        baseline_risk = sum(t["ai"]["failure_probability"] for t in normal) / len(normal)

        sim.set_fault("bearing_spall", 100)
        degraded = [server.ai_engine.evaluate_tick(sim.generate_raw_tick()) for _ in range(40)]
        latest = degraded[-1]
        self.assertGreater(latest["ai"]["failure_probability"], baseline_risk)
        self.assertNotEqual(latest["health"]["status"], "NOMINAL")
        self.assertTrue(latest["diagnostics"]["probable_fault"])
        self.assertIsNotNone(latest["prognostics"]["rul_hours"])
        sim.set_fault(None, 0)

    def test_printer_can_reach_critical_under_sustained_thermal_runaway(self):
        sim = server.fleet.get_machine("PRN-01")
        sim.set_fault("spindle_overheat", 100)
        tick = None
        for index in range(450):
            tick = server.ai_engine.evaluate_tick(
                sim.generate_raw_tick(timestamp=sim.last_tick_time + 0.01)
            )
            if tick["health"]["status"] == "CRITICAL":
                break
        sim.set_fault(None, 0)
        self.assertIsNotNone(tick)
        self.assertEqual(tick["health"]["status"], "CRITICAL")
        self.assertIn("Thermal", tick["diagnostics"]["probable_fault"])

    def test_chaos_inputs_reject_unsupported_machine_and_out_of_range_values(self):
        with self.assertRaises(ValidationError):
            server.ChaosRequest(machine_id="PC-01", fault_type="bearing_spall", intensity=50)
        with self.assertRaises(ValidationError):
            server.ChaosRequest(machine_id="CNC-01", fault_type="bearing_spall", intensity=101)
        with self.assertRaises(ValidationError):
            server.ChaosRequest(machine_id="CNC-01", fault_type="unknown", intensity=50)

    def test_alert_triggers_on_risk_crossing_and_critical_transition(self):
        reason = server.get_auto_alert_reason("WARNING", "NOMINAL", 0.4, 0.2)
        self.assertEqual(reason, "failure risk increased")
        reason = server.get_auto_alert_reason("CRITICAL", "WARNING", 0.7, 0.6)
        self.assertEqual(reason, "critical state entered")
        self.assertIsNone(server.get_auto_alert_reason("WARNING", "WARNING", 0.4, 0.35))

    def test_model_metrics_are_available_for_every_machine(self):
        metrics = server.get_model_metrics()
        self.assertEqual(set(metrics), {"CNC-01", "CNC-02", "PRN-01", "PC-01"})
        for machine in metrics.values():
            self.assertEqual(machine["failure_risk"]["sample_count"], 450)
            self.assertEqual(machine["fault_diagnosis"]["sample_count"], 450)

    def test_history_endpoint_returns_persisted_ticks_when_ring_is_empty(self):
        raw = server.fleet.get_machine("CNC-02").generate_raw_tick()
        tick = server.ai_engine.evaluate_tick(raw)
        db.log_telemetry_batch([tick])
        server.ring_buffers["CNC-02"].clear()

        history = server.get_history("CNC-02", 1000)
        self.assertTrue(any(item["timestamp"] == tick["timestamp"] for item in history))

    def test_work_order_pdf_and_signoff_record_maintenance(self):
        pdf = server.get_work_order_pdf("CNC-01")
        self.assertEqual(pdf.media_type, "application/pdf")
        self.assertTrue(pdf.body.startswith(b"%PDF"))

        response = asyncio.run(server.sign_off_work_order_endpoint(
            server.SignOffRequest(
                machine_id="CNC-01",
                technician="PS8 Automated Check",
                notes="Requirement test sign-off",
                part_replaced="test component",
            )
        ))
        self.assertEqual(response["status"], "success")
        records = server.get_maintenance("CNC-01")
        self.assertTrue(any(row["technician"] == "PS8 Automated Check" for row in records))


if __name__ == "__main__":
    unittest.main()
