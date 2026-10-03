import { useEffect, useRef } from 'react';
import type { Tick } from '../types';
const WORD: Record<string, string> = { NOMINAL: 'Healthy', WARNING: 'Warning', CRITICAL: 'Critical' };

export function HealthGauge({ tick }: { tick?: Tick }) {
  const scoreRef = useRef(100);
  const elRef = useRef<HTMLDivElement>(null);
  const status = tick?.health?.status ?? 'NOMINAL';
  const target = tick?.health?.score ?? 100;
  const vib = tick?.telemetry?.vibration_rms_mm_s ?? 0;
  const zone = vib <= 1.8 ? 'A (Good)' : vib <= 4.5 ? 'B (Satisfactory)' : vib <= 7.1 ? 'C (Unsatisfactory)' : 'D (Unacceptable)';

  useEffect(() => {
    let raf: number;
    const step = () => {
      scoreRef.current += (target - scoreRef.current) * 0.12;
      if (elRef.current) elRef.current.textContent = String(Math.round(scoreRef.current));
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  const dg = tick?.diagnostics;
  return <section className="blk">
    <div className="lab">Health score, EWMA risk engine</div>
    <div className="hd">
      <div className="score num" ref={elRef}>{Math.round(target)}</div>
      <div className="st">
        <span className="pill">{WORD[status]}</span>
        <div className="dx">{dg?.probable_fault ? `${dg.probable_fault} detected, ${dg.confidence_pct}% confidence` : 'All systems operating normally'}</div>
      </div>
    </div>
    <div className="zone">ISO 10816-3, Zone {zone}</div>
  </section>;
}