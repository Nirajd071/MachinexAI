import { Activity, Radio, Volume2, VolumeX, Wifi, WifiOff } from 'lucide-react';
import type { ConnectionState } from '../types';
type Props = { state: ConnectionState; fps: number; mock: boolean; latency: number | null; muted: boolean; onMute: () => void };
export function Header({ state, fps, mock, latency, muted, onMute }: Props) {
  const status = mock ? 'OFFLINE' : state;
  return <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#202b3e] bg-[#0b111e] px-4 py-3 md:px-6">
    <div className="flex items-center gap-3"><div className="grid h-9 w-9 place-items-center rounded border border-sky-400/25 bg-sky-400/10 text-sky-300"><Activity size={18}/></div><div><div className="text-[11px] font-extrabold tracking-[.16em] text-slate-100">IPM-MFDS <span className="text-sky-400">·</span> TECHNICIAN PREDICTIVE COCKPIT</div><div className="mt-1 text-[9px] tracking-[.14em] text-slate-500">LAYER 5 / OPS &amp; ACTUATION <span className="mx-2 text-slate-700">|</span> PREDICTIVE MAINTENANCE</div></div></div>
    <div className="flex items-center gap-2.5">
      {mock && <span data-testid="badge-mock-data" className="rounded border border-amber-500/35 bg-amber-500/10 px-2 py-1 font-mono text-[10px] font-bold tracking-wider text-amber-300">MOCK DATA</span>}
      <span data-testid="status-connection" className={`flex items-center gap-1.5 rounded border px-2.5 py-1.5 font-mono text-[10px] ${status === 'LIVE' ? 'border-emerald-500/30 text-emerald-300' : status === 'OFFLINE' ? 'border-red-500/35 text-red-300' : 'border-amber-500/30 text-amber-300'}`}>
        {status === 'LIVE' ? <><Wifi size={12}/> LIVE · {fps} FPS · WS</> : status === 'STALE' ? <><Radio size={12}/> STALE · NO DATA &gt; 2S</> : status === 'RECONNECTING' ? <><Radio size={12}/> RECONNECTING…</> : <><WifiOff size={12}/> OFFLINE (MOCK MODE)</>}
      </span>
      <span data-testid="text-loop-latency" className={`hidden rounded border px-2 py-1.5 font-mono text-[10px] sm:inline ${latency === null ? 'border-[#263247] text-slate-500' : latency < 400 ? 'border-emerald-500/30 text-emerald-300' : 'border-amber-500/30 text-amber-300'}`}>LAST LOOP: {latency === null ? '—' : `${latency} ms`}</span>
      <button data-testid="button-audio-toggle" aria-label={muted ? 'Unmute critical alert sound' : 'Mute critical alert sound'} onClick={onMute} className="grid h-8 w-8 place-items-center rounded border border-[#263247] text-slate-400 hover:text-sky-300">{muted ? <VolumeX size={15}/> : <Volume2 size={15}/>}</button>
    </div>
  </header>;
}