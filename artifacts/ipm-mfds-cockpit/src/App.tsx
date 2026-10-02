import { useEffect, useRef, useState } from 'react';
import { Activity, Clock3, Cpu } from 'lucide-react';
import { Toaster, toast } from 'sonner';
import { useCockpit } from './hooks/useCockpit';
import { Header } from './components/Header';
import { FleetBar } from './components/FleetBar';
import { ChaosPanel } from './components/ChaosPanel';
import { HealthGauge } from './components/HealthGauge';
import { AiScores } from './components/AiScores';
import { RulCard } from './components/RulCard';
import { TelemetryCharts } from './components/TelemetryCharts';
import { XaiPanel } from './components/XaiPanel';
import { MaintenanceTable } from './components/MaintenanceTable';
import { ActionPanel } from './components/ActionPanel';
import { AlertBanner } from './components/AlertBanner';
import type { HealthStatus } from './types';

function playAlert() {
  try {
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    [880, 587].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, context.currentTime + index * 0.22);
      gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + index * 0.22 + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + index * 0.22 + 0.19);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(context.currentTime + index * 0.22);
      oscillator.stop(context.currentTime + index * 0.22 + 0.2);
    });
    window.setTimeout(() => void context.close(), 700);
  } catch { /* Audio is optional; the visual alert remains authoritative. */ }
}

function Home() {
  const cockpit = useCockpit();
  const { machines, selectedId, chooseMachine, selected, tick, history, buffers, maintenance, mockMode, socket, fault, setFault, intensity, setSlider, preset, latency } = cockpit;
  const { loadError, retry } = cockpit;
  const [muted, setMuted] = useState(false);
  const [resolved, setResolved] = useState(false);
  const previousStatus = useRef<HealthStatus | null>(null);
  const previousMachine = useRef(selectedId);
  const status = tick?.health.status ?? 'NOMINAL';
  const critical = status === 'CRITICAL';
  useEffect(() => {
    const prev = previousStatus.current;
    if (previousMachine.current !== selectedId) {
      previousMachine.current = selectedId;
      previousStatus.current = status;
      setResolved(false);
      return undefined;
    }
    if (prev !== null && prev !== 'CRITICAL' && status === 'CRITICAL') {
      setResolved(false);
      if (!muted) playAlert();
      toast.error('Critical machine condition detected.');
    }
    if (prev !== null && prev !== 'NOMINAL' && status === 'NOMINAL') {
      setResolved(true);
      toast.success('Resolved · machine returned to nominal operation.');
      const id = window.setTimeout(() => setResolved(false), 5000);
      previousStatus.current = status;
      return () => window.clearTimeout(id);
    }
    previousStatus.current = status;
    return undefined;
  }, [status, muted, selectedId]);

  return <div className="grid-bg min-h-[100dvh]">
    <Header state={socket.state} fps={socket.fps} mock={mockMode} latency={latency} muted={muted} onMute={() => setMuted(value => !value)}/>
    <main className="mx-auto max-w-[1920px] px-3 pb-6 pt-3 md:px-5 lg:px-6">
      <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><span className="panel-title">FLEET OVERVIEW</span><span className="h-px w-8 bg-[#27354a]"/></div><div className="mono flex items-center gap-2 text-[9px] text-slate-600"><Clock3 size={11}/> {new Date().toLocaleDateString(undefined,{weekday:'short',month:'short',day:'2-digit'})} <span className="text-slate-700">/</span> MULTI-MACHINE TELEMETRY</div></div>
      <FleetBar machines={machines} ticks={buffers} selectedId={selectedId} onSelect={chooseMachine}/>
      {machines.length === 0 && (loadError ? <div role="alert" data-testid="alert-gateway-error" className="panel mt-2 flex flex-wrap items-center justify-between gap-3 border-amber-500/25 p-4 text-[10px] text-amber-200"><span>Gateway fleet data unavailable: {loadError}</span><button data-testid="button-retry-gateway" onClick={retry} className="rounded border border-amber-500/30 px-3 py-1.5 text-amber-200 hover:bg-amber-500/10">Retry connection</button></div> : <div className="panel mt-2 animate-pulse p-4 text-[10px] text-slate-500">Hydrating machine fleet from gateway…</div>)}
      <div className="mt-3 grid grid-cols-1 items-start gap-3 xl:grid-cols-[minmax(265px,0.94fr)_minmax(405px,1.38fr)_minmax(275px,0.98fr)]">
        <div className="space-y-2.5">
          <ChaosPanel fault={fault} setFault={setFault} intensity={intensity} setIntensity={setSlider} preset={preset} activeFault={tick?.chaos?.fault_type ?? null}/>
          <HealthGauge tick={tick}/>
          <AiScores history={history} tick={tick}/>
          <RulCard tick={tick}/>
        </div>
        <div className="min-w-0">
          <div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><Activity size={13} className="text-sky-400"/><span className="panel-title">LIVE MULTI-TRACE TELEMETRY</span></div><div className="flex items-center gap-1.5 font-mono text-[9px] text-slate-600"><span className={`status-dot ${critical?'critical':'nominal'}`}/>{selected?.machine_id ?? selectedId} · 60 SEC</div></div>
          <TelemetryCharts history={history} tick={tick}/>
        </div>
        <div className="space-y-2.5">
          <AlertBanner critical={critical} resolved={resolved} fault={tick?.diagnostics?.probable_fault ?? null}/>
          <XaiPanel tick={tick}/>
          <MaintenanceTable rows={maintenance} tick={tick}/>
          {selected && <ActionPanel machineId={selected.machine_id} status={status} critical={critical} mock={mockMode} tick={tick}/>}
          <div className="flex items-center gap-2 px-1 pt-0.5 text-[9px] text-slate-600"><Cpu size={11}/> {mockMode?'Local physics simulator · 20 Hz':'FastAPI telemetry gateway'} <span className="ml-auto mono">{history.length} samples</span></div>
        </div>
      </div>
    </main>
    <Toaster theme="dark" position="bottom-right" toastOptions={{style:{background:'#111a2a',border:'1px solid #29374c',color:'#dce5f1'}}}/>
  </div>;
}

function App() { return <Home/>; }
export default App;
