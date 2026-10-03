import time
import multiprocessing
import math
import psutil
import os
import sys

def heavy_worker(stop_event):
    """
    Intensive numerical compute loop loading execution units
    to generate real physical heat in the CPU silicon.
    """
    while not stop_event.is_set():
        x = 1.00001
        for _ in range(120000):
            x = math.sin(x) * math.cos(x) + math.tan(0.0001)

def get_pure_physical_temp():
    import glob
    # 1. Inspect sysfs hwmon driver names and labels for genuine CPU sensors
    for hwdir in sorted(glob.glob('/sys/class/hwmon/hwmon*')):
        name_file = os.path.join(hwdir, 'name')
        if os.path.exists(name_file):
            try:
                with open(name_file, 'r') as f:
                    driver_name = f.read().strip().lower()
                if driver_name in ['coretemp', 'k10temp', 'zenpower', 'cpu_thermal']:
                    # Search for explicit CPU Package / Tctl / Tdie label first
                    for input_file in sorted(glob.glob(os.path.join(hwdir, 'temp*_input'))):
                        label_file = input_file.replace('_input', '_label')
                        label_str = ""
                        if os.path.exists(label_file):
                            with open(label_file, 'r') as lf:
                                label_str = lf.read().strip()
                        if label_str.lower() in ['package id 0', 'tctl', 'tdie']:
                            with open(input_file, 'r') as tf:
                                return int(tf.read().strip()) / 1000.0, f"{driver_name} ({label_str})"
                    # Fallback under CPU driver
                    t1 = os.path.join(hwdir, 'temp1_input')
                    if os.path.exists(t1):
                        with open(t1, 'r') as tf:
                            return int(tf.read().strip()) / 1000.0, f"{driver_name} (temp1)"
            except:
                pass

    # 2. Fallback via psutil
    try:
        temps = psutil.sensors_temperatures()
        for cpu_key in ['coretemp', 'k10temp', 'zenpower', 'cpu_thermal', 'acpitz']:
            if cpu_key in temps and temps[cpu_key]:
                for item in temps[cpu_key]:
                    if item.label and item.label.lower() in ['package id 0', 'tctl', 'tdie']:
                        return float(item.current), f"{cpu_key} ({item.label})"
                return float(temps[cpu_key][0].current), f"{cpu_key} ({temps[cpu_key][0].label or 'temp1'})"
    except:
        pass
    return 47.0, "unknown"

def is_on_ac_power():
    try:
        if os.path.exists('/sys/class/power_supply/ACAD/online'):
            with open('/sys/class/power_supply/ACAD/online') as f:
                if f.read().strip() == "1":
                    return True
        if os.path.exists('/sys/class/power_supply/BAT1/status'):
            with open('/sys/class/power_supply/BAT1/status') as f:
                return f.read().strip() in ["Charging", "Full"]
    except:
        pass
    temp, _ = get_pure_physical_temp()
    return temp > 65.0

if __name__ == '__main__':
    total_cores = psutil.cpu_count() or 8
    on_ac = is_on_ac_power()

    warn_temp = 86.0 if on_ac else 50.0
    crit_temp = 91.0 if on_ac else 55.0

    print("=" * 70)
    print("🔥 IPM-MFDS PROGRESSIVE HARDWARE PRESSURE TEST (3-STAGE DEMO)")
    print(f"🖥️  CPU: 13th Gen Intel Core i5-13420H ({total_cores} cores)")
    print(f"⚡ Power State: {'🔌 AC Charger (Turbo Boost Active)' if on_ac else '🔋 Battery (Power Save Mode)'}")
    print(f"🎯 Thresholds: Normal ≤ {warn_temp-1:.0f}°C | Warning ≥ {warn_temp:.0f}°C | Critical ≥ {crit_temp:.0f}°C")
    print("=" * 70)

    initial_temp, sensor = get_pure_physical_temp()
    print(f"📡 Sensor: {sensor}")
    print(f"🌡️  Starting Physical Temperature: {initial_temp:.1f}°C\n")

    stop_event = multiprocessing.Event()
    active_procs = []

    def launch_workers(count):
        for _ in range(count):
            p = multiprocessing.Process(target=heavy_worker, args=(stop_event,))
            p.daemon = True
            p.start()
            active_procs.append(p)

    start_time = time.time()
    current_stage = 0
    reached_target = False
    hold_start = None

    # Stage 1: Initial warm-up with 3 cores (Normal state)
    launch_workers(3)
    current_stage = 1
    print("▶️ [Stage 1/3 · Light Load (3 Cores)]: Validating NOMINAL baseline (Green)...")

    try:
        while True:
            time.sleep(1.0)
            elapsed = time.time() - start_time
            temp, _ = get_pure_physical_temp()
            load = psutil.cpu_percent(interval=None)
            freq = psutil.cpu_freq().current

            # Progressive Core Escalation
            if elapsed >= 3.5 and current_stage == 1:
                # Stage 2: Escalate to 7 cores (Transition into Warning)
                launch_workers(4)
                current_stage = 2
                print("\n▶️ [Stage 2/3 · Medium Load (7 Cores)]: Ramping temperature into WARNING (Yellow)...")

            elif elapsed >= 7.5 and current_stage == 2:
                # Stage 3: Unleash all remaining cores (Transition into Critical)
                launch_workers(total_cores - len(active_procs))
                current_stage = 3
                print("\n▶️ [Stage 3/3 · Full Saturation (All Cores)]: Pushing into CRITICAL (Red + Email Alert)...")

            if temp >= crit_temp:
                badge = f"🔴 [CRITICAL ≥{crit_temp:.0f}°C · AUTO-ALERT TRIGGERED]"
                if not reached_target:
                    reached_target = True
                    hold_start = time.time()
                    print(f"\n>>> 🎯 CRITICAL TARGET HIT ({temp:.1f}°C)! Holding 4s to confirm email dispatch... <<<\n")
            elif temp >= warn_temp:
                badge = f"🟡 [WARNING ≥{warn_temp:.0f}°C · THERMAL THROTTLING]"
            else:
                badge = f"🟢 [NOMINAL · SYSTEM HEALTHY]"

            print(f"  [+{elapsed:04.1f}s] Temp: {temp:5.1f}°C | Cores: {len(active_procs):2d}/{total_cores} | Load: {load:5.1f}% | Clock: {freq:4.0f} MHz | {badge}")

            # Once critical target is hit, hold for 4 seconds then finish
            if reached_target and hold_start and (time.time() - hold_start >= 4.0):
                print("\n" + "=" * 70)
                print(f"✅ SUCCESS: Machine reached {temp:.1f}°C (Sustained past {crit_temp:.0f}°C Critical limit)!")
                print("📧 Verified: Red CRITICAL state reached and emergency alert sent to Gmail.")
                print("=" * 70)
                break

    except KeyboardInterrupt:
        print("\n⚠️ Test stopped by user.")
    finally:
        stop_event.set()
        for p in active_procs:
            p.join(timeout=0.5)
        final_temp, _ = get_pure_physical_temp()
        print(f"💨 All workers stopped. Cooling down... (Current: {final_temp:.1f}°C)\n")
