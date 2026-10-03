import type { Maintenance, Tick } from '../types';

interface MaintenanceTableProps {
  tick?: Tick;
  maintenance?: Maintenance[];
}

export function MaintenanceTable({ tick, maintenance = [] }: MaintenanceTableProps) {
  const serviceAge = Math.round(tick?.telemetry?.service_age_hrs ?? 0);

  return (
    <section className="blk">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <h3>Maintenance and service history</h3>
        <span className="lab num" style={{ fontSize: '11px', fontWeight: 600 }}>
          {serviceAge} hrs since service
        </span>
      </div>

      {maintenance.length === 0 ? (
        <div className="lab">No service records available.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '170px', overflowY: 'auto' }}>
          {maintenance.map((record, index) => {
            const formattedDate = record.date
              ? new Date(record.date).toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })
              : 'N/A';

            return (
              <div
                key={index}
                style={{
                  fontSize: '11.5px',
                  padding: '6px 8px',
                  background: 'var(--side)',
                  border: '1px solid var(--rule)',
                  borderRadius: '3px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                  <b style={{ color: 'var(--ink)' }}>{record.action}</b>
                  <span className="sub num" style={{ fontSize: '10.5px' }}>{formattedDate}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--mut)', fontSize: '10.5px' }}>
                  <span>Tech: {record.technician || 'Staff'}</span>
                  {record.part && <span>Part: {record.part}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}