import type { Tick } from '../types';
export function RulCard({ tick }: { tick?: Tick }) {
  const rul = tick?.prognostics?.rul_hours;
  const ci = tick?.prognostics?.rul_ci;
  return <section className="blk">
    <div className="rul" style={{ border: 0, padding: 0 }}>
      <b className="num">{rul != null ? `${rul} hrs left` : 'Stable'}</b>
      <span>{rul != null ? (ci ? `Likely ${ci[0]} to ${ci[1]} hrs until failure` : 'until predicted failure') : 'No failure predicted'}</span>
    </div>
  </section>;
}