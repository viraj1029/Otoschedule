'use client';

import { useState, useEffect } from 'react';
import type { Resident } from '@/types';
import { api } from '../App';

interface Props {
  resident: Resident | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

export default function EditResidentModal({ resident, onClose, onSaved, showToast }: Props) {
  const [name,     setName]     = useState('');
  const [pgy,      setPgy]      = useState('4');
  const [hospital, setHospital] = useState<'CUH' | 'PMH'>('CUH');
  const [status,   setStatus]   = useState<'active' | 'research' | 'away'>('active');
  const [rotStart, setRotStart] = useState('');
  const [rotEnd,   setRotEnd]   = useState('');
  const [loading,  setLoading]  = useState(false);

  // Sync form state whenever the selected resident changes
  useEffect(() => {
    if (resident) {
      setName(resident.name);
      setPgy(String(resident.pgy));
      setHospital(resident.hospital);
      setStatus(resident.status);
      setRotStart(resident.rotation_start ?? '');
      setRotEnd(resident.rotation_end ?? '');
    }
  }, [resident]);

  if (!resident) return null;

  async function save() {
    setLoading(true);
    try {
      await api(`/residents/${resident!.id}`, 'PATCH', {
        name: name.trim() || undefined,
        pgy: parseInt(pgy),
        hospital,
        status,
        rotation_start: rotStart || null,
        rotation_end:   rotEnd   || null,
      });
      onSaved();
      showToast(`${name.trim() || resident!.name} updated`);
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
          {/* Person-level fields — update the global account */}
          <div className="fg f2">
            <div className="fl" style={{ gridColumn: 'span 2' }}>
              <label className="flb">Full Name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(updates account across blocks)</span></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="fl">
              <label className="flb">PGY Level <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(updates account)</span></label>
              <select value={pgy} onChange={(e) => setPgy(e.target.value)}>
                <option value="2">PGY-2</option>
                <option value="3">PGY-3</option>
                <option value="4">PGY-4</option>
                <option value="5">PGY-5</option>
              </select>
            </div>
          </div>

          {/* Block-specific fields */}
          <div className="fg f2">
            <div className="fl">
              <label className="flb">Hospital <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(this block only)</span></label>
              <select value={hospital} onChange={(e) => setHospital(e.target.value as 'CUH' | 'PMH')}>
                <option value="CUH">CUH</option>
                <option value="PMH">PMH</option>
              </select>
            </div>
            <div className="fl">
              <label className="flb">Status <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(this block only)</span></label>
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
            Leave rotation dates blank to use the full block period.
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
