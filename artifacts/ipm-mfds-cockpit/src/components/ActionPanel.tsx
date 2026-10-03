import { useState } from 'react';
import type { HealthStatus, Tick } from '../types';
import { API_URL } from '../api';

type Props = {
  machineId: string;
  status: HealthStatus;
  critical: boolean;
  mock: boolean;
  tick?: Tick;
  onSignOff: (tech: string, notes: string, part: string) => void;
  onNotify?: (msg: string) => void;
};

export function ActionPanel({ machineId, status, critical, mock, tick, onSignOff, onNotify }: Props) {
  const [showModal, setShowModal] = useState(false);
  const [tech, setTech] = useState('');
  const [notes, setNotes] = useState('');
  const [part, setPart] = useState('');
  const disabled = status === 'NOMINAL';

  const notify = (msg: string) => {
    if (onNotify) onNotify(msg);
  };

  async function downloadWO() {
    try {
      const r = await fetch(`${API_URL}/work-order/pdf?machine_id=${machineId}`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const b = await r.blob(), a = document.createElement('a');
      a.href = URL.createObjectURL(b);
      a.download = `WO_${machineId}_${Date.now()}.pdf`;
      a.click();
      notify('Work order PDF downloaded.');
    } catch {
      notify('Work-order download failed.');
    }
  }

  async function alertAdmin() {
    try {
      const r = await fetch(`${API_URL}/alert/admin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ machine_id: machineId })
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const result = await r.json() as { status?: string; preview_url?: string; is_test_account?: boolean };
      if (result.status !== 'success') throw new Error('Alert delivery is not configured.');
      notify(result.is_test_account ? 'Test alert sent. Check the gateway logs for its preview URL.' : 'Admin emergency email dispatched.');
    } catch {
      notify('Admin alert failed.');
    }
  }

  function submitSignOff() {
    if (!tech.trim()) return;
    onSignOff(tech, notes, part);
    notify(`Digital sign-off saved for ${machineId}.`);
    setShowModal(false);
    setTech(''); setNotes(''); setPart('');
  }

  return <>
    <section className="blk">
      <h3>Closed-loop maintenance action</h3>
      <button className="act pri" disabled={disabled} onClick={downloadWO}>Download work order</button>
      <button className="act" disabled={disabled} onClick={() => setShowModal(true)}>Digital sign-off</button>
      <button className="act" disabled={disabled} onClick={alertAdmin}>Alert admin by configured channels</button>
      <div className="lab">Available when health status is warning or critical.</div>
    </section>

    {showModal && <div className="modal-overlay" onClick={() => setShowModal(false)}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
          <img src="/machinexai-emblem.png" alt="MachinexAI Emblem" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
          <div>
            <h3 style={{ margin: 0, lineHeight: 1.2 }}>Digital Sign-Off — {machineId}</h3>
            <span style={{ fontSize: '11.5px', color: 'var(--mut)', fontWeight: 600 }}>MachinexAI Verified Maintenance Ledger</span>
          </div>
        </div>
        <label>Technician name *</label>
        <input value={tech} onChange={e => setTech(e.target.value)} placeholder="e.g. Lead Tech" autoFocus />
        <label>Part replaced</label>
        <input value={part} onChange={e => setPart(e.target.value)} placeholder="e.g. SKF 6205 bearing" />
        <label>Notes</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Repair notes..." />
        <div className="modal-actions">
          <button className="act pri" onClick={submitSignOff} disabled={!tech.trim()} style={{ flex: 1 }}>Submit sign-off</button>
          <button className="act" onClick={() => setShowModal(false)} style={{ flex: 1 }}>Cancel</button>
        </div>
      </div>
    </div>}
  </>;
}
