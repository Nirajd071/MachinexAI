import type { FaultType, Machine, Tick } from './types';
const rand = (n: number) => (Math.random() - .5) * n;
const simulatorStartedAt = Date.now();
export function mockTick(machine: Machine, fault: FaultType | null = null, intensity = 0, t = Date.now()): Tick {
  const level = intensity / 100;
  const machineFactor = machine.machine_id === 'PRN-01' ? .62 : machine.machine_id === 'CNC-02' ? 1.12 : 1;
  const baseVibe = machine.machine_id === 'PRN-01' ? 1.4 : 2.1;
  let vibration = baseVibe + level * 7 * machineFactor + rand(.18);
  let temp = (machine.machine_id === 'PRN-01' ? 48 : 57) + level * 28 + rand(1.2);
  let crest = 2.7 + level * 3.8 + rand(.25);
  if (fault === 'spindle_overheat') temp += level * 10;
  if (fault === 'belt_slip') vibration *= .74;
  const score = Math.max(9, Math.min(99, 96 - level * 72 + rand(2.4)));
  const status = intensity >= 78 ? 'CRITICAL' : intensity >= 38 ? 'WARNING' : 'NOMINAL';
  const rpm = machine.machine_id === 'PRN-01' ? 0 : (machine.machine_id === 'CNC-02' ? 3200 : 4800) - level * 480 + rand(40);
  const known: Record<string, string> = { bearing_spall: 'Bearing Spall', spindle_overheat: 'Spindle Overheat', belt_slip: 'Belt Slip', gradual_drift: 'Gradual Drift' };
  const contrib = fault === 'bearing_spall' ? [['Vibration Crest Factor', .47], ['Vibration RMS', .28], ['Motor Current', .15], ['Temperature', .1]] : fault === 'spindle_overheat' ? [['Temperature', .49], ['Temperature Rate', .27], ['Motor Current', .14], ['Vibration RMS', .1]] : fault === 'belt_slip' ? [['RPM Volatility', .42], ['Motor Current', .3], ['Vibration RMS', .18], ['Temperature', .1]] : [['Vibration RMS', .36], ['Temperature', .26], ['Motor Current', .22], ['RPM Volatility', .16]];
  const contributors = (level > .02 ? contrib : [['Vibration RMS', .34], ['Temperature', .27], ['Motor Current', .23], ['RPM Volatility', .16]]).map(([sensor, weight]) => ({ sensor: String(sensor), weight: Number(weight) + rand(.025) })).sort((a, b) => b.weight - a.weight);
  const normalized = contributors.map(c => ({ ...c, weight: c.weight / contributors.reduce((s, x) => s + x.weight, 0) }));
  const rul = level > .12 ? Math.max(.4, 52 - intensity * .56) : null;
  return {
    machine_id: machine.machine_id, timestamp: new Date(t).toISOString(),
    telemetry: { temperature_c: temp, temp_rate_c_per_min: (fault === 'spindle_overheat' ? 1.8 : .14) * level + rand(.16), vibration_rms_mm_s: vibration, vibration_crest_factor: crest, motor_current_a: 5.4 + level * 2.4 + rand(.3), spindle_rpm: rpm, rpm_volatility: .035 + level * .18 + Math.random() * .02, workload_pct: 63 + rand(9), operating_hours: machine.operating_hours + Math.max(0, t - simulatorStartedAt) / 3600000, service_age_hrs: machine.service_age_hrs },
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