import type { FaultType, Machine, Tick } from './types';
const rand = (n: number) => (Math.random() - .5) * n;
const simulatorStartedAt = Date.now();
const faultRamps: Record<string, { fault: FaultType | null; intensity: number; at: number }> = {};
const FAULT_RAMP_PER_SECOND = 30;

export function advanceMockFault(machineId: string, targetFault: FaultType | null, targetIntensity: number, at = Date.now()) {
  const state = faultRamps[machineId] ?? { fault: null, intensity: 0, at };
  const elapsed = Math.min(Math.max(0, (at - state.at) / 1000), 0.25);
  const step = FAULT_RAMP_PER_SECOND * elapsed;
  if (state.fault !== targetFault) {
    state.intensity = Math.max(0, state.intensity - step);
    if (state.intensity === 0) state.fault = targetFault;
  } else {
    const difference = targetIntensity - state.intensity;
    state.intensity = Math.abs(difference) <= step
      ? targetIntensity
      : state.intensity + Math.sign(difference) * step;
  }
  state.at = at;
  faultRamps[machineId] = state;
  return { fault: state.fault, intensity: state.intensity };
}

export function mockTick(machine: Machine, fault: FaultType | null = null, intensity = 0, t = Date.now()): Tick {
  const level = intensity / 100;
  const machineFactor = machine.machine_id === 'PRN-01' ? .62 : machine.machine_id === 'CNC-02' ? 1.12 : 1;
  const baseVibe = machine.machine_id === 'PRN-01' ? 1.4 : machine.machine_id === 'PC-01' ? 1.2 : 2.1;
  const vibrationImpact = fault === 'bearing_spall' ? 7.2 : fault === 'cascading_failure' ? 6.5 : fault === 'gradual_drift' ? 2.8 : fault === 'belt_slip' ? .5 : fault === 'spindle_overheat' ? .8 : 0;
  let vibration = baseVibe + level * vibrationImpact * machineFactor + rand(.18);
  const thermalImpact = fault === 'spindle_overheat' ? 42 : fault === 'cascading_failure' ? 38 : fault === 'bearing_spall' ? 8 : fault === 'gradual_drift' ? 3.5 : fault === 'belt_slip' ? 2 : (fault === 'current_overload' ? 14 : 0);
  let temp = (machine.machine_id === 'PRN-01' ? 48 : machine.machine_id === 'PC-01' ? 52 : 57) + level * thermalImpact + rand(1.2);
  const crestImpact = fault === 'bearing_spall' ? 4 : fault === 'cascading_failure' ? 3.5 : fault === 'gradual_drift' ? 1.5 : fault === 'belt_slip' ? .6 : fault === 'spindle_overheat' ? .4 : 0;
  let crest = 2.7 + level * crestImpact + rand(.25);
  const score = Math.max(9, Math.min(99, 96 - level * (fault === 'cascading_failure' ? 85 : 72) + rand(2.4)));
  const nominalRpm = machine.machine_id === 'PRN-01' ? 0 : machine.machine_id === 'PC-01' ? 3100 : (machine.machine_id === 'CNC-02' ? 3400 : 4950);
  const rpmImpact = (fault === 'belt_slip' || fault === 'cascading_failure') ? (machine.machine_id === 'PC-01' ? 1900 : machine.machine_id === 'CNC-02' ? 750 : 960) : (fault ? 75 : 0);
  const slipJitter = (fault === 'belt_slip' || fault === 'cascading_failure') ? Math.sin(t / 500) * (machine.machine_id === 'PC-01' ? 45 : 65) * level : 0;
  const rpm = machine.machine_id === 'PRN-01' ? 0 : Math.max(200, Math.round(nominalRpm - level * rpmImpact + slipJitter + rand(25)));
  const known: Record<string, string> = {
    bearing_spall: 'Bearing Spall',
    spindle_overheat: 'Spindle Overheat',
    belt_slip: 'Belt Slip / Kinematic Stall',
    gradual_drift: 'Gradual Mechanical Drift',
    current_overload: 'Inverter / Drive Overcurrent Trip',
    cascading_failure: 'Cascading Total Multi-System Failure'
  };
  const contrib = fault === 'bearing_spall'
    ? [['Vibration Crest Factor', .47], ['Vibration RMS', .28], ['Motor Current', .15], ['Temperature', .1]]
    : fault === 'spindle_overheat'
    ? [['Temperature', .49], ['Temperature Rate', .27], ['Motor Current', .14], ['Vibration RMS', .1]]
    : fault === 'current_overload'
    ? [['Motor Current', .52], ['Temperature', .22], ['RPM Volatility', .16], ['Vibration RMS', .10]]
    : fault === 'belt_slip'
    ? [['Spindle RPM', .42], ['Motor Current', .32], ['RPM Volatility', .18], ['Vibration RMS', .08]]
    : fault === 'cascading_failure'
    ? [['Motor Current', .28], ['Temperature', .26], ['Vibration RMS', .24], ['Spindle RPM', .22]]
    : [['Vibration RMS', .36], ['Temperature', .26], ['Motor Current', .22], ['RPM Volatility', .16]];
  const contributors = (level > .02 ? contrib : [['Vibration RMS', .34], ['Temperature', .27], ['Motor Current', .23], ['RPM Volatility', .16]]).map(([sensor, weight]) => ({ sensor: String(sensor), weight: Number(weight) + rand(.025) })).sort((a, b) => b.weight - a.weight);
  const normalized = contributors.map(c => ({ ...c, weight: c.weight / contributors.reduce((s, x) => s + x.weight, 0) }));
  const rul = level > .12 ? Math.max(.4, (fault === 'cascading_failure' ? 18 : 52) - intensity * .56) : null;
  const baseCurrent = machine.machine_id === 'PRN-01' ? 2.4 : machine.machine_id === 'PC-01' ? 4.2 : 5.4;
  const currentSurge = fault === 'current_overload' ? (machine.machine_id === 'PRN-01' ? 2.6 : machine.machine_id === 'PC-01' ? 4.4 : 3.6) : fault === 'cascading_failure' ? (machine.machine_id === 'PRN-01' ? 2.8 : machine.machine_id === 'PC-01' ? 4.4 : 3.8) : fault === 'belt_slip' ? 2.6 : fault === 'bearing_spall' ? 2 : fault === 'gradual_drift' ? 1.4 : fault === 'spindle_overheat' ? 1 : 0;
  const current = baseCurrent + level * currentSurge + rand(.25);
  const volatility = .035 + level * (fault === 'belt_slip' || fault === 'cascading_failure' ? .38 : .015) + Math.random() * .02;
  const feed = Math.max(6, 60 - volatility * 82 + (temp > 70 ? -4 : 0));
  const isPrinter = machine.machine_id === 'PRN-01';
  const isPc = machine.machine_id === 'PC-01';
  const critical = vibration > (isPrinter ? 3.2 : isPc ? 2.5 : 4.5)
    || temp >= (isPrinter ? 70 : isPc ? 82 : 78)
    || current > (isPrinter ? 4.5 : 7.5)
    || (isPrinter ? feed < 40 || volatility > .12 : isPc ? rpm < 1800 : (rpm < nominalRpm * .9 && rpm > 500) || volatility > .08);
  const warning = vibration > (isPrinter ? 2 : isPc ? 1.6 : 2.8)
    || temp >= (isPrinter ? 58 : isPc ? 70 : 68)
    || current > (isPrinter ? 3.4 : isPc ? 5.5 : 6)
    || (isPrinter ? volatility > .05 : isPc ? rpm < 2400 : volatility > .04);
  const status = critical ? 'CRITICAL' : warning ? 'WARNING' : 'NOMINAL';
  return {
    machine_id: machine.machine_id, timestamp: new Date(t).toISOString(),
    telemetry: {
      temperature_c: temp,
      temp_rate_c_per_min: (fault === 'spindle_overheat' || fault === 'cascading_failure' ? 2.8 : fault ? .35 : .04) * level + rand(.16),
      vibration_rms_mm_s: vibration,
      vibration_crest_factor: crest,
      motor_current_a: current,
      spindle_rpm: rpm,
      rpm_volatility: volatility,
      workload_pct: 63 + rand(9),
      operating_hours: machine.operating_hours + Math.max(0, t - simulatorStartedAt) / 3600000,
      service_age_hrs: machine.service_age_hrs
    },
    ai: { anomaly_score: Math.max(2, Math.min(99, level * 96 + rand(4))), failure_probability: Math.min(.99, Math.max(.01, level * .93 + rand(.025))), horizon_hrs: 24 },
    health: { score, status, color: status === 'CRITICAL' ? '#EF4444' : status === 'WARNING' ? '#F59E0B' : '#10B981', iso_zone: vibration > 7 ? 'Zone D (Danger)' : vibration > 4.5 ? 'Zone C (Unsatisfactory)' : vibration > 2.8 ? 'Zone B (Acceptable)' : 'Zone A (Good)' },
    diagnostics: { probable_fault: intensity > 0 ? known[fault ?? ''] ?? null : null, confidence_pct: Math.min(99, 61 + intensity * .37), xai_contributors: normalized },
    prognostics: { rul_hours: rul, rul_ci: rul === null ? null : [Math.max(.1, rul * .77), rul * 1.27] },
    chaos: { active: intensity > 0, fault_type: intensity > 0 ? fault : null, intensity },
  };
}
export function seedTicks(machine: Machine, count = 100): Tick[] {
  const now = Date.now();
  return Array.from({ length: count }, (_, i) => mockTick(machine, null, 0, now - (count - i) * 500));
}
