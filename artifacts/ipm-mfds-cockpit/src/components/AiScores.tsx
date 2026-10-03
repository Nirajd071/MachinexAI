import { useMemo } from 'react';
import type { Tick } from '../types';

function pathOf(v: number[], w: number, h: number): string {
  if (v.length < 2) return '';
  return v.map((q, i) => {
    const x = (i / (v.length - 1)) * w;
    const y = h - Math.min(1, Math.max(0, q)) * (h - 6) - 3;
    return (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }).join('');
}

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const d = useMemo(() => pathOf(values.slice(-60), 300, 28), [values]);
  return <svg className="spk" viewBox="0 0 300 28" preserveAspectRatio="none">
    <path d={d} fill="none" stroke={color} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function AiScores({ history, tick }: { history: Tick[]; tick?: Tick }) {
  const ai = tick?.ai;
  const anomaly = ai?.anomaly_score ?? 0;
  const fp = (ai?.failure_probability ?? 0) * 100;
  const anomalyHistory = useMemo(() => history.map(t => (t.ai?.anomaly_score ?? 0) / 100), [history]);
  const fpHistory = useMemo(() => history.map(t => t.ai?.failure_probability ?? 0), [history]);

  return <section className="blk">
    <div className="two">
      <div>
        <div className="row">
          <span>Anomaly score<span className="sub">Isolation Forest, novelty</span></span>
          <b className="num">{Math.round(anomaly)}</b>
        </div>
        <div className="mt"><i style={{ background: '#16191C', width: `${anomaly}%` }} /></div>
        <Sparkline values={anomalyHistory} color="#16191C" />
      </div>
      <div>
        <div className="row">
          <span>Failure risk<span className="sub">Failure probability classifier</span></span>
          <b className="num">{fp.toFixed(0)}%</b>
        </div>
        <div className="mt"><i style={{ background: 'var(--sc)', width: `${fp}%` }} /></div>
        <Sparkline values={fpHistory} color="var(--sc)" />
      </div>
    </div>
  </section>;
}