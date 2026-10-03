import type { Tick } from '../types';
export function RulCard({ tick }: { tick?: Tick }) {
  const rul = tick?.prognostics?.rul_hours;
  const ci = tick?.prognostics?.rul_ci;
  const trend = tick?.prognostics?.degradation_trend ?? 0;
  return <section className="blk">
    <div className="rul" style={{ border: 0, padding: 0 }}>
      <b className="num">{rul != null ? `${rul} hrs left` : 'Stable'}</b>
      <span>{rul != null ? (ci ? `Likely ${ci[0]} to ${ci[1]} hrs until failure` : 'until predicted failure') : 'No failure predicted'}</span>
      {rul != null && <span>Recent sensor trend: {trend >= 0.65 ? 'rapidly worsening' : trend >= 0.2 ? 'worsening' : 'stable'} ({Math.round(trend * 100)}%)</span>}
    </div>
  </section>;
}
