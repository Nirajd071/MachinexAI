import { BrainCircuit } from 'lucide-react';
import type { Tick } from '../types';
export function XaiPanel({ tick }: { tick?: Tick }) {
  const contributors = [...(tick?.diagnostics?.xai_contributors ?? [])].sort((a,b)=>b.weight-a.weight);
  const fault = tick?.diagnostics?.probable_fault;
  return <section className="panel p-3" data-testid="panel-xai">
    <div className="mb-2 flex items-center justify-between"><span className="panel-title">XAI · Root-Cause Attribution</span><BrainCircuit size={14} className="text-violet-400"/></div>
    <div data-testid="text-diagnosis" className={`mb-3 border-l-2 px-2 py-1.5 text-[10px] leading-relaxed ${fault ? 'border-amber-400 bg-amber-400/5 text-amber-100' : 'border-emerald-500 bg-emerald-500/5 text-emerald-200'}`}>
      {fault ? <>Diagnosed Failure Mode: <strong>{fault}</strong> <span className="text-slate-400">({tick?.diagnostics.confidence_pct.toFixed(1)}% confidence)</span></> : 'No fault detected'}
    </div>
    <div className="space-y-2">{contributors.map((item,index)=>{const color=index===0?'#EF4444':index===1?'#F59E0B':'#38BDF8';return <div key={item.sensor}><div className="mb-1 flex justify-between text-[9px]"><span className="text-slate-400">{item.sensor}</span><span className="mono text-slate-300">{(item.weight*100).toFixed(1)}%</span></div><div className="h-1 overflow-hidden rounded bg-[#1a2637]"><div className="h-full rounded transition-all duration-300" style={{width:`${item.weight*100}%`,background:color}}/></div></div>})}</div>
    {!contributors.length && <div className="py-2 text-[10px] text-slate-600">Waiting for diagnostic attribution…</div>}
  </section>;
}