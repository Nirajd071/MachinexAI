import { useEffect, useState } from 'react';
import { CheckCircle2, OctagonAlert, TriangleAlert } from 'lucide-react';
import type { Tick } from '../types';
const palette = { NOMINAL: '#10B981', WARNING: '#F59E0B', CRITICAL: '#EF4444' };
export function HealthGauge({ tick }: { tick?: Tick }) {
  const [score, setScore] = useState(100);
  useEffect(()=>{if(tick) setScore(tick.health.score)},[tick?.health.score]);
  const status = tick?.health.status ?? 'NOMINAL'; const color = palette[status]; const angle = Math.PI - (score / 100) * Math.PI;
  const x = 100 + 72 * Math.cos(angle); const y = 93 - 72 * Math.sin(angle);
  const Icon = status === 'CRITICAL' ? OctagonAlert : status === 'WARNING' ? TriangleAlert : CheckCircle2;
  return <section className="panel px-3.5 py-3" data-testid="panel-health">
    <div className="mb-1 flex items-center justify-between"><span className="panel-title">Core Health</span><span className="text-[9px] text-slate-600">RISK ENGINE · EWMA</span></div>
    <div className="relative mx-auto h-[118px] max-w-[250px]">
      <svg viewBox="0 0 200 112" className="h-full w-full" role="img" aria-label={`Health ${Math.round(score)} out of 100, ${status}`}>
        <path d="M 28 94 A 72 72 0 0 1 172 94" fill="none" stroke="#1d293b" strokeWidth="12" strokeLinecap="round"/>
        <path d={`M 28 94 A 72 72 0 0 1 ${x} ${y}`} fill="none" stroke={color} strokeWidth="12" strokeLinecap="round" style={{transition:'all 500ms ease'}}/>
        <text x="100" y="76" textAnchor="middle" fill="#e5edf7" fontFamily="DM Mono" fontSize="35" fontWeight="500">{Math.round(score)}</text>
        <text x="100" y="96" textAnchor="middle" fill="#78889f" fontFamily="DM Mono" fontSize="9">HEALTH SCORE</text>
      </svg>
    </div>
    <div className="flex items-center justify-center gap-2"><Icon size={14} style={{color}}/><span data-testid="status-machine-health" className="font-mono text-[11px] font-bold tracking-wider" style={{color}}>{status}</span></div>
    <div className="mt-2 text-center"><span data-testid="text-iso-zone" className="rounded border border-[#29374c] bg-[#111b2c] px-2 py-1 font-mono text-[9px] text-slate-400">ISO 10816-3 · {tick?.health.iso_zone ?? 'Zone A (Good)'}</span></div>
  </section>;
}