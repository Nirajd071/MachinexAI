import { ClipboardList } from 'lucide-react';
import type { Maintenance, Tick } from '../types';
function relative(date: string) {
  const delta = Math.max(0, Date.now() - Date.parse(date)); const days = Math.floor(delta / 86400000);
  if (days < 1) return 'Today'; if (days === 1) return '1 day ago'; if (days < 30) return `${days} days ago`; const months = Math.floor(days / 30); return `${months} month${months === 1 ? '' : 's'} ago`;
}
export function MaintenanceTable({ rows, tick }: { rows: Maintenance[]; tick?: Tick }) {
  return <section className="panel p-3" data-testid="panel-maintenance">
    <div className="mb-2 flex items-center justify-between"><span className="panel-title">Maintenance &amp; Service History</span><ClipboardList size={14} className="text-sky-400"/></div>
    <div className="mb-2 flex justify-between border-y border-[#202b3e] py-1.5 text-[9px]"><span className="text-slate-500">Service age summary</span><span className="mono text-slate-300">{tick?.telemetry.service_age_hrs.toFixed(0) ?? '—'} hrs since service</span></div>
    {rows.length ? <div className="thin-scroll max-h-[138px] overflow-auto"><table className="w-full text-left text-[9px]"><thead className="sticky top-0 bg-[#0d1322] text-[8px] tracking-wider text-slate-600"><tr><th className="py-1 font-medium">WHEN</th><th className="py-1 font-medium">ACTION / PART</th><th className="py-1 font-medium">TECH</th></tr></thead><tbody>{rows.map((row,i)=><tr key={`${row.date}-${i}`} data-testid={`row-maintenance-${i}`} className="border-t border-[#1c2739]"><td className="whitespace-nowrap py-2 pr-2 font-mono text-slate-500">{relative(row.date)}</td><td className="py-2 pr-2"><div className="text-slate-300">{row.action}</div><div className="mt-0.5 text-slate-600">{row.part ?? 'No part recorded'}</div></td><td className="whitespace-nowrap py-2 text-slate-500">{row.technician}</td></tr>)}</tbody></table></div> : <div className="py-4 text-center text-[10px] text-slate-600">No service records available.</div>}
  </section>;
}