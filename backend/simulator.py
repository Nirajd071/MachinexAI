"""
IPM-MFDS Digital Twin Physics Coupled Simulator
Generates realistic multi-channel sensor telemetry for:
- CNC Mill #1 (Spindle Lathe)
- CNC Mill #2 (Heavy Milling Rig)
- Ender-3 Pro (3D Printer)

Supports realistic mechanical coupling and fault injection:
- Bearing Spall (High vibration harmonics, elevated Crest Factor)
- Spindle Overheat (Thermal runaway, steep dT/dt gradient)
- Belt Slip (RPM volatility spike, current oscillations)
- Gradual Drift (Subtle progressive wear)
"""

import time
import math
import random
import os
import psutil
from collections import deque
from typing import Dict, Any, Optional

SIMULATOR_EPOCH = time.time()

class MachineSimulator:
    def __init__(self, machine_id: str, name: str, m_type: str, op_hours: float, service_age: float):
        self.machine_id = machine_id
        self.name = name
        self.m_type = m_type
        self.base_op_hours = op_hours
        self.service_age_hrs = service_age

        # State tracking
        self.active_fault: Optional[str] = None
        self.intensity: float = 0.0  # 0 to 100
        self.last_temp = 48.0 if machine_id == 'PRN-01' else 56.0
        self.last_tick_time = time.time()
        self.tick_count = 0

    def set_fault(self, fault_type: Optional[str], intensity: float):
        if intensity <= 0 or fault_type is None:
            self.active_fault = None
            self.intensity = 0.0
            # Do NOT artificially snap temperature down to base.
            # Allow Newton's law of cooling in generate_raw_tick() to cool down gradually!
        else:
            self.active_fault = fault_type
            self.intensity = min(100.0, max(0.0, float(intensity)))

    def generate_raw_tick(self, timestamp: Optional[float] = None) -> Dict[str, Any]:
        t = timestamp if timestamp is not None else time.time()
        dt = max(0.01, t - self.last_tick_time)
        self.last_tick_time = t
        self.tick_count += 1

        level = (self.intensity / 100.0) if self.active_fault else 0.0
        m_factor = 0.62 if self.machine_id == 'PRN-01' else (1.15 if self.machine_id == 'CNC-02' else 1.0)

        # 1. Base Workload (%) with realistic sinusoidal variation + noise
        base_workload = 68.0 if self.machine_id != 'PRN-01' else 45.0
        workload = base_workload + 12.0 * math.sin(self.tick_count * 0.05) + random.uniform(-3.5, 3.5)
        workload = max(10.0, min(100.0, workload))
        workload_ratio = workload / 100.0

        # 2. Spindle RPM & Volatility (Belt slip causes severe RPM drop and volatility)
        if self.machine_id == 'PRN-01':
            spindle_rpm = 0.0
            rpm_volatility = 0.01 + (level * 0.38 if self.active_fault == 'belt_slip' else 0.0) + random.uniform(0, 0.005)
        elif self.machine_id == 'CNC-02':
            nominal_rpm = 3400.0
            rpm_drop = (level * 420.0) if self.active_fault == 'belt_slip' else (level * 70.0 if self.active_fault else 0.0)
            spindle_rpm = nominal_rpm - (workload_ratio * 80.0) - rpm_drop + random.uniform(-15.0, 15.0)
            rpm_volatility = 0.03 + (level * 0.38 if self.active_fault == 'belt_slip' else 0.0) + random.uniform(0, 0.01)
        else: # CNC-01
            nominal_rpm = 4950.0
            rpm_drop = (level * 580.0) if self.active_fault == 'belt_slip' else (level * 90.0 if self.active_fault else 0.0)
            spindle_rpm = nominal_rpm - (workload_ratio * 110.0) - rpm_drop + random.uniform(-20.0, 20.0)
            rpm_volatility = 0.035 + (level * 0.42 if self.active_fault == 'belt_slip' else 0.0) + random.uniform(0, 0.015)

        # 3. Vibration RMS (mm/s) & Crest Factor (Bearing Spall & Drift cause vibration)
        base_vibe = 1.3 if self.machine_id == 'PRN-01' else 2.1
        vibe_workload_comp = (workload_ratio - 0.5) * 0.4

        if self.active_fault == 'bearing_spall':
            vibe_fault = level * 7.2 * m_factor
            crest_base = 2.8 + level * 4.0 + random.uniform(-0.15, 0.2)
        elif self.active_fault == 'gradual_drift':
            vibe_fault = level * 2.8 * m_factor
            crest_base = 2.4 + level * 1.5 + random.uniform(-0.1, 0.1)
        elif self.active_fault == 'belt_slip':
            vibe_fault = level * 0.5 * m_factor
            crest_base = 2.4 + level * 0.6 + random.uniform(-0.1, 0.1)
        elif self.active_fault == 'spindle_overheat':
            vibe_fault = level * 0.8 * m_factor
            crest_base = 2.4 + level * 0.4 + random.uniform(-0.1, 0.1)
        else: # Normal (no fault)
            vibe_fault = 0.0
            crest_base = 2.4 + random.uniform(-0.1, 0.1)

        vibration_rms = max(0.5, base_vibe + vibe_workload_comp + vibe_fault + random.uniform(-0.12, 0.12))
        crest_factor = max(1.4, crest_base + random.uniform(-0.08, 0.08))

        # 4. Temperature (°C) & Thermal Gradient (dT/dt)
        base_temp = 46.0 if self.machine_id == 'PRN-01' else 55.0
        thermal_workload = workload_ratio * 6.0

        if self.active_fault == 'spindle_overheat':
            target_temp = base_temp + thermal_workload + (level * 42.0)
            target_rate = 2.6 * level + random.uniform(-0.15, 0.2)
        elif self.active_fault == 'bearing_spall':
            target_temp = base_temp + thermal_workload + (level * 8.0)
            target_rate = 0.35 * level + random.uniform(-0.05, 0.1)
        elif self.active_fault == 'gradual_drift':
            target_temp = base_temp + thermal_workload + (level * 3.5)
            target_rate = 0.06 * level + random.uniform(-0.03, 0.03)
        elif self.active_fault == 'belt_slip':
            target_temp = base_temp + thermal_workload + (level * 2.0)
            target_rate = 0.04 * level + random.uniform(-0.02, 0.02)
        else: # Normal
            target_temp = base_temp + thermal_workload
            target_rate = random.uniform(-0.04, 0.04)

        # Realistic mechanical thermal dissipation (Newton's law of cooling)
        # Cooling is naturally gradual: a machine doesn't drop 30°C instantly when shut down or self-healed
        cooling_speed = 0.18 if target_temp < self.last_temp else 0.45
        k_thermal = dt * cooling_speed
        temp_c = self.last_temp + (target_temp - self.last_temp) * min(1.0, k_thermal) + random.uniform(-0.15, 0.15)
        # Dynamic dT/dt matches the actual temperature trajectory
        temp_rate = ((temp_c - self.last_temp) / dt) * 60.0
        temp_rate = max(-4.0, min(5.0, temp_rate))
        self.last_temp = temp_c

        # 5. Motor Current (Amperes)
        base_current = 2.4 if self.machine_id == 'PRN-01' else 5.2
        current_workload = workload_ratio * 2.0
        if self.active_fault == 'belt_slip':
            current_fault = level * 2.4 + math.sin(self.tick_count * 0.8) * 1.5 * level
        elif self.active_fault == 'bearing_spall':
            current_fault = level * 2.0
        elif self.active_fault == 'gradual_drift':
            current_fault = level * 1.4
        elif self.active_fault == 'spindle_overheat':
            current_fault = level * 1.0
        else:
            current_fault = 0.0

        motor_current_a = max(0.5, base_current + current_workload + current_fault + random.uniform(-0.15, 0.15))

        # 6. Operating Hours & Service Age (PS 8 Requirement)
        elapsed_hours = (t - SIMULATOR_EPOCH) / 3600.0
        operating_hours = self.base_op_hours + elapsed_hours
        service_age_hrs = self.service_age_hrs + elapsed_hours

        return {
            "machine_id": self.machine_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.", time.gmtime(t)) + f"{int((t % 1)*1000):03d}Z",
            "telemetry": {
                "temperature_c": round(temp_c, 2),
                "temp_rate_c_per_min": round(temp_rate, 2),
                "vibration_rms_mm_s": round(vibration_rms, 3),
                "vibration_crest_factor": round(crest_factor, 2),
                "motor_current_a": round(motor_current_a, 2),
                "spindle_rpm": round(spindle_rpm, 1),
                "rpm_volatility": round(rpm_volatility, 3),
                "workload_pct": round(workload, 1),
                "operating_hours": round(operating_hours, 2),
                "service_age_hrs": round(service_age_hrs, 2)
            },
            "chaos": {
                "active": self.intensity > 0,
                "fault_type": self.active_fault,
                "intensity": int(self.intensity)
            }
        }

class HostHardwareSimulator(MachineSimulator):
    """
    Live Physical Hardware Telemetry Adapter:
    Directly queries Linux kernel hardware sensors (/sys/class/hwmon, /sys/class/power_supply, psutil)
    with industrial EMA low-pass filtering and rolling window derivative calculation to eliminate
    frame-by-frame quantization jitter while faithfully reflecting real thermal dynamics.
    """
    def __init__(self, machine_id="PC-01", name="Acer Nitro Host PC"):
        super().__init__(machine_id, name, "Live Hardware Rig", 312.0, 45.0)
        self.last_time = time.time()
        initial_temp = self.get_real_temperature()
        self.filtered_temp = initial_temp
        self.last_temp = initial_temp
        self.smoothed_workload = 20.0
        self.smoothed_freq = 1200.0
        self.temp_window = deque([(time.time(), initial_temp)], maxlen=60)
        try:
            self.ctx_switches_prev = psutil.cpu_stats().ctx_switches
            self.boot_time = psutil.boot_time()
        except:
            self.ctx_switches_prev = 0
            self.boot_time = time.time() - 3600 * 4

    def get_real_temperature(self) -> float:
        for hw in ["/sys/class/hwmon/hwmon4/temp1_input", "/sys/class/hwmon/hwmon3/temp1_input", "/sys/class/hwmon/hwmon1/temp1_input"]:
            try:
                if os.path.exists(hw):
                    with open(hw, 'r') as f:
                        return int(f.read().strip()) / 1000.0
            except:
                pass
        try:
            temps = psutil.sensors_temperatures()
            for key in ["coretemp", "acpitz", "nvme"]:
                if key in temps and temps[key]:
                    return float(temps[key][0].current)
        except:
            pass
        return 50.0

    def set_fault(self, fault_type: Optional[str], intensity: float):
        # PC-01 is a pure live physical hardware rig.
        # Hardware sensors directly reflect real physical host workload and temperature.
        # Chaos injection is reserved for simulated machine twins (CNC-01, CNC-02, PRN-01).
        self.active_fault = None
        self.intensity = 0.0

    def generate_raw_tick(self, timestamp: Optional[float] = None) -> Dict[str, Any]:
        t = timestamp if timestamp is not None else time.time()
        dt = max(0.01, t - self.last_time)
        self.last_time = t
        self.tick_count += 1

        # 1. Read Raw Physical Sensors
        raw_temp = self.get_real_temperature()
        try:
            raw_workload = psutil.cpu_percent(interval=None)
        except:
            raw_workload = 20.0

        try:
            raw_freq = psutil.cpu_freq().current
        except:
            raw_freq = 1200.0

        try:
            with open('/sys/class/power_supply/BAT1/current_now') as f:
                bat_amps = abs(int(f.read().strip())) / 1000000.0
        except:
            bat_amps = 0.8

        # 2. Industrial EMA Smoothing for Pure Physical Hardware Sensors
        self.smoothed_workload = 0.90 * self.smoothed_workload + 0.10 * raw_workload
        self.smoothed_freq = 0.90 * self.smoothed_freq + 0.10 * raw_freq

        # 100% PURE PHYSICAL HARDWARE TEMPERATURE: Smooths instantaneous silicon diode spikes
        # into natural mechanical thermal inertia (~3-4s rise) so technicians visually observe the Warning state
        self.filtered_temp = 0.94 * self.filtered_temp + 0.06 * raw_temp

        # 3. Rolling Window Rate-of-Change dT/dt (°C / min)
        self.temp_window.append((t, self.filtered_temp))
        oldest_t, oldest_temp = self.temp_window[0]
        dt_window = t - oldest_t
        if dt_window >= 1.2:
            temp_rate = ((self.filtered_temp - oldest_temp) / dt_window) * 60.0
        else:
            temp_rate = 0.0
        temp_rate = max(-1.2, min(2.5, temp_rate))

        # 4. Spindle RPM mapped smoothly from CPU MHz (nominal ~3100 RPM)
        base_rpm = 3100.0 + (self.smoothed_freq - 1200.0) * 0.7

        # 5. Spindle Current (A): nominal 4.5A, scaling with CPU workload and battery power
        motor_current = 3.6 + (self.smoothed_workload / 100.0) * 2.8 + (bat_amps * 0.3)

        # 6. Physical Micro-Jitter & Vibration
        try:
            stats = psutil.cpu_stats()
            ctx_delta = max(0, stats.ctx_switches - self.ctx_switches_prev)
            self.ctx_switches_prev = stats.ctx_switches
            jitter = min(0.03, ctx_delta / 1000000.0)
        except:
            jitter = 0.002

        base_vibration = 1.15 + (self.smoothed_workload / 100.0) * 0.45 + jitter * 1.2
        crest_factor = 2.25 + (self.smoothed_workload / 100.0) * 0.45

        uptime_hrs = (time.time() - self.boot_time) / 3600.0
        service_age_hrs = 45.0 + uptime_hrs

        return {
            "machine_id": self.machine_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%S.", time.gmtime(t)) + f"{int((t % 1)*1000):03d}Z",
            "telemetry": {
                "temperature_c": round(self.filtered_temp, 2),
                "temp_rate_c_per_min": round(temp_rate, 2),
                "vibration_rms_mm_s": round(base_vibration, 3),
                "vibration_crest_factor": round(crest_factor, 2),
                "motor_current_a": round(motor_current, 2),
                "spindle_rpm": round(base_rpm, 1),
                "rpm_volatility": round(jitter, 3),
                "workload_pct": round(self.smoothed_workload, 1),
                "operating_hours": round(uptime_hrs, 2),
                "service_age_hrs": round(service_age_hrs, 2)
            },
            "chaos": {
                "active": self.intensity > 0,
                "fault_type": self.active_fault,
                "intensity": int(self.intensity)
            }
        }

class FleetSimulator:
    def __init__(self):
        self.simulators: Dict[str, MachineSimulator] = {
            "CNC-01": MachineSimulator("CNC-01", "CNC Mill #1", "Spindle Lathe", 1248.5, 320.0),
            "CNC-02": MachineSimulator("CNC-02", "CNC Mill #2", "Heavy Milling", 2816.2, 187.0),
            "PRN-01": MachineSimulator("PRN-01", "Ender-3 Pro", "3D Printer", 684.7, 94.0),
            "PC-01": HostHardwareSimulator("PC-01", "Acer Nitro Host PC")
        }

    def set_fault(self, machine_id: str, fault_type: Optional[str], intensity: float):
        if machine_id in self.simulators:
            self.simulators[machine_id].set_fault(fault_type, intensity)

    def get_machine(self, machine_id: str) -> Optional[MachineSimulator]:
        return self.simulators.get(machine_id)

    def generate_all_raw(self) -> Dict[str, Dict[str, Any]]:
        return {m_id: sim.generate_raw_tick() for m_id, sim in self.simulators.items()}

if __name__ == "__main__":
    fleet = FleetSimulator()
    print("Testing Fleet Simulator generation:")
    raw = fleet.generate_all_raw()
    for m_id, data in raw.items():
        print(f"[{m_id}] Vib: {data['telemetry']['vibration_rms_mm_s']} mm/s, Temp: {data['telemetry']['temperature_c']} C, RPM: {data['telemetry']['spindle_rpm']}")
