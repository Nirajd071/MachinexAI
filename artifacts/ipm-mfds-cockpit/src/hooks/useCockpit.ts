import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getHistory, getMachines, getMaintenance, injectChaos, signOffWorkOrder, USE_MOCK } from '../api';
import { advanceMockFault, mockTick, seedTicks } from '../mockEngine';
import { MACHINE_SEEDS as MACHINE_FALLBACK } from '../types';
import type { FaultType, Machine, Maintenance, Tick } from '../types';
import { useTelemetrySocket } from './useTelemetrySocket';
import { toast } from 'sonner';
const MAX = 1200;
export function useCockpit() {
  const [machines, setMachines] = useState<Machine[]>(MACHINE_FALLBACK);
  const [selectedId, setSelectedId] = useState(() => new URLSearchParams(window.location.search).get('machine') || 'CNC-01');
  const [buffers, setBuffers] = useState<Record<string, Tick[]>>({});
  const [maintenance, setMaintenance] = useState<Maintenance[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [mockMode, setMockMode] = useState(USE_MOCK);
  const [fault, setFault] = useState<FaultType>('bearing_spall');
  const [intensity, setIntensity] = useState(0);
  const [latency, setLatency] = useState<number | null>(null);
  const pendingLoop = useRef<Record<string, { started: number; intensity: number }>>({});
  const faultRef = useRef<Record<string, { fault: FaultType | null; intensity: number }>>({});
  const patchTimer = useRef<number | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  const lastRenderedAt = useRef(0);
  const liveBuffer = useRef<Record<string, Tick[]>>({});
  const handleTick = useCallback((tick: Tick) => {
    const list = liveBuffer.current[tick.machine_id] ?? [];
    liveBuffer.current[tick.machine_id] = [...list.slice(-(MAX - 1)), tick];
    const pending = pendingLoop.current[tick.machine_id];
    if (pending && (tick.chaos?.intensity === pending.intensity)) {
      setLatency(Date.now() - pending.started); delete pendingLoop.current[tick.machine_id];
    }
    if (!frameRef.current && Date.now() - lastRenderedAt.current >= 100) frameRef.current = requestAnimationFrame(() => {
      setBuffers({ ...liveBuffer.current }); lastRenderedAt.current = Date.now(); frameRef.current = undefined;
    });
  }, []);
  const socket = useTelemetrySocket(!mockMode, handleTick);
  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoadError(null);
      if (mockMode) {
        setMachines(MACHINE_FALLBACK);
        const initial: Record<string, Tick[]> = {};
        MACHINE_FALLBACK.forEach(m => { initial[m.machine_id] = seedTicks(m); });
        liveBuffer.current = initial; setBuffers(initial); return;
      }
      try {
        const list = await getMachines();
        if (!active) return;
        setMachines(list);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'request failed';
        liveBuffer.current = {};
        setBuffers({});
        setLoadError(message);
        toast.error(`Gateway unavailable: ${message}`);
      }
    };
    void load(); return () => { active = false; };
  }, [mockMode, reloadKey]);
  useEffect(() => {
    if (mockMode || !selectedId) return;
    let active = true;
    void getHistory(selectedId, 1000).then(history => {
      if (!active || history.length === 0) return;
      const arrived = liveBuffer.current[selectedId] ?? [];
      const merged = [...history, ...arrived]
        .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
        .slice(-MAX);
      liveBuffer.current[selectedId] = merged;
      setBuffers(current => ({ ...current, [selectedId]: merged }));
    }).catch(() => {
      // Keep rendering any live ticks already received if history is unavailable.
    });
    return () => { active = false; };
  }, [selectedId, mockMode]);
  useEffect(() => {
    if (!mockMode || !machines.length) return;
    const id = window.setInterval(() => {
      machines.forEach(machine => {
        const setting = faultRef.current[machine.machine_id] ?? { fault: null, intensity: 0 };
        const effective = advanceMockFault(machine.machine_id, setting.fault, setting.intensity);
        handleTick(mockTick(machine, effective.fault, effective.intensity));
      });
    }, 50);
    return () => window.clearInterval(id);
  }, [mockMode, machines, handleTick]);
  useEffect(() => {
    if (mockMode) return;
    if (socket.state === 'LIVE') return;
    const advisory = window.setTimeout(() => {
      if (socket.state !== 'LIVE') {
        toast.info('Connecting to live gateway (ws://localhost:8000)...');
      }
    }, 5000);
    return () => window.clearTimeout(advisory);
  }, [mockMode, socket.state]);
  useEffect(() => {
    if (mockMode) { setMaintenance([{ date: new Date(Date.now() - 12 * 86400000).toISOString(), action: 'Spindle inspection & lubrication', technician: 'M. Alvarez', part: 'SKF 6205-2RSH bearing' }, { date: new Date(Date.now() - 44 * 86400000).toISOString(), action: 'Coolant filtration service', technician: 'J. Chen', part: 'Coolant filter cartridge' }]); return; }
    let active = true; getMaintenance(selectedId).then(rows => { if (active) setMaintenance(rows); }).catch(() => setMaintenance([]));
    return () => { active = false; };
  }, [selectedId, mockMode]);
  const selected = machines.find(m => m.machine_id === selectedId) ?? machines[0];
  const tick = buffers[selectedId]?.at(-1);
  const history = buffers[selectedId] ?? [];
  const issue = useCallback((id: string, type: FaultType, value: number) => {
    faultRef.current[id] = { fault: value === 0 ? null : type, intensity: value };
    pendingLoop.current[id] = { started: Date.now(), intensity: value };
    if (mockMode) return Promise.resolve();
    return injectChaos({ machine_id: id, fault_type: type, intensity: value }).catch(error => { toast.error('Fault injection failed; control reverted.'); throw error; });
  }, [mockMode]);
  const setSlider = (value: number) => {
    setIntensity(value);
    window.clearTimeout(patchTimer.current);
    patchTimer.current = window.setTimeout(() => { if (selected) void issue(selected.machine_id, fault, value).catch(() => setIntensity(tick?.chaos?.intensity ?? 0)); }, 150);
  };
  const preset = (type: FaultType | null, value: number) => {
    const chosen = type ?? fault; setFault(chosen); setIntensity(value);
    if (selected) void issue(selected.machine_id, chosen, value).catch(() => setIntensity(tick?.chaos?.intensity ?? 0));
  };
  const chooseMachine = (id: string) => { setSelectedId(id); setIntensity(faultRef.current[id]?.intensity ?? 0); };
  const renderedHistory = useMemo(() => history.filter(item => Date.now() - Date.parse(item.timestamp) <= 60000), [history]);

  const signOff = useCallback(async (technician: string, notes: string, part: string) => {
    if (mockMode) {
      const newRecord: Maintenance = {
        date: new Date().toISOString(),
        action: notes,
        technician,
        part
      };
      setMaintenance(curr => [newRecord, ...curr]);
      preset(null, 0);
      return;
    }
    await signOffWorkOrder({
      machine_id: selectedId,
      technician,
      notes,
      part_replaced: part
    });
    setIntensity(0);
    preset(null, 0);
    try {
      const updated = await getMaintenance(selectedId);
      setMaintenance(updated);
    } catch {
      // Keep existing records if refresh fails
    }
  }, [mockMode, selectedId, preset]);

  return { machines, selectedId, chooseMachine, selected, tick, history: renderedHistory, buffers, maintenance, mockMode, setMockMode, socket, fault, setFault, intensity, setSlider, preset, latency, loadError, retry: () => setReloadKey(key => key + 1), signOff };
}
