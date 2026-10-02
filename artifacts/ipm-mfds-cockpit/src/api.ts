import type { ChaosRequest, Machine, Maintenance, Tick } from './types';
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
export const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8000/ws/telemetry/live';
export const USE_MOCK = import.meta.env.VITE_USE_MOCK !== 'false';
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (!response.ok) throw new Error(`Gateway ${response.status}: ${response.statusText}`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export const getMachines = () => request<Machine[]>('/machines');
export const getHistory = (machineId: string, limit = 1000) => request<Tick[]>(`/history?machine_id=${encodeURIComponent(machineId)}&limit=${limit}`);
export const getMaintenance = (machineId: string) => request<Maintenance[]>(`/maintenance?machine_id=${encodeURIComponent(machineId)}`);
export const injectChaos = (body: ChaosRequest) => request<unknown>('/chaos/inject', { method: 'PATCH', body: JSON.stringify(body) });
export async function downloadWorkOrder(machineId: string): Promise<Blob> {
  const response = await fetch(`${API_URL}/work-order/pdf?machine_id=${encodeURIComponent(machineId)}`);
  if (!response.ok) throw new Error(`PDF request failed (${response.status})`);
  return response.blob();
}

function pdfText(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').replace(/[^\x20-\x7e]/g, '?').replace(/[\\()]/g, '\\$&');
}

export function createMockWorkOrder(machineId: string, tick: Tick | undefined): Blob {
  const fault = tick?.diagnostics?.probable_fault ?? 'Predictive inspection';
  const sparePart = fault.toLowerCase().includes('bearing')
    ? 'SKF 6205-2RSH bearing'
    : fault.toLowerCase().includes('overheat')
      ? 'Spindle thermal protection assembly'
      : fault.toLowerCase().includes('belt')
        ? 'Drive belt assembly'
        : 'Spindle alignment coupling';
  const contributors = [...(tick?.diagnostics?.xai_contributors ?? [])]
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 4)
    .map(item => `${item.sensor}: ${(item.weight * 100).toFixed(1)}%`);
  const lines = [
    'IPM-MFDS  |  AUTOMATED MAINTENANCE WORK ORDER',
    `Machine: ${machineId}`,
    `Generated: ${new Date().toISOString()}`,
    `Health: ${tick?.health?.status ?? 'WARNING'}  |  Score: ${tick?.health?.score ?? '--'}`,
    `ISO 10816-3: ${tick?.health?.iso_zone ?? 'Inspection required'}`,
    `Diagnosed failure mode: ${fault}`,
    `Confidence: ${tick?.diagnostics?.confidence_pct?.toFixed(1) ?? '--'}%`,
    'Sensor proof:',
    ...(contributors.length ? contributors : ['Sensor attribution pending']),
    `Recommended spare part: ${sparePart}`,
    'Prescribed maintenance SOP:',
    '1. Isolate machine power and apply lockout/tagout.',
    '2. Verify vibration and thermal readings against ISO 10816-3.',
    `3. Inspect ${sparePart.toLowerCase()} and replace if wear is confirmed.`,
    '4. Reassemble, clear the injected fault, and run a supervised test cycle.',
    '5. Record the inspection and verify nominal telemetry before release.',
  ];
  const content = [
    'BT',
    '/F1 12 Tf',
    '50 748 Td',
    ...lines.flatMap((line, index) => [
      ...(index === 0 ? [] : ['0 -30 Td']),
      `(${pdfText(line)}) Tj`,
    ]),
    'ET',
  ].join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return new Blob([pdf], { type: 'application/pdf' });
}