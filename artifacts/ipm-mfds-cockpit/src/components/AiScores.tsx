import type { Tick } from '../types';
function Spark({ values, color }: { values: number[]; color: string }) {
  const points = values.slice(-40).map((v,i)=>`${i*100/39},${30-Math.min(30,Math.max(0,v))/1}`).join(' ');
  return <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="mt-2 h-7 w-full"><polyline points={points} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke"/></svg>;
}
export function AiScores({ history, tick }: { history: Tick[]; tick?: Tick }) {
  const latest = tick?.ai;
  return <section className="grid grid-cols-2 gap-2" aria-label="Dual track AI scores">
    {[
      { title:'TRACK A · ANOMALY SCORE', subtitle:'Isolation Forest · novelty', value:latest?.anomaly_score ?? 0, color:'#38BDF8', get:(t:Tick)=>t.ai.anomaly_score },
      { title:'TRACK B · FAILURE PROBABILITY', subtitle:'P(failure in N hrs) · classifier', value:(latest?.failure_probability ?? 0)*100, color:'#8B5CF6', get:(t:Tick)=>t.ai.failure_probability*100 },
    ].map(item=><div className="panel p-3" key={item.title}><div className="panel-title text-[9px]">{item.title}</div><div className="mt-2 flex items-end justify-between"><strong className="mono text-[24px] font-medium leading-none" style={{color:item.color}}>{item.value.toFixed(1)}<small className="ml-1 text-[11px]">%</small></strong><span className="max-w-[96px] text-right text-[8px] leading-tight text-slate-600">{item.subtitle}</span></div><div className="mt-2 h-1 overflow-hidden rounded bg-[#1a2638]"><div className="h-full rounded" style={{width:`${item.value}%`,background:item.color}}/></div><Spark values={history.map(item.get)} color={item.color}/></div>)}
  </section>;
}