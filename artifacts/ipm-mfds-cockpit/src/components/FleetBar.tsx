import { Activity, Printer, Wrench } from 'lucide-react';
import type { Machine, Tick } from '../types';
type Props = { machines: Machine[]; ticks: Record<string, Tick[]>; selectedId: string; onSelect: (id: string) => void };
const color = (s?: string) => s === 'CRITICAL' ? 'critical' : s === 'WARNING' ? 'warning' : 'nominal';
export function FleetBar({ machines, ticks, selectedId, onSelect }: Props) {
  return <section aria-label="Machine fleet" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
    {machines.map(m => { const tick = ticks[m.machine_id]?.at(-1); const c = color(tick?.health.status); const active = selectedId === m.machine_id; return <button key={m.machine_id} data-testid={`card-machine-${m.machine_id}`} onClick={() => onSelect(m.machine_id)} aria-pressed={active} className={`panel flex min-h-[86px] items-center gap-3 px-3 py-2.5 text-left transition-colors ${active ? 'border-sky-400/60 shadow-[0_0_18px_rgba(56,189,248,.1)]' : 'hover:border-[#43536b]'} ${c === 'critical' ? 'critical-pulse' : ''}`}>
      <div className={`grid h-9 w-9 shrink-0 place-items-center rounded border ${m.machine_id === 'PRN-01' ? 'border-violet-400/20 bg-violet-400/10 text-violet-300' : 'border-sky-400/20 bg-sky-400/10 text-sky-300'}`}>{m.machine_id === 'PRN-01' ? <Printer size={17}/> : <Wrench size={17}/>}</div>
      <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-2"><strong className="truncate text-[12px] text-slate-100">{m.name}</strong><span className={`flex items-center gap-1.5 font-mono text-[9px] ${`status-${c}`}`}><i className={`status-dot ${c}`}/>{tick?.health.status ?? 'STARTING'}</span></div><div className="mt-1 text-[10px] text-slate-500">{m.type} <span className="px-1 text-slate-700">/</span> <span className="mono text-slate-300">{tick?.health.score.toFixed(0) ?? '—'}</span> health</div><div className="mt-1 flex gap-3 text-[9px] text-slate-500"><span className="mono">{(tick?.telemetry.operating_hours ?? m.operating_hours).toLocaleString(undefined,{maximumFractionDigits:1})} hrs</span><span className="mono">{(tick?.telemetry.service_age_hrs ?? m.service_age_hrs).toFixed(0)} hrs since service</span></div></div>
      <Activity size={13} className={active ? 'text-sky-400' : 'text-slate-700'}/>
    </button>; })}
  </section>;
}