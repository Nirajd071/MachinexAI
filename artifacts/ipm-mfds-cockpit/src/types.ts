export type HealthStatus = 'NOMINAL' | 'WARNING' | 'CRITICAL';
export type FaultType = 'bearing_spall' | 'spindle_overheat' | 'belt_slip' | 'gradual_drift' | 'current_overload' | 'cascading_failure';
export type Machine = { machine_id: string; name: string; type: string; operating_hours: number; service_age_hrs: number };
export type Contributor = { sensor: string; weight: number };
export type Tick = {
  machine_id: string; timestamp: string;
  telemetry: { temperature_c: number; temp_rate_c_per_min: number; vibration_rms_mm_s: number; vibration_crest_factor: number; motor_current_a: number; spindle_rpm: number; rpm_volatility: number; workload_pct: number; operating_hours: number; service_age_hrs: number };
  ai: { anomaly_score: number; failure_probability: number; horizon_hrs: number };
  health: { score: number; status: HealthStatus; color?: string; iso_zone: string };
  diagnostics: { probable_fault: string | null; confidence_pct: number; xai_contributors: Contributor[] };
  prognostics: { rul_hours: number | null; rul_ci: [number, number] | null; degradation_trend?: number };
  chaos: { active: boolean; fault_type: FaultType | null; intensity: number };
};
export type Maintenance = { date: string; action: string; technician: string; part: string | null };
export type ConnectionState = 'LIVE' | 'RECONNECTING' | 'OFFLINE' | 'STALE';
export type ChaosRequest = { machine_id: string; fault_type: FaultType; intensity: number };
export const MACHINE_SEEDS: Machine[] = [
  { machine_id: 'CNC-01', name: 'CNC Mill #1', type: 'Spindle Lathe', operating_hours: 1248.5, service_age_hrs: 320 },
  { machine_id: 'CNC-02', name: 'CNC Mill #2', type: 'Heavy Milling', operating_hours: 2816.2, service_age_hrs: 187 },
  { machine_id: 'PRN-01', name: 'Ender-3 Pro', type: '3D Printer', operating_hours: 684.7, service_age_hrs: 94 },
  { machine_id: 'PC-01', name: 'Acer Nitro Host PC', type: 'Live Hardware Rig', operating_hours: 312.4, service_age_hrs: 45 },
];
