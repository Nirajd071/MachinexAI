import { useEffect, useRef, useState } from 'react';
import { useCockpit } from './hooks/useCockpit';
import { Header } from './components/Header';
import { FleetBar } from './components/FleetBar';
import { ChaosPanel } from './components/ChaosPanel';
import { HealthGauge } from './components/HealthGauge';
import { AiScores } from './components/AiScores';
import { RulCard } from './components/RulCard';
import { TelemetryCharts } from './components/TelemetryCharts';
import { XaiPanel } from './components/XaiPanel';
import { ThreeDigitalTwin } from './components/ThreeDigitalTwin';
import { MaintenanceTable } from './components/MaintenanceTable';
import { ActionPanel } from './components/ActionPanel';
import { AlertBanner } from './components/AlertBanner';
import type { HealthStatus } from './types';

function playAlert() {
  try {
    const ctx = new AudioContext();
    [880, 660].forEach((f, k) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.connect(g); g.connect(ctx.destination);
      const s = ctx.currentTime + k * .25;
      g.gain.setValueAtTime(.15, s);
      g.gain.exponentialRampToValueAtTime(.001, s + .22);
      o.start(s); o.stop(s + .25);
    });
  } catch {}
}

function Home() {
  const cockpit = useCockpit();
  const { machines, selectedId, chooseMachine, selected, tick, history, buffers, maintenance, mockMode, setMockMode, socket, fault, setFault, intensity, setSlider, preset, latency, signOff, loadError, retry } = cockpit;
  const [muted, setMuted] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const prevStatus = useRef<HealthStatus | null>(null);
  const prevMachine = useRef(selectedId);
  const status = tick?.health.status ?? 'NOMINAL';
  const critical = status === 'CRITICAL';
  const warning = status === 'WARNING';

  const notify = (msg: string) => {
    setToastMsg(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToastMsg(null), 2500);
  };

  useEffect(() => {
    document.body.setAttribute('data-s', status);
    const prev = prevStatus.current;
    if (prevMachine.current !== selectedId) { prevMachine.current = selectedId; prevStatus.current = status; return; }
    if (prev && prev !== 'CRITICAL' && status === 'CRITICAL' && !muted) playAlert();
    prevStatus.current = status;
  }, [status, muted, selectedId]);

  const tl = tick?.telemetry;
  const buf = history;
  const rp = buf.slice(-100).map(t => t.telemetry?.spindle_rpm ?? 0);
  const mu = rp.reduce((a, b) => a + b, 0) / (rp.length || 1);
  const cv = mu ? Math.sqrt(rp.reduce((a, b) => a + (b - mu) ** 2, 0) / rp.length) / mu : 0;

  return <div className="app">
    <Header state={socket.state} fps={socket.fps} mock={mockMode} latency={latency} muted={muted}
      onMute={() => setMuted(v => !v)} autoRotate={autoRotate} onToggleRotate={() => setAutoRotate(v => !v)} />

    {loadError && <div className="gateway-error" role="alert">
      Live gateway unavailable: {loadError}. Telemetry was cleared. <button onClick={retry}>Retry</button>
    </div>}

    <FleetBar machines={machines} ticks={buffers} selectedId={selectedId} onSelect={chooseMachine} />

    {/* LEFT COLUMN */}
    <aside className="col L">
      <ChaosPanel machineId={selected?.machine_id ?? selectedId} fault={fault} setFault={setFault} intensity={intensity} setIntensity={setSlider}
        preset={preset} activeFault={tick?.chaos?.fault_type ?? null} />
      <HealthGauge tick={tick} />
      <AiScores history={history} tick={tick} />
      <RulCard tick={tick} />
    </aside>

    {/* CENTER */}
    <div className="mid">
      <main className="stage">
        <ThreeDigitalTwin machineId={selected?.machine_id ?? selectedId} tick={tick} autoRotate={autoRotate} />
        <AlertBanner critical={critical} warning={warning} fault={tick?.diagnostics?.probable_fault ?? null} />
        <div className="hint">Drag to rotate, scroll to zoom</div>
      </main>
      <TelemetryCharts history={history} tick={tick} />
      <div className="metrics">
        <div>Workload ratio<b className="num">{(tl?.workload_pct ?? 0).toFixed(1)}%</b>
          <div className="mt"><i style={{ background: 'var(--ink)', width: `${tl?.workload_pct ?? 0}%` }} /></div></div>
        <div>Operating hours<b className="num">{(tl?.operating_hours ?? 0).toFixed(1)} hrs</b></div>
        <div>Service age<b className="num">{Math.round(tl?.service_age_hrs ?? 0)} hrs</b></div>
        <div>RPM volatility<b className="num">{cv.toFixed(3)}</b></div>
        <div>{mockMode ? 'Simulated telemetry gateway' : `Gateway localhost:8000`}, {buf.length} samples</div>
      </div>
    </div>

    {/* RIGHT COLUMN */}
    <aside className="col R">
      <section className="blk">
        <div className="sg">
          {[
            { id: 'vib', l: 'Vibration mm/s', v: tl?.vibration_rms_mm_s, d: 2 },
            { id: 'tmp', l: 'Temperature °C', v: tl?.temperature_c, d: 1 },
            { id: 'cur', l: 'Motor current A', v: tl?.motor_current_a, d: 2 },
            { id: 'rpm', l: 'Spindle speed rpm', v: tl?.spindle_rpm, d: 0 },
          ].map(s => <div key={s.id}><b className="num">{(s.v ?? 0).toFixed(s.d)}</b><span>{s.l}</span></div>)}
        </div>
      </section>
      <XaiPanel tick={tick} />
      <MaintenanceTable tick={tick} />
      <ActionPanel machineId={selected?.machine_id ?? selectedId} status={status} critical={critical}
        mock={mockMode} tick={tick} onSignOff={signOff} onNotify={notify} />
    </aside>

    {/* INDUSTRIAL FLOATING TOAST */}
    <div id="toast" className={toastMsg ? 'show' : ''} role="status">{toastMsg}</div>
  </div>;
}

export default function App() { return <Home />; }
