import { useState } from 'react';
import { Download, FileText, LoaderCircle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { createMockWorkOrder, downloadWorkOrder } from '../api';
import type { HealthStatus, Tick } from '../types';
type Props = { machineId:string; status:HealthStatus; critical:boolean; mock:boolean; tick:Tick|undefined };
export function ActionPanel({machineId,status,critical,mock,tick}:Props) {
  const [loading,setLoading]=useState(false); const enabled=status!=='NOMINAL';
  const handleDownload=async()=>{
    if(!enabled||loading)return; setLoading(true);
    try {
      const blob=mock ? createMockWorkOrder(machineId,tick) : await downloadWorkOrder(machineId); const url=URL.createObjectURL(blob); const link=document.createElement('a'); const stamp=new Date().toISOString().replace(/[:.]/g,'-');
      link.href=url;link.download=`WO_${machineId}_${stamp}.pdf`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1000);toast.success(mock?'Demo work-order PDF downloaded.':'Work-order PDF downloaded.');
    } catch(error) { toast.error(error instanceof Error?error.message:'Work-order PDF download failed.'); } finally {setLoading(false);}
  };
  return <section className="panel p-3" data-testid="panel-action"><div className="mb-2 flex items-center justify-between"><span className="panel-title">Emergency Action · Work Order</span><ShieldAlert size={14} className={enabled?'text-rose-400':'text-slate-600'}/></div>
    <button data-testid="button-download-work-order" aria-label="Download work-order PDF" aria-disabled={!enabled} title={enabled?'Download the machine work-order PDF':'Available when health status is WARNING or CRITICAL'} onClick={handleDownload} disabled={!enabled||loading} className={`flex w-full items-center justify-center gap-2 rounded border px-3 py-2.5 text-[10px] font-extrabold tracking-wide transition ${critical?'critical-pulse border-red-500/50 bg-red-500/10 text-red-200 hover:bg-red-500/20':status==='WARNING'?'border-amber-500/40 bg-amber-500/10 text-amber-200 hover:bg-amber-500/15':'cursor-not-allowed border-[#253147] bg-[#111827] text-slate-600'}`}>
      {loading?<LoaderCircle size={14} className="animate-spin"/>:<Download size={14}/>} DOWNLOAD WORK-ORDER PDF
    </button>
    {!enabled && <div className="mt-1 text-center text-[8px] text-slate-600">Available when health status is WARNING or CRITICAL</div>}
    <div className="mt-2 flex gap-2 text-[9px] leading-relaxed text-slate-500"><FileText size={13} className="mt-0.5 shrink-0 text-slate-600"/><span>ISO 10816 violation stamp · exact spare part (SKF 6205-2RSH bearing) · failure root cause with sensor proof · prescribed maintenance SOP steps.</span></div>
  </section>;
}