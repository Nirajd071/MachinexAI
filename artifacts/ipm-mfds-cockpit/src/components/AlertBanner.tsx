import { CheckCircle2, OctagonAlert } from 'lucide-react';
export function AlertBanner({ critical, resolved, fault }: { critical:boolean; resolved:boolean; fault:string|null }) {
  if (critical) return <div role="alert" data-testid="alert-critical" className="critical-pulse flex items-center gap-2 border border-red-500/50 bg-red-500/10 px-3 py-2 text-[10px] text-red-200"><OctagonAlert size={15} className="shrink-0 text-red-400"/><span><strong>CRITICAL: {fault ?? 'Machine fault'}.</strong> Failure imminent. Work order auto-generated.</span></div>;
  if (resolved) return <div role="status" data-testid="alert-resolved" className="flex items-center gap-2 border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-[10px] text-emerald-300"><CheckCircle2 size={14}/> Resolved · machine returned to nominal operation.</div>;
  return null;
}