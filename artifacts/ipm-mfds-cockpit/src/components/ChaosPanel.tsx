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

const FAULTS: { id: FaultType; label: string }[] = [
  { id: 'bearing_spall', label: 'Bearing spall' },
  { id: 'spindle_overheat', label: 'Overheat' },
  { id: 'belt_slip', label: 'Belt slip' },
  { id: 'gradual_drift', label: 'Gradual drift' },
];

const NAMES: Record<string, string> = {
  bearing_spall: 'Bearing spall',
  spindle_overheat: 'Spindle overheat',
  belt_slip: 'Belt slip',
  gradual_drift: 'Gradual drift',
};

const DEF: Record<string, number> = {
  bearing_spall: 85,
  spindle_overheat: 90,
  belt_slip: 75,
  gradual_drift: 50,
};

export function ChaosPanel({ machineId, fault, setFault, intensity, setIntensity, preset, activeFault }: Props) {
  const [value, setValue] = useState(intensity);
  useEffect(() => setValue(intensity), [intensity]);
  const isLiveHardware = machineId === 'PC-01';

  if (isLiveHardware) {
    return (
      <section className="blk fa">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <h3>Live hardware telemetry</h3>
          <span style={{ fontSize: '11px', fontWeight: 700, padding: '2px 6px', background: '#2E9E4F', color: '#fff', borderRadius: '2px' }}>REAL-TIME</span>
        </div>
        <div className="cap" style={{ color: 'var(--ink)', fontSize: '13px', lineHeight: 1.4 }}>
          Monitoring host hardware sensors (Linux kernel <code>/sys/class/hwmon</code> & <code>psutil</code>).
        </div>
        <div style={{ fontSize: '12px', color: 'var(--mut)', padding: '6px 8px', background: 'rgba(22,25,28,0.04)', borderRadius: '3px', border: '1px solid var(--rule)' }}>
          Chaos fault injection is reserved for simulated twins (<b>CNC-01</b>, <b>CNC-02</b>, <b>PRN-01</b>). Switch machines above to test fault scenarios.
        </div>
      </section>
    );
  }

  return (
    <section className="blk fa">
      <h3>Live chaos fault injector</h3>
      <div className="fs">
        {FAULTS.map((f) => (
          <button
            key={f.id}
            className={`fb${intensity > 0 && f.id === fault ? ' on' : ''}`}
            onClick={() => {
              setFault(f.id);
              preset(f.id, DEF[f.id]);
            }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="sl">
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
        <span>0 healthy</span>
        <span>100 maximum stress</span>
      </div>
      <div className="cap">
        Injecting: {intensity > 0 ? `${NAMES[activeFault ?? fault]} at ${intensity}%` : 'no active fault'}
      </div>
      <button
        className="fb rs"
        onClick={() => {
          setValue(0);
          preset(null, 0);
        }}
      >
        Self-heal / reset
      </button>
    </section>
  );
}