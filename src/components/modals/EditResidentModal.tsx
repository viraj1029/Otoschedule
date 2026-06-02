'use client';

import { useState } from 'react';
import type { Resident } from '@/types';
import { api } from '../App';

interface Props {
  resident: Resident | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

export default function EditResidentModal({ resident, onClose, onSaved, showToast }: Props) {
  const [pgy, setPgy] = useState(String(resident?.pgy ?? '4'));
  const [hospital, setHospital] = useState<'CUH' | 'PMH'>(resident?.hospital ?? 'CUH');
  const [status, setStatus] = useState<'active' | 'research' | 'away'>(resident?.status ?? 'active');
  const [rotStart, setRotStart] = useState(resident?.rotation_start ?? '');
  const [rotEnd, setRotEnd] = useState(resident?.rotation_end ?? '');
  const [loading, setLoading] = useState(false);

  if (!resident) return null;

  async function save() {
    setLoading(true);
    try {
      await api(`/residents/${resident!.id}`, 'PATCH', {
        pgy: parseInt(pgy),
        hospital,
        status,
        rotation_start: rotStart || null,
        rotation_end: rotEnd || null,
      });
      onSaved();
      showToast(`${resident!.name} updated`);
      onClose();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="mh">
          <div>
            <div className="mt">Edit Resident</div>
            <div className="ms">{resident.name}</div>
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          <div className="fg f3">
            <div className="fl">
              <label className="flb">PGY Level</label>
              <select value={pgy} onChange={(e) => setPgy(e.target.value)}>
                <option value="2">PGY-2</option>
                <option value="3">PGY-3</option>
                <option value="4">PGY-4</option>
                <option value="5">PGY-5</option>
              </select>
            </div>
            <div className="fl">
              <label className="flb">Hospital</label>
              <select value={hospital} onChange={(e) => setHospital(e.target.value as 'CUH' | 'PMH')}>
                <option value="CUH">CUH</option>
                <option value="PMH">PMH</option>
              </select>
            </div>
            <div className="fl">
              <label className="flb">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'research' | 'away')}>
                <option value="active">Active</option>
                <option value="research">Research (backup)</option>
                <option value="away">Away / Excused</option>
              </select>
            </div>
          </div>
          <div className="fg f2">
            <div className="fl">
              <label className="flb">Rotation Start <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={rotStart ?? ''} onChange={(e) => setRotStart(e.target.value)} />
            </div>
            <div className="fl">
              <label className="flb">Rotation End <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={rotEnd ?? ''} onChange={(e) => setRotEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', padding: '4px 2px' }}>
            Leave blank to use the full block period. Call hours are assigned proportionally to rotation length.
          </div>
        </div>
        <div className="mf">
          <button className="btn bgh" onClick={onClose}>Cancel</button>
          <button className="btn bg" onClick={save} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
