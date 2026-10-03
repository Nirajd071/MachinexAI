import type { ConnectionState } from '../types';
type Props = { state: ConnectionState; fps: number; mock: boolean; latency: number | null; muted: boolean; onMute: () => void; autoRotate?: boolean; onToggleRotate?: () => void };
export function Header({ state, fps, mock, latency, muted, onMute, autoRotate, onToggleRotate }: Props) {
  const dt = new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: '2-digit' });
  const connText = mock ? 'Simulated data' : state === 'LIVE' ? `Live · ${fps} updates/s` : state === 'STALE' ? 'Signal lost' : 'Reconnecting…';
  return <header className="top">
    <div className="brand">
      <img src="/machinexai-emblem.png" alt="MachinexAI Emblem" className="brand-logo" />
      <div className="brand-text">
        <div className="brand-main">
          <b>MachinexAI</b>
        </div>
        <span className="brand-sub">Intelligent Predictive Maintenance · Technician Cockpit</span>
      </div>
    </div>
    <div className="right">
      <span className="chip">{dt}</span>
      <span className="chip num">{connText}</span>
      <span className="chip num" style={latency ? { color: latency < 400 ? '#047857' : '#B45309' } : {}}>
        Last loop: {latency ? `${latency} ms` : 'none yet'}
      </span>
      {onToggleRotate && <button className="chip" onClick={onToggleRotate}>{autoRotate ? 'Auto-rotate on' : 'Auto-rotate off'}</button>}
      <button className="chip" onClick={onMute}>{muted ? 'Sound off' : 'Sound on'}</button>
    </div>
  </header>;
}