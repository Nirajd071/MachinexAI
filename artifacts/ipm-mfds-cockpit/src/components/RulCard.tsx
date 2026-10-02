import { Hourglass } from 'lucide-react';
import type { Tick } from '../types';
export function RulCard({ tick }: { tick?: Tick }) {
  const value = tick?.prognostics?.rul_hours; const ci = tick?.prognostics?.rul_ci;
  return <section className="panel p-3" data-testid="panel-rul"><div className="flex items-center justify-between"><span className="panel-title">Remaining Useful Life</span><Hourglass size={13} className="text-violet-400"/></div>
    {value == null ? <div className="mt-3 flex items-center gap-2 text-[13px] text-emerald-300" data-testid="text-rul-empty"><span className="status-dot nominal"/>No failure predicted</div> : <><div className="mt-2 flex items-baseline gap-2"><strong data-testid="text-rul-hours" className="mono text-[27px] font-medium text-slate-100">{value.toFixed(1)}</strong><span className="text-[11px] text-slate-400">hrs remaining</span></div><div className="mt-1 font-mono text-[10px] text-slate-500">CI: {ci?.[0]?.toFixed(1) ?? '—'} – {ci?.[1]?.toFixed(1) ?? '—'} hrs</div><div className="mt-3 h-1 overflow-hidden rounded bg-[#1b2637]"><div className="h-full bg-violet-400" style={{width:`${Math.min(100,100-value/48*100)}%`}}/></div></>}
  </section>;
}