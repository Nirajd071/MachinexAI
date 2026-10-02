import { useEffect, useState } from 'react';
import { AlertTriangle, RotateCcw, Zap } from 'lucide-react';
import type { FaultType } from '../types';
type Props = { fault: FaultType; setFault: (f: FaultType) => void; intensity: number; setIntensity: (v: number) => void; preset: (f: FaultType | null, v: number) => void; activeFault: FaultType | null };
const faults: { id: FaultType; label: string }[] = [{id:'bearing_spall',label:'Bearing Spall'},{id:'spindle_overheat',label:'Spindle Overheat'},{id:'belt_slip',label:'Belt Slip'},{id:'gradual_drift',label:'Gradual Drift'}];
const label = (id: FaultType | null) => faults.find(f => f.id === id)?.label ?? 'No active fault';
export function ChaosPanel({ fault,setFault,intensity,setIntensity,preset,activeFault }: Props) {
  const [value, setValue] = useState(intensity);
  useEffect(() => setValue(intensity), [intensity]);
  return <section className="panel border border-dashed border-rose-500/50 bg-[linear-gradient(145deg,rgba(239,68,68,.065),transparent_60%)] p-3.5" data-testid="panel-chaos">
    <div className="mb-3 flex items-center justify-between"><div className="flex items-center gap-2 text-[11px] font-extrabold tracking-wide text-slate-100"><Zap size={15} className="text-rose-400"/> LIVE CHAOS FAULT INJECTOR · JUDGE CONTROL</div><AlertTriangle size={14} className="text-rose-400/70"/></div>
    <div className="mb-2 grid grid-cols-2 gap-1 sm:grid-cols-4" role="group" aria-label="Fault type selector">{faults.map(f=><button data-testid={`button-fault-${f.id}`} key={f.id} onClick={()=>setFault(f.id)} aria-pressed={fault===f.id} className={`rounded border px-1.5 py-2 text-[9px] leading-tight transition-colors ${fault===f.id?'border-rose-400/50 bg-rose-400/10 text-rose-200':'border-[#263247] text-slate-500 hover:text-slate-200'}`}>{f.label}</button>)}</div>
    <div className="mb-3 grid grid-cols-2 gap-1 sm:grid-cols-4">
      <button data-testid="button-preset-bearing" onClick={()=>preset('bearing_spall',85)} className="rounded border border-rose-500/30 bg-rose-500/10 px-2 py-2 text-[9px] text-rose-200 hover:bg-rose-500/20">Bearing Spall · 85%</button>
      <button data-testid="button-preset-overheat" onClick={()=>preset('spindle_overheat',90)} className="rounded border border-amber-500/30 bg-amber-500/10 px-2 py-2 text-[9px] text-amber-200 hover:bg-amber-500/20">Spindle Overheat · 90%</button>
      <button data-testid="button-preset-belt" onClick={()=>preset('belt_slip',75)} className="rounded border border-sky-500/30 bg-sky-500/10 px-2 py-2 text-[9px] text-sky-200 hover:bg-sky-500/20">Belt Slip · 75%</button>
      <button data-testid="button-reset-chaos" onClick={()=>{setValue(0);preset(null,0)}} className="flex items-center justify-center gap-1 rounded border border-emerald-500/30 bg-emerald-500/10 px-2 py-2 text-[9px] text-emerald-200 hover:bg-emerald-500/20"><RotateCcw size={11}/> Self-Heal / Reset</button>
    </div>
    <div className="flex items-center justify-between"><label htmlFor="fault-intensity" className="text-[10px] text-slate-400">Fault Intensity</label><output className="mono text-[12px] font-medium text-rose-300" data-testid="text-fault-intensity">{value}%</output></div>
    <input id="fault-intensity" data-testid="slider-fault-intensity" aria-label="Fault Intensity" type="range" min="0" max="100" value={value} onChange={e=>{const n=Number(e.target.value);setValue(n);setIntensity(n)}} className="mt-2 h-2 w-full cursor-pointer accent-rose-500"/>
    <div className="mt-2 flex items-center justify-between text-[9px] text-slate-500"><span>0 · HEALTHY</span><span>100 · MAXIMUM STRESS</span></div>
    <div className="mt-3 border-t border-rose-500/15 pt-2 font-mono text-[10px] text-slate-400" data-testid="text-active-fault">Injecting: <span className="text-rose-300">{intensity > 0 ? `${label(activeFault ?? fault)} @ ${intensity}%` : 'No active fault'}</span></div>
  </section>;
}