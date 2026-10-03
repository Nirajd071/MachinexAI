import type { Machine, Tick } from '../types';
type Props = { machines: Machine[]; ticks: Record<string, Tick[]>; selectedId: string; onSelect: (id: string) => void };
const KINDS: Record<string, string> = { 'CNC-01': 'Spindle lathe', 'CNC-02': 'Heavy milling', 'PRN-01': '3D printer', 'PC-01': 'Live hardware rig' };
export function FleetBar({ machines, ticks, selectedId, onSelect }: Props) {
  return <nav className="fleet">
    {machines.map(m => {
      const tick = ticks[m.machine_id]?.at(-1);
      const st = tick?.health?.status || 'NOMINAL';
      const active = selectedId === m.machine_id;
      return <button key={m.machine_id} className={`tab${active ? ' on' : ''}`} onClick={() => onSelect(m.machine_id)}>
        <span className="tr">
          <b className="tab-dot" data-s={st} />
          <span className="tn">{m.name}</span>
          <span className="th num">{tick ? Math.round(tick.health.score) : '--'}</span>
        </span>
        <span className="tk">{KINDS[m.machine_id] || m.type}, health score</span>
        <span className="tm num">{tick ? `${(tick.telemetry.operating_hours || 0).toLocaleString(undefined, { maximumFractionDigits: 1 })} hrs, ${Math.round(tick.telemetry.service_age_hrs || 0)} hrs since service` : ''}</span>
      </button>;
    })}
  </nav>;
}