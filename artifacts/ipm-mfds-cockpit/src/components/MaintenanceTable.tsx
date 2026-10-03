import type { Tick } from '../types';
export function MaintenanceTable({ tick }: { tick?: Tick }) {
  return <section className="blk">
    <h3>Maintenance and service history</h3>
    <div className="lab num">{Math.round(tick?.telemetry?.service_age_hrs ?? 0)} hrs since service</div>
    <div className="lab">No service records available.</div>
  </section>;
}