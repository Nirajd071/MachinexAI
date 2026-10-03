import type { Tick } from '../types';

export function RulCard({
  tick,
  history = [],
  mockMode = false
}: {
  tick?: Tick;
  history?: Tick[];
  mockMode?: boolean;
}) {
  const tl = tick?.telemetry;
  const rul = tick?.prognostics?.rul_hours;
  const ci = tick?.prognostics?.rul_ci;
  const trend = tick?.prognostics?.degradation_trend ?? 0;

  const rp = history.slice(-100).map(t => t.telemetry?.spindle_rpm ?? 0);
  const mu = rp.reduce((a, b) => a + b, 0) / (rp.length || 1);
  const cv = mu ? Math.sqrt(rp.reduce((a, b) => a + (b - mu) ** 2, 0) / rp.length) / mu : 0;

  return (
    <section className="blk rul-section">
      <div className="rul" style={{ border: 0, padding: 0 }}>
        <b className="num">{rul != null ? `${rul} hrs left` : 'Stable'}</b>
        <span>{rul != null ? (ci ? `Likely ${ci[0]} to ${ci[1]} hrs until failure` : 'until predicted failure') : 'No failure predicted'}</span>
        {rul != null && (
          <span style={{ marginTop: '2px', display: 'block' }}>
            Sensor trend: {trend >= 0.65 ? 'rapidly worsening' : trend >= 0.2 ? 'worsening' : 'stable'} ({Math.round(trend * 100)}%)
          </span>
        )}
      </div>

      {/* Operational Metrics arranged vertically */}
      <div className="v-metrics">
        <div className="v-metric-item">
          <div className="v-metric-row">
            <span>Workload ratio</span>
            <b className="num">{(tl?.workload_pct ?? 0).toFixed(1)}%</b>
          </div>
          <div className="mt">
            <i style={{ background: 'var(--ink)', width: `${tl?.workload_pct ?? 0}%` }} />
          </div>
        </div>

        <div className="v-metric-item">
          <div className="v-metric-row">
            <span>Operating hours</span>
            <b className="num">{(tl?.operating_hours ?? 0).toFixed(1)} hrs</b>
          </div>
        </div>

        <div className="v-metric-item">
          <div className="v-metric-row">
            <span>Service age</span>
            <b className="num">{Math.round(tl?.service_age_hrs ?? 0)} hrs</b>
          </div>
        </div>

        <div className="v-metric-item">
          <div className="v-metric-row">
            <span>{tick?.machine_id === 'PRN-01' ? 'Feed volatility' : 'Speed volatility'}</span>
            <b className="num">{(tick?.machine_id === 'PRN-01' ? (tl?.rpm_volatility ?? 0) : (cv || (tl?.rpm_volatility ?? 0))).toFixed(3)}</b>
          </div>
        </div>

        <div className="v-metric-foot">
          {mockMode ? 'Simulated gateway' : 'Gateway localhost:8000'} · {history.length} samples
        </div>
      </div>
    </section>
  );
}

