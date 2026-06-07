'use client';

import { useState, useEffect } from 'react';
import type { Resident } from '@/types';
import { api } from '../App';

interface Person {
  id: string;
  name: string;
  pgy: number;
  color: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string, pin: string, name: string) => void;
  showToast: (msg: string, err?: boolean) => void;
  existingResidents: Resident[];
}

export default function AddResidentModal({ open, onClose, onAdded, showToast, existingResidents }: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [persons, setPersons] = useState<Person[]>([]);

  // New person fields
  const [name, setName] = useState('');
  const [pgy, setPgy] = useState('4');

  // Shared (both modes)
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [hospital, setHospital] = useState('CUH');
  const [status, setStatus] = useState('active');
  const [rotStart, setRotStart] = useState('');
  const [rotEnd, setRotEnd] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      api<Person[]>('/persons').then(setPersons).catch(() => {});
    }
  }, [open]);

  // Persons not yet assigned to this block
  const existingPersonIds = new Set(existingResidents.map((r) => r.person_id).filter(Boolean));
  const available = persons.filter((p) => !existingPersonIds.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name));

  function reset() {
    setName(''); setPgy('4'); setSelectedPersonId('');
    setHospital('CUH'); setStatus('active'); setRotStart(''); setRotEnd('');
    setMode('new');
  }

  async function doAdd() {
    setLoading(true);
    try {
      const payload: Record<string, unknown> = {
        hospital, status,
        rotation_start: rotStart || null,
        rotation_end: rotEnd || null,
      };

      if (mode === 'existing') {
        if (!selectedPersonId) { showToast('Select a person', true); setLoading(false); return; }
        payload.personId = selectedPersonId;
      } else {
        const trimmed = name.trim();
        if (!trimmed) { showToast('Enter a name', true); setLoading(false); return; }
        payload.name = trimmed;
        payload.pgy  = parseInt(pgy);
      }

      const { id, pin, name: resName } = await api<{ id: string; pin: string; name: string }>(
        '/residents', 'POST', payload,
      );
      onAdded(id, pin, resName);
      reset();
      onClose();
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setLoading(false);
    }
  }

  if (!open) return null;

  const canSubmit = mode === 'new' ? name.trim().length > 0 : !!selectedPersonId;

  return (
    <div className="modal-bg open">
      <div className="modal">
        <div className="mh">
          <div>
            <div className="mt">Add Resident to Block</div>
            <div className="ms">
              {mode === 'new'
                ? 'Creates a new account — PIN generated and shown once'
                : 'Reuses existing account — same PIN as before'}
            </div>
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>

        {/* Mode selector */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', padding: '0 20px' }}>
          {(['new', 'existing'] as const).map((m) => (
            <button
              key={m}
              className={`tabbtn${mode === m ? ' active' : ''}`}
              style={{ fontSize: 12 }}
              onClick={() => setMode(m)}
            >
              {m === 'new' ? '＋ New Person' : '👤 Add Existing'}
            </button>
          ))}
        </div>

        <div className="mb">
          {/* New person fields */}
          {mode === 'new' && (
            <div className="fg f2">
              <div className="fl" style={{ gridColumn: 'span 2' }}>
                <label className="flb">Full Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dylan Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && doAdd()}
                />
              </div>
              <div className="fl">
                <label className="flb">PGY Level</label>
                <select value={pgy} onChange={(e) => setPgy(e.target.value)}>
                  <option value="2">PGY-2</option>
                  <option value="3">PGY-3</option>
                  <option value="4">PGY-4</option>
                  <option value="5">PGY-5</option>
                </select>
              </div>
            </div>
          )}

          {/* Existing person picker */}
          {mode === 'existing' && (
            <div className="fl">
              <label className="flb">Person</label>
              {available.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 0', fontStyle: 'italic' }}>
                  All known persons are already in this block.
                </div>
              ) : (
                <>
                  <select value={selectedPersonId} onChange={(e) => setSelectedPersonId(e.target.value)}>
                    <option value="">— Select person —</option>
                    {available.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} · PGY-{p.pgy}
                      </option>
                    ))}
                  </select>
                  <div className="hint">Their existing PIN will be reused — no new PIN is generated</div>
                </>
              )}
            </div>
          )}

          {/* Shared: hospital + status */}
          <div className="fg f2">
            <div className="fl">
              <label className="flb">Hospital</label>
              <select value={hospital} onChange={(e) => setHospital(e.target.value)}>
                <option value="CUH">CUH</option>
                <option value="PMH">PMH</option>
              </select>
            </div>
            <div className="fl">
              <label className="flb">Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="active">Active</option>
                <option value="research">Research (1 bkp wk + wknd)</option>
                <option value="away">Away / Excused</option>
              </select>
            </div>
          </div>

          {/* Shared: rotation dates */}
          <div className="fg f2">
            <div className="fl">
              <label className="flb">Rotation Start <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={rotStart} onChange={(e) => setRotStart(e.target.value)} />
            </div>
            <div className="fl">
              <label className="flb">Rotation End <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(optional)</span></label>
              <input type="date" value={rotEnd} onChange={(e) => setRotEnd(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="mf">
          <button className="btn bgh" onClick={() => { reset(); onClose(); }}>Cancel</button>
          <button
            className="btn bg"
            onClick={doAdd}
            disabled={loading || !canSubmit || (mode === 'existing' && available.length === 0)}
          >
            {loading ? <span className="spinner" /> : mode === 'new' ? 'Add & Generate PIN' : 'Add to Block'}
          </button>
        </div>
      </div>
    </div>
  );
}
