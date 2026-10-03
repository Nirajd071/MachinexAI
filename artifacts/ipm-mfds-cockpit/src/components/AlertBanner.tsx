export function AlertBanner({ critical, warning, fault }: { critical: boolean; warning: boolean; fault: string | null }) {
  const show = critical || warning;
  return <div className={`alert-bar${critical ? ' on' : warning ? ' on warn' : ''}`}>
    {critical ? `Critical: ${fault || 'fault detected'}. Work order ready.` : warning ? `Warning: ${fault || 'anomaly detected'}` : ''}
  </div>;
}