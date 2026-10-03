import { useEffect, useState } from 'react';
import type { FaultType } from '../types';

type Props = {
  machineId?: string;
  fault: FaultType;
  setFault: (f: FaultType) => void;
  intensity: number;
  setIntensity: (v: number) => void;
  preset: (f: FaultType | null, v: number) => void;
  activeFault: FaultType | null;
};

interface FaultTriggerDef {
  id: FaultType;
  graphTag: string;
  label: string;
  graphName: string;
  defIntensity: number;
  isAll?: boolean;
}

function getMachineTriggers(machineId?: string): FaultTriggerDef[] {
  const isPrinter = machineId === 'PRN-01';
  const isPc = machineId === 'PC-01';

  if (isPrinter) {
    return [
      { id: 'bearing_spall', graphTag: 'G1', graphName: 'Gantry Dynamics', label: 'Gantry Resonance', defIntensity: 85 },
      { id: 'spindle_overheat', graphTag: 'G2', graphName: 'Hotend Thermal', label: 'Thermal Runaway', defIntensity: 90 },
      { id: 'current_overload', graphTag: 'G3', graphName: '24V Current', label: '24V Stepper Surge', defIntensity: 85 },
      { id: 'belt_slip', graphTag: 'G4', graphName: 'Extruder Feed', label: 'Extruder Clog / Slip', defIntensity: 80 },
      { id: 'cascading_failure', graphTag: 'ALL 4', graphName: 'Total Failure', label: '⚡ Trigger All 4 Graphs', defIntensity: 90, isAll: true },
    ];
  }

  if (isPc) {
    return [
      { id: 'bearing_spall', graphTag: 'G1', graphName: 'Chassis Resonance', label: 'Fan Imbalance', defIntensity: 85 },
      { id: 'spindle_overheat', graphTag: 'G2', graphName: 'Core Thermal', label: 'Thermal Throttle', defIntensity: 90 },
      { id: 'current_overload', graphTag: 'G3', graphName: '12V Power', label: 'VRM Power Surge', defIntensity: 85 },
      { id: 'belt_slip', graphTag: 'G4', graphName: 'Fan Tachometer', label: 'Fan Motor Stall', defIntensity: 80 },
      { id: 'cascading_failure', graphTag: 'ALL 4', graphName: 'Total Failure', label: '⚡ Trigger All 4 Graphs', defIntensity: 90, isAll: true },
    ];
  }

  // CNC-01 & CNC-02
  return [
    { id: 'bearing_spall', graphTag: 'G1', graphName: 'Vibration RMS', label: 'Bearing Spall', defIntensity: 85 },
    { id: 'spindle_overheat', graphTag: 'G2', graphName: 'Spindle Temp', label: 'Spindle Overheat', defIntensity: 90 },
    { id: 'current_overload', graphTag: 'G3', graphName: 'Inverter Current', label: 'Overcurrent Trip', defIntensity: 85 },
    { id: 'belt_slip', graphTag: 'G4', graphName: 'Kinematic RPM', label: 'Belt Slip / Stall', defIntensity: 80 },
    { id: 'cascading_failure', graphTag: 'ALL 4', graphName: 'Total Failure', label: '⚡ Trigger All 4 Graphs', defIntensity: 90, isAll: true },
  ];
}

export function ChaosPanel({ machineId, fault, setFault, intensity, setIntensity, preset, activeFault }: Props) {
  const [value, setValue] = useState(intensity);
  useEffect(() => setValue(intensity), [intensity]);
  const isLiveHardware = machineId === 'PC-01';
  const triggers = getMachineTriggers(machineId);

  const activeDef = triggers.find(t => t.id === (activeFault ?? fault));

  return (
    <section className="blk fa">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <h3 style={{ margin: 0 }}>Chaos Fault Injector</h3>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            background: isLiveHardware ? 'rgba(37, 99, 235, 0.12)' : 'rgba(22, 25, 28, 0.08)',
            color: isLiveHardware ? '#1D4ED8' : 'var(--ink)',
            borderRadius: '2px',
            letterSpacing: '0.4px',
          }}
        >
          {isLiveHardware ? 'HARDWARE OVERLAY' : 'PHYSICS TWIN'}
        </span>
      </div>

      <div className="fs">
        {triggers.map((f) => (
          <button
            key={f.id}
            className={`fb${intensity > 0 && f.id === (activeFault ?? fault) ? ' on' : ''}${f.isAll ? ' fb-all' : ''}`}
            onClick={() => {
              setFault(f.id);
              preset(f.id, f.defIntensity);
            }}
            title={`Triggers ${f.graphName}`}
          >
            <span className="fb-tag">{f.graphTag}</span>
            <span className="fb-lbl">{f.label}</span>
          </button>
        ))}
      </div>

      <div className="sl" style={{ marginTop: '10px' }}>
        <input
          type="range"
          min="0"
          max="100"
          value={value}
          aria-label="Fault intensity"
          onChange={(e) => {
            const n = +e.target.value;
            setValue(n);
            setIntensity(n);
          }}
        />
        <b className="num" style={{ minWidth: 44, textAlign: 'right' }}>
          {value}%
        </b>
      </div>

      <div className="scl">
        <span>0 Healthy</span>
        <span>100 Maximum Trip</span>
      </div>

      <div className="cap" style={{ marginTop: '4px', fontSize: '12px' }}>
        {intensity > 0 && activeDef ? (
          <span>
            Active: <b style={{ color: activeDef.isAll ? '#D32F2F' : 'var(--ink)' }}>[{activeDef.graphTag}] {activeDef.label}</b> at {intensity}%
          </span>
        ) : (
          <span>No fault active · All 4 channels nominal</span>
        )}
      </div>

      <button
        className="fb rs"
        style={{ marginTop: '8px', width: '100%', justifyContent: 'center' }}
        onClick={() => {
          setValue(0);
          preset(null, 0);
        }}
      >
        Self-Heal / Clear All Faults
      </button>
    </section>
  );
}