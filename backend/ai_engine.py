"""
IPM-MFDS Dual-Track AI Engine & Diagnostics Core (Calibrated)
Implements:
1. Layer 0 Offline Training: Fits Isolation Forest (Anomaly) and Random Forest (Failure Risk)
   on baseline normal and degradation trajectory datasets per machine profile.
2. Online Inference: Computes real-time anomaly scores, failure probabilities,
   ISO 10816-3 rule limits, fused health scores, XAI feature attribution, and RUL.
"""

import numpy as np
from sklearn.ensemble import IsolationForest, RandomForestClassifier
from sklearn.metrics import accuracy_score, brier_score_loss, precision_score, recall_score
from sklearn.model_selection import train_test_split
from typing import Dict, Any, List, Tuple, Optional
from collections import deque

FEATURE_NAMES = [
    "temperature_c",
    "temp_rate_c_per_min",
    "vibration_rms_mm_s",
    "vibration_crest_factor",
    "motor_current_a",
    "spindle_rpm",
    "rpm_volatility",
    "workload_pct",
    "operating_hours"
]

FEATURE_NAMES_NO_SPINDLE = [
    "temperature_c",
    "temp_rate_c_per_min",
    "vibration_rms_mm_s",
    "vibration_crest_factor",
    "motor_current_a",
    "rpm_volatility",
    "workload_pct",
    "operating_hours"
]

FAULT_CLASSES = [
    "Normal",
    "Bearing Spall",
    "Spindle Overheat",
    "Belt Slip",
    "Gradual Mechanical Drift"
]

MACHINE_PROFILES = {
    "CNC-01": {
        "profile": "cnc_standard",
        "rpm": 4950.0,
        "current": 5.2,
        "operating_hours": 1248.5,
        "has_spindle": True
    },
    "CNC-02": {
        "profile": "cnc_heavy",
        "rpm": 3400.0,
        "current": 5.2,
        "operating_hours": 2816.2,
        "has_spindle": True
    },
    "PRN-01": {
        "profile": "printer_3d",
        "rpm": 0.0,
        "current": 2.4,
        "operating_hours": 684.7,
        "has_spindle": False
    },
    "PC-01": {
        "profile": "host_hardware",
        "rpm": 3100.0,
        "current": 4.5,
        "operating_hours": 312.4,
        "has_spindle": True
    }
}

class RollingFeatureBuffer:
    def __init__(self, maxlen=30):
        self.maxlen = maxlen
        self.buffers: Dict[str, deque] = {}

    def push_and_get_zscores(self, machine_id: str, features: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        if machine_id not in self.buffers:
            self.buffers[machine_id] = deque(maxlen=self.maxlen)

        self.buffers[machine_id].append(features)

        history = np.array(self.buffers[machine_id])
        rolling_mean = np.mean(history, axis=0)
        rolling_std = np.std(history, axis=0)

        z_scores = (features - rolling_mean) / (rolling_std + 1e-8)
        return z_scores, rolling_mean, rolling_std

    def get_feature_slope(self, machine_id: str, feature_idx: int) -> float:
        """Computes rate-of-change / degradation slope over the rolling window."""
        if machine_id not in self.buffers or len(self.buffers[machine_id]) < 5:
            return 0.0
        buf = np.array(self.buffers[machine_id])
        y = buf[:, feature_idx]
        n = len(y)
        x = np.arange(n)
        x_mean = np.mean(x)
        y_mean = np.mean(y)
        denom = np.sum((x - x_mean) ** 2)
        if denom < 1e-6:
            return 0.0
        slope = np.sum((x - x_mean) * (y - y_mean)) / denom
        return float(slope)

class DualTrackAIEngine:
    def __init__(self):
        self.models: Dict[str, Dict[str, Any]] = {}
        self.rolling_buffer = RollingFeatureBuffer(maxlen=30)
        self.smoothed_health: Dict[str, float] = {}
        self.train_offline_models()

    def train_offline_models(self):
        """
        Layer 0: Trains the unsupervised Anomaly Model and supervised Failure Model
        on simulated normal baseline and run-to-failure degradation trajectories.
        Uses machine profiles for distinct baselines.
        """
        print("[Layer 0] Training AI models on simulated baseline & failure trajectories per profile...")
        np.random.seed(42)

        for machine_id, profile in MACHINE_PROFILES.items():
            has_spindle = profile["has_spindle"]
            base_rpm = profile["rpm"]
            base_current = profile["current"]
            base_operating_hours = profile["operating_hours"]
            feat_names = FEATURE_NAMES if has_spindle else FEATURE_NAMES_NO_SPINDLE

            # Use machine-specific baselines matching the simulator's actual normal output
            is_pc = (profile.get("profile") == "host_hardware")
            if is_pc:
                base_temp = 50.0
                base_vib = 1.30
                base_crest = 2.4
                base_volatility = 0.007
                base_workload_lo = 8.0
                base_workload_hi = 92.0  # Full legitimate laptop CPU workload range
                base_rpm = 3100.0
                base_rpm_std = 380.0
                base_current = 5.0
            elif not has_spindle:
                base_temp = 48.0
                base_vib = 1.3
                base_crest = 2.3
                base_volatility = 0.012
                base_workload_lo = 35.0
                base_workload_hi = 60.0
                base_rpm_std = 35.0
            else:
                base_temp = 55.0
                base_vib = 2.1
                base_crest = 2.5
                base_volatility = 0.035
                base_workload_lo = 50.0
                base_workload_hi = 80.0
                base_rpm_std = 35.0

            normal_raw = []
            for _ in range(1500):
                temp = np.random.normal(base_temp, 2.0 if is_pc else 2.5)
                temp_rate = np.random.normal(0.0, 0.15 if is_pc else 0.04)
                vib_rms = np.random.normal(base_vib, 0.12 if is_pc else 0.18)
                crest = np.random.normal(base_crest, 0.12 if is_pc else 0.15)
                current = np.random.normal(base_current, 1.2 if is_pc else 0.35)
                volatility = np.random.normal(base_volatility, 0.003 if is_pc else 0.005)
                workload = np.random.uniform(base_workload_lo, base_workload_hi)
                operating_hours = np.random.normal(
                    base_operating_hours,
                    max(25.0, base_operating_hours * 0.04),
                )

                if has_spindle:
                    rpm = np.random.normal(base_rpm, base_rpm_std)
                    normal_raw.append([temp, temp_rate, vib_rms, crest, current, rpm, volatility, workload, operating_hours])
                else:
                    normal_raw.append([temp, temp_rate, vib_rms, crest, current, volatility, workload, operating_hours])

            X_normal_raw = np.array(normal_raw)
            train_mean = np.mean(X_normal_raw, axis=0)
            train_std = np.std(X_normal_raw, axis=0)

            X_normal_z = (X_normal_raw - train_mean) / (train_std + 1e-8)

            iso_forest = IsolationForest(
                n_estimators=100,
                contamination=0.03,
                random_state=42
            )
            iso_forest.fit(X_normal_z)

            # 2. Generate Degradation & Near-Failure Data across a continuous severity spectrum
            failure_raw = []
            labels = []
            fault_labels = []

            for s in normal_raw[:1000]:
                failure_raw.append(s)
                labels.append(0)
                fault_labels.append(0)

            for _ in range(800):
                fault_type = np.random.choice(["bearing", "thermal", "belt", "drift"])
                # Continuous severity spectrum from early degradation (0.1) to critical failure (1.0)
                severity = np.random.uniform(0.10, 1.0)

                if fault_type == "bearing":
                    vib_rms = base_vib + severity * 6.5 + np.random.normal(0, 0.15)
                    crest = base_crest + severity * 4.0 + np.random.normal(0, 0.15)
                    temp = base_temp + severity * 8.0 + np.random.normal(0, 0.5)
                    current = base_current + severity * 2.0 + np.random.normal(0, 0.15)
                    rpm = base_rpm - severity * 120.0 + np.random.normal(0, 15.0)
                    volatility = base_volatility + np.random.normal(0, 0.004)
                    temp_rate = 0.35 * severity + np.random.normal(0, 0.05)
                    workload = np.random.uniform(60.0, 95.0)
                    fault_labels.append(1)
                elif fault_type == "thermal":
                    temp = base_temp + severity * 38.0 + np.random.normal(0, 1.2)
                    temp_rate = 2.5 * severity + np.random.normal(0, 0.15)
                    vib_rms = base_vib + severity * 0.8 + np.random.normal(0, 0.1)
                    crest = base_crest + severity * 0.4 + np.random.normal(0, 0.08)
                    current = base_current + severity * 1.0 + np.random.normal(0, 0.15)
                    rpm = base_rpm - severity * 80.0 + np.random.normal(0, 15.0)
                    volatility = base_volatility + np.random.normal(0, 0.004)
                    workload = np.random.uniform(60.0, 95.0)
                    fault_labels.append(2)
                elif fault_type == "belt":
                    rpm = base_rpm - severity * 550.0 + np.random.normal(0, 30.0)
                    volatility = base_volatility + severity * 0.40 + np.random.normal(0, 0.015)
                    current = base_current + severity * 2.5 + np.random.normal(0, 0.3)
                    vib_rms = base_vib + severity * 0.5 + np.random.normal(0, 0.1)
                    crest = base_crest + severity * 0.5 + np.random.normal(0, 0.08)
                    temp = base_temp + severity * 2.0 + np.random.normal(0, 0.5)
                    temp_rate = 0.04 + np.random.normal(0, 0.02)
                    workload = np.random.uniform(60.0, 90.0)
                    fault_labels.append(3)
                else: # drift
                    vib_rms = base_vib + severity * 2.8 + np.random.normal(0, 0.15)
                    crest = base_crest + severity * 1.5 + np.random.normal(0, 0.1)
                    current = base_current + severity * 1.4 + np.random.normal(0, 0.15)
                    temp = base_temp + severity * 3.5 + np.random.normal(0, 0.5)
                    rpm = base_rpm - severity * 60.0 + np.random.normal(0, 12.0)
                    volatility = base_volatility + np.random.normal(0, 0.004)
                    temp_rate = 0.06 + np.random.normal(0, 0.02)
                    workload = np.random.uniform(55.0, 85.0)
                    fault_labels.append(4)

                # Operating age is part of the risk signal: degradation examples
                # trend older while healthy examples remain around each profile's
                # known operating-hour baseline.
                operating_hours = base_operating_hours + severity * 250.0 + np.random.normal(0, 15.0)

                if has_spindle:
                    failure_raw.append([temp, temp_rate, vib_rms, crest, current, rpm, volatility, workload, operating_hours])
                else:
                    failure_raw.append([temp, temp_rate, vib_rms, crest, current, volatility, workload, operating_hours])

                # Smooth probabilistic failure label based on severity
                if severity < 0.28:
                    lbl = 0
                elif severity < 0.58:
                    lbl = 1 if np.random.random() < ((severity - 0.28) / 0.30) else 0
                else:
                    lbl = 1
                labels.append(lbl)

            X_all_raw = np.array(failure_raw)
            X_all_z = (X_all_raw - train_mean) / (train_std + 1e-8)
            y_all = np.array(labels)
            y_fault = np.array(fault_labels)

            X_train, X_validation, y_train, y_validation = train_test_split(
                X_all_z,
                y_all,
                test_size=0.25,
                random_state=42,
                stratify=y_all,
            )

            rf = RandomForestClassifier(
                n_estimators=60,
                max_depth=6,
                random_state=42
            )
            rf.fit(X_train, y_train)
            risk_probabilities = rf.predict_proba(X_validation)[:, 1]
            risk_predictions = (risk_probabilities >= 0.5).astype(int)
            failure_validation = {
                "sample_count": int(len(y_validation)),
                "accuracy": float(accuracy_score(y_validation, risk_predictions)),
                "precision": float(precision_score(y_validation, risk_predictions, zero_division=0)),
                "recall": float(recall_score(y_validation, risk_predictions, zero_division=0)),
                "brier_score": float(brier_score_loss(y_validation, risk_probabilities)),
            }

            X_fault_train, X_fault_validation, y_fault_train, y_fault_validation = train_test_split(
                X_all_z,
                y_fault,
                test_size=0.25,
                random_state=42,
                stratify=y_fault,
            )

            # Multi-class fault mode classifier
            fault_clf = RandomForestClassifier(
                n_estimators=60,
                max_depth=6,
                random_state=42
            )
            fault_clf.fit(X_fault_train, y_fault_train)
            diagnosis_validation = {
                "sample_count": int(len(y_fault_validation)),
                "accuracy": float(accuracy_score(
                    y_fault_validation,
                    fault_clf.predict(X_fault_validation),
                )),
            }

            self.models[machine_id] = {
                "iso_forest": iso_forest,
                "rf": rf,
                "fault_classifier": fault_clf,
                "has_spindle": has_spindle,
                "feature_names": feat_names,
                "importances": rf.feature_importances_,
                "train_mean": train_mean,
                "train_std": train_std,
                "failure_validation": failure_validation,
                "diagnosis_validation": diagnosis_validation,
            }

        print("[Layer 0] Training completed successfully. Models registered in memory.")

    def evaluate_tick(self, raw_tick: Dict[str, Any]) -> Dict[str, Any]:
        """
        Online Real-Time Inference:
        Fuses Anomaly Detection, Failure Prediction, ISO 10816 Limits, XAI, and RUL.
        """
        machine_id = raw_tick["machine_id"]
        tel = raw_tick["telemetry"]
        chaos = raw_tick.get("chaos", {})

        if machine_id in self.models:
            model_info = self.models[machine_id]
        else:
            model_info = self.models["CNC-01"]

        feat_names = model_info["feature_names"]

        raw_features = []
        for f in feat_names:
            raw_features.append(tel[f])
        raw_features = np.array(raw_features)

        # Compute z-scores against TRAINING baseline (not rolling window)
        # This ensures faults are always detected relative to known-good behavior
        train_mean = model_info["train_mean"]
        train_std = model_info["train_std"]
        baseline_z = (raw_features - train_mean) / (train_std + 1e-8)

        # Also maintain rolling buffer for trend slope estimation (used in RUL)
        rolling_z, r_mean, r_std = self.rolling_buffer.push_and_get_zscores(machine_id, raw_features)
        normalized_slopes = {
            name: self.rolling_buffer.get_feature_slope(machine_id, index)
            / (train_std[index] + 1e-8)
            for index, name in enumerate(feat_names)
        }

        X = np.array([baseline_z])

        # 1. Track A: Isolation Forest Anomaly Score
        raw_anomaly = float(model_info["iso_forest"].decision_function(X)[0])
        # Piecewise linear calibration for training baseline z-scores:
        # raw_anomaly > -0.06  → score 2-5   (firmly normal)
        # -0.06 to -0.11      → score 5-15   (nominal with minor fluctuations)
        # -0.11 to -0.14      → score 15-50  (degrading / WARNING territory)
        # < -0.14             → score 50-99  (anomalous / CRITICAL territory)
        if raw_anomaly > -0.06:
            anomaly_score = float(np.clip(2.0 + abs(raw_anomaly + 0.06) * 30.0, 2.0, 5.0))
        elif raw_anomaly > -0.11:
            anomaly_score = float(5.0 + (abs(raw_anomaly + 0.06)) * 200.0)
        elif raw_anomaly > -0.14:
            anomaly_score = float(15.0 + (abs(raw_anomaly + 0.11)) * 1166.0)
        else:
            anomaly_score = float(np.clip(50.0 + (abs(raw_anomaly + 0.14)) * 500.0, 50.0, 99.0))

        # 2. Track B: Random Forest Failure Probability with Physical Boundary Calibration
        raw_rf_prob = float(model_info["rf"].predict_proba(X)[0][1])
        confidence_pct = float(np.max(model_info["rf"].predict_proba(X)[0]) * 100.0)

        # 3. ISO 10816-3 Vibration Limits & Physical Hazard Index
        vib = tel["vibration_rms_mm_s"]
        if vib > 7.0:
            iso_zone = "Zone D (Danger)"
            iso_penalty = 32.0
            vib_risk = 1.0
        elif vib > 4.5:
            iso_zone = "Zone C (Unsatisfactory)"
            iso_penalty = 14.0
            vib_risk = 0.55 + 0.40 * ((vib - 4.5) / 2.5)
        elif vib > 2.8:
            iso_zone = "Zone B (Acceptable)"
            iso_penalty = 4.0
            vib_risk = 0.15 + 0.35 * ((vib - 2.8) / 1.7)
        else:
            iso_zone = "Zone A (Good)"
            iso_penalty = 0.0
            vib_risk = 0.04

        # 4. Fused Health Score & Tri-State Classification
        temp_val = tel["temperature_c"]

        if machine_id == "PC-01":
            # Laptop CPU / Physical Host Hardware
            # Normal: <= 65°C
            # Warning: 70°C - 82°C (elevated thermal stress / active throttling)
            # Critical: >= 82°C (silicon thermal throttle territory)
            warn_threshold = 70.0
            crit_threshold = 82.0

            therm_risk = min(1.0, max(0.0, (temp_val - 66.0) / 16.0)) if temp_val > 66.0 else 0.04
            failure_prob = float(np.clip(0.35 * raw_rf_prob + 0.65 * therm_risk, 0.02, 0.99))

            if temp_val >= crit_threshold:
                thermal_penalty = 35.0 + min(25.0, (temp_val - crit_threshold) * 2.5)
            elif temp_val >= warn_threshold:
                thermal_penalty = 16.0 + (temp_val - warn_threshold) * 2.0
            elif temp_val >= 66.0:
                thermal_penalty = (temp_val - 66.0) * 1.5
            else:
                thermal_penalty = 0.0

            total_deduction = (anomaly_score * 0.18) + (failure_prob * 100.0 * 0.25) + thermal_penalty
            raw_health = float(np.clip(99.0 - total_deduction, 12.0, 99.0))
            prev_health = self.smoothed_health.get(machine_id, raw_health)
            # Asymmetric EWMA: rapid reaction when degrading (alpha=0.35), but realistic gradual recovery (alpha=0.04)
            # Machine health does not instantaneously jump back to 100% until thermal mass and components stabilize
            alpha = 0.35 if raw_health < prev_health else 0.04
            smoothed_health = (1.0 - alpha) * prev_health + alpha * raw_health
            self.smoothed_health[machine_id] = smoothed_health
            health_score = round(float(smoothed_health), 1)

            # Continuous status determination tied directly to smoothed health & current actual temperature
            if health_score < 45.0 or temp_val >= crit_threshold or failure_prob >= 0.85:
                status = "CRITICAL"
                color = "#EF4444"
            elif health_score <= 82.0 or temp_val >= (warn_threshold - 3.0) or failure_prob >= 0.30:
                status = "WARNING"
                color = "#F59E0B"
            else:
                status = "NOMINAL"
                color = "#10B981"
        else:
            # Industrial Machines (CNC-01, CNC-02, PRN-01)
            # Baseline normal operating temperature is 52°C - 60°C under load.
            warn_threshold = 68.0
            crit_threshold = 78.0

            therm_risk = min(1.0, max(0.0, (temp_val - warn_threshold) / (crit_threshold - warn_threshold))) if temp_val >= warn_threshold else 0.04
            rpm_vol = tel.get("rpm_volatility", 0.0)
            vol_risk = min(1.0, max(0.0, (rpm_vol - 0.08) / 0.32)) if rpm_vol > 0.08 else 0.04

            # Physical boundary risk fusion
            phys_risk = max(vib_risk, therm_risk, vol_risk)
            failure_prob = float(np.clip(0.35 * raw_rf_prob + 0.65 * phys_risk, 0.02, 0.99))

            if temp_val >= crit_threshold:
                thermal_penalty = 30.0 + min(25.0, (temp_val - crit_threshold) * 2.0)
            elif temp_val >= warn_threshold:
                thermal_penalty = 14.0 + (temp_val - warn_threshold) * 1.8
            else:
                thermal_penalty = 0.0

            # Calibrated proportional health deduction
            total_deduction = (anomaly_score * 0.20) + (failure_prob * 100.0 * 0.32) + iso_penalty + thermal_penalty
            raw_health = float(np.clip(98.0 - total_deduction, 12.0, 99.0))
            prev_health = self.smoothed_health.get(machine_id, raw_health)
            # Asymmetric EWMA: instant warning upon fault onset (alpha=0.35), but continuous physical recovery (alpha=0.04)
            # Equipment health recovers progressively alongside mechanical cooldown & vibration dampening
            alpha = 0.35 if raw_health < prev_health else 0.04
            smoothed_health = (1.0 - alpha) * prev_health + alpha * raw_health
            self.smoothed_health[machine_id] = smoothed_health
            health_score = round(float(smoothed_health), 1)

            # Strict tri-state classification:
            # CRITICAL: Catastrophic damage (Bearing Spall Zone D, Spindle Overheat >=78°C, or health < 45)
            # WARNING: Early/moderate degradation (Gradual drift, belt slip, ISO Zone C, 68-78°C temp)
            # NOMINAL: Normal healthy machine
            if (
                health_score < 45.0
                or iso_zone == "Zone D (Danger)"
                or temp_val >= crit_threshold
                or failure_prob >= 0.85
            ):
                status = "CRITICAL"
                color = "#EF4444"
            elif health_score <= 82.0 or iso_zone in ("Zone B (Acceptable)", "Zone C (Unsatisfactory)") or temp_val >= warn_threshold or failure_prob >= 0.22 or anomaly_score >= 18.0:
                status = "WARNING"
                color = "#F59E0B"
            else:
                status = "NOMINAL"
                color = "#10B981"

        # 5. Fault Diagnosis Identification via Trained Multi-Class Random Forest Model
        if status != "NOMINAL" and (failure_prob >= 0.25 or anomaly_score >= 25.0 or temp_val >= warn_threshold):
            fault_clf = model_info["fault_classifier"]
            pred_class_idx = int(fault_clf.predict(X)[0])
            pred_probs = fault_clf.predict_proba(X)[0]

            # If classifier predicted class 0 (Normal) despite health drop, select top predicted fault mode
            if pred_class_idx == 0:
                pred_class_idx = int(np.argmax(pred_probs[1:]) + 1)
                confidence_pct = float(pred_probs[pred_class_idx] * 100.0)
            else:
                confidence_pct = float(pred_probs[pred_class_idx] * 100.0)

            probable_fault = FAULT_CLASSES[pred_class_idx] if confidence_pct >= 35.0 else None
            if not probable_fault and temp_val >= warn_threshold:
                probable_fault = "Spindle Overheat" if machine_id != "PC-01" else "Host CPU Thermal Throttling"
                confidence_pct = float(min(95.0, 75.0 + (temp_val - warn_threshold) * 2.0))
            elif not probable_fault:
                confidence_pct = 0.0

            # Host PC domain adaptation for nomenclature
            if machine_id == "PC-01":
                if temp_val >= crit_threshold:
                    probable_fault = "Host Hardware Thermal Runaway"
                    confidence_pct = float(min(98.5, 85.0 + max(0.0, temp_val - crit_threshold) * 2.5))
                elif temp_val >= warn_threshold:
                    probable_fault = "Host CPU Thermal Throttling"
                    confidence_pct = float(min(94.0, 75.0 + max(0.0, temp_val - warn_threshold) * 3.0))
                elif failure_prob >= 0.50:
                    probable_fault = "High Computational Workload"
                    confidence_pct = float(failure_prob * 100.0)
                else:
                    probable_fault = "Hardware Telemetry Anomaly"
                    confidence_pct = float(min(90.0, max(50.0, anomaly_score)))

            # Printer domain adaptation for nomenclature
            elif not model_info["has_spindle"]:
                if probable_fault == "Spindle Overheat":
                    probable_fault = "Hotend / Bed Thermal Runaway"
                elif probable_fault == "Bearing Spall":
                    probable_fault = "Extruder Stepper Jam"
                elif probable_fault == "Belt Slip":
                    probable_fault = "Axis Timing Belt Slack"
        else:
            probable_fault = None
            confidence_pct = float(model_info["fault_classifier"].predict_proba(X)[0][0] * 100.0)

        # 6. Explainable AI (XAI) Attribution mapped to diagnosed fault mode
        FAULT_PRIORS = {
            "Bearing Spall": {
                "vibration_rms_mm_s": 0.52,
                "vibration_crest_factor": 0.32,
                "temperature_c": 0.08,
                "motor_current_a": 0.08,
            },
            "Extruder Stepper Jam": {
                "vibration_rms_mm_s": 0.52,
                "vibration_crest_factor": 0.32,
                "motor_current_a": 0.16,
            },
            "Spindle Overheat": {
                "temperature_c": 0.48,
                "temp_rate_c_per_min": 0.32,
                "motor_current_a": 0.12,
                "vibration_rms_mm_s": 0.08,
            },
            "Hotend / Bed Thermal Runaway": {
                "temperature_c": 0.50,
                "temp_rate_c_per_min": 0.34,
                "motor_current_a": 0.16,
            },
            "Belt Slip": {
                "spindle_rpm": 0.42,
                "rpm_volatility": 0.34,
                "motor_current_a": 0.16,
                "vibration_rms_mm_s": 0.08,
            },
            "Axis Timing Belt Slack": {
                "rpm_volatility": 0.44,
                "motor_current_a": 0.32,
                "vibration_rms_mm_s": 0.24,
            },
            "Gradual Mechanical Drift": {
                "vibration_rms_mm_s": 0.38,
                "vibration_crest_factor": 0.26,
                "motor_current_a": 0.22,
                "temperature_c": 0.14,
            },
            "Host Hardware Thermal Runaway": {
                "temperature_c": 0.52,
                "temp_rate_c_per_min": 0.30,
                "motor_current_a": 0.18,
            },
            "Host CPU Thermal Throttling": {
                "temperature_c": 0.48,
                "temp_rate_c_per_min": 0.28,
                "workload_pct": 0.24,
            },
            "High Computational Workload": {
                "workload_pct": 0.52,
                "temperature_c": 0.28,
                "motor_current_a": 0.20,
            },
            "Normal": {
                "vibration_rms_mm_s": 0.30,
                "temperature_c": 0.25,
                "motor_current_a": 0.25,
                "spindle_rpm": 0.20,
            }
        }

        prior = FAULT_PRIORS.get(probable_fault, FAULT_PRIORS["Normal"])
        z_dict = {feat_names[i]: abs(baseline_z[i]) for i in range(len(feat_names))}
        raw_weights = {}
        for index, feat in enumerate(feat_names):
            p_weight = prior.get(feat, 0.04)
            learned_weight = float(model_info["importances"][index])
            z_mag = min(6.0, z_dict.get(feat, 0.0))
            blended_weight = 0.5 * p_weight + 0.5 * learned_weight
            raw_weights[feat] = blended_weight * (1.0 + z_mag * 0.5)

        total_w = sum(raw_weights.values()) + 1e-8
        norm_weights = {k: v / total_w for k, v in raw_weights.items()}

        display_map = {
            "vibration_crest_factor": "Vibration Crest Factor",
            "vibration_rms_mm_s": "Vibration RMS",
            "temperature_c": "Temperature",
            "temp_rate_c_per_min": "Temperature Rate",
            "motor_current_a": "Motor Current",
            "rpm_volatility": "RPM Volatility",
            "spindle_rpm": "Spindle RPM",
            "workload_pct": "Workload Ratio",
            "operating_hours": "Operating Hours"
        }

        sorted_feats = sorted(norm_weights.items(), key=lambda item: item[1], reverse=True)[:4]

        xai_contributors = [
            {"sensor": display_map[feat], "weight": round(float(score), 3)}
            for feat, score in sorted_feats
        ]

        # 7. Remaining Useful Life (RUL) Prognostics with Fault Physics Differentiation
        degradation_trend = float(np.clip(sum((
            max(0.0, normalized_slopes.get("temperature_c", 0.0)),
            max(0.0, normalized_slopes.get("vibration_rms_mm_s", 0.0)),
            max(0.0, normalized_slopes.get("motor_current_a", 0.0)),
            max(0.0, -normalized_slopes.get("spindle_rpm", 0.0)),
            max(0.0, normalized_slopes.get("rpm_volatility", 0.0)),
        )) / 0.35, 0.0, 1.0))
        if status != "NOMINAL":
            severity = max(failure_prob, (100.0 - health_score) / 100.0)

            if probable_fault in ("Spindle Overheat", "Hotend / Bed Thermal Runaway") or (machine_id == "PC-01" and temp_val >= warn_threshold):
                # Critical thermal progression: imminent seizure / shutdown within minutes to an hour
                rul_hours = max(0.4, round(float(4.5 * (1.0 - min(0.92, max(0.0, (temp_val - 65.0) / 32.0)))), 1))
            elif probable_fault in ("Bearing Spall", "Extruder Stepper Jam"):
                # Rapid cyclic metal fatigue under dynamic shock loads
                rul_hours = max(0.6, round(float(7.5 * (1.0 - severity * 0.82)), 1))
            elif probable_fault in ("Belt Slip", "Axis Timing Belt Slack"):
                # Mechanical transmission slipping: allows several operational hours
                rul_hours = max(1.5, round(float(14.0 * (1.0 - severity * 0.72)), 1))
            elif probable_fault == "Gradual Mechanical Drift":
                # Slow mechanical wear progression: ample horizon for scheduled recalibration
                rul_hours = max(3.5, round(float(32.0 * (1.0 - severity * 0.65)), 1))
            else:
                # Default proportional RUL
                rul_hours = max(1.0, round(float(28.0 * (health_score / 100.0) * (1.0 - failure_prob * 0.5)), 1))

            # Short-term deterioration in several channels shortens the estimate;
            # stable or improving readings leave the severity-based estimate intact.
            rul_hours = max(0.4, round(rul_hours * (1.0 - 0.35 * degradation_trend), 1))
            rul_ci = [round(max(0.1, rul_hours * 0.78), 1), round(rul_hours * 1.25, 1)]
        else:
            rul_hours = None
            rul_ci = None

        return {
            "machine_id": machine_id,
            "timestamp": raw_tick["timestamp"],
            "telemetry": tel,
            "ai": {
                "anomaly_score": round(anomaly_score, 1),
                "failure_probability": round(failure_prob, 3),
                "horizon_hrs": 24
            },
            "health": {
                "score": round(health_score, 1),
                "status": status,
                "color": color,
                "iso_zone": iso_zone
            },
            "diagnostics": {
                "probable_fault": probable_fault,
                "confidence_pct": round(float(confidence_pct), 1) if probable_fault else 0.0,
                "xai_contributors": xai_contributors
            },
            "prognostics": {
                "rul_hours": rul_hours,
                "rul_ci": rul_ci,
                "degradation_trend": round(degradation_trend, 3)
            },
            "chaos": chaos
        }

if __name__ == "__main__":
    from simulator import FleetSimulator
    fleet = FleetSimulator()
    ai = DualTrackAIEngine()

    print("\n[Test 1: Normal Operation (No Chaos)]")
    for _ in range(30): fleet.simulators["CNC-01"].generate_raw_tick()
    raw = fleet.simulators["CNC-01"].generate_raw_tick()
    tick = ai.evaluate_tick(raw)
    print(f"Health: {tick['health']['score']} | Status: {tick['health']['status']} | Anomaly: {tick['ai']['anomaly_score']} | P(Failure): {tick['ai']['failure_probability']}")
    print(f"ISO Zone: {tick['health']['iso_zone']}")
    print(f"Top XAI Driver: {tick['diagnostics']['xai_contributors'][0]['sensor']} ({tick['diagnostics']['xai_contributors'][0]['weight']*100}%)")

    print("\n[Test 2: Bearing Spall Chaos Injection (85%)]")
    fleet.set_fault("CNC-01", "bearing_spall", 85)
    for _ in range(10): fleet.simulators["CNC-01"].generate_raw_tick()
    raw = fleet.simulators["CNC-01"].generate_raw_tick()
    tick = ai.evaluate_tick(raw)
    print(f"Health: {tick['health']['score']} | Status: {tick['health']['status']} | Anomaly: {tick['ai']['anomaly_score']} | P(Failure): {tick['ai']['failure_probability']}")
    print(f"ISO Zone: {tick['health']['iso_zone']}")
    print(f"Diagnosis: {tick['diagnostics']['probable_fault']} ({tick['diagnostics']['confidence_pct']}%)")
    print(f"RUL: {tick['prognostics']['rul_hours']} hrs (CI: {tick['prognostics']['rul_ci']})")
    print(f"Top XAI Driver: {tick['diagnostics']['xai_contributors'][0]['sensor']} ({tick['diagnostics']['xai_contributors'][0]['weight']*100}%)")
