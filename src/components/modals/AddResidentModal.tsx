'use client';

import { useState, useEffect } from 'react';
import type { Resident, Hospital } from '@/types';
import { api } from '../App';

interface Person {
  id: string;
  name: string;
  pgy: number;
  color: string;
}

interface RotSegment {
  hospital: Hospital;
  start_date: string;
  end_date: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onAdded: (id: string, pin: string, name: string) => void;
  showToast: (msg: string, err?: boolean) => void;
  existingResidents: Resident[];
  blockStart?: string;
  blockEnd?: string;
}

const ALL_HOSPITALS: Hospital[] = ['CUH', 'PMH', 'CMC', 'VA', 'Research'];

function RotationEditor({
  segments,
  onChange,
  blockStart,
  blockEnd,
  pgy,
}: {
  segments: RotSegment[];
  onChange: (s: RotSegment[]) => void;
  blockStart: string;
  blockEnd: string;
  pgy: number;
}) {
  const [adding, setAdding] = useState(false);
  const [newHosp, setNewHosp] = useState<Hospital>('CUH');
  const [newStart, setNewStart] = useState(blockStart);
  const [newEnd, setNewEnd] = useState(blockEnd);

  function addSegment() {
    if (!newStart || !newEnd) return;
    onChange([...segments, { hospital: newHosp, start_date: newStart, end_date: newEnd }]);
    setAdding(false);
    setNewHosp('CUH'); setNewStart(blockStart); setNewEnd(blockEnd);
  }

  function remove(i: number) {
    onChange(segments.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div style={{ marginBottom: 6 }}>
        {segments.length === 0 ? (
          <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 6 }}>
            No rotation segments — resident is considered unavailable. Add at least one.
          </div>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
            {segments.map((seg, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--s2)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '4px 8px', fontSize: 12,
              }}>
                <span style={{ fontWeight: 600 }}>{seg.hospital}</span>
                <span style={{ color: 'var(--muted)' }}>{seg.start_date} → {seg.end_date}</span>
                <button
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--red)', padding: 0, fontSize: 12, lineHeight: 1 }}
                  onClick={() => remove(i)}
                >✕</button>
              </div>
            ))}
          </div>
        )}
      </div>
      {adding ? (
        <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginBottom: 8 }}>
          <div className="fg f2" style={{ marginBottom: 8 }}>
            <div className="fl">
              <label className="flb">Hospital</label>
              <select value={newHosp} onChange={(e) => setNewHosp(e.target.value as Hospital)}>
                {ALL_HOSPITALS.filter((h) => h !== 'Research' || pgy >= 4).map((h) => <option key={h} value={h}>{h === 'Research' ? 'Research (backup)' : h}</option>)}
              </select>
            </div>
          </div>
          <div className="fg f2" style={{ marginBottom: 8 }}>
            <div className="fl">
              <label className="flb">Start Date</label>
              <input type="date" value={newStart} min={blockStart} max={blockEnd} onChange={(e) => setNewStart(e.target.value)} />
            </div>
            <div className="fl">
              <label className="flb">End Date</label>
              <input type="date" value={newEnd} min={newStart} max={blockEnd} onChange={(e) => setNewEnd(e.target.value)} />
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn bg bsm" onClick={addSegment}>Add</button>
            <button className="btn bgh bsm" onClick={() => setAdding(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button className="btn bgh bsm" onClick={() => setAdding(true)}>＋ Add Rotation Segment</button>
      )}
    </div>
  );
}

export default function AddResidentModal({ open, onClose, onAdded, showToast, existingResidents, blockStart = '2026-07-01', blockEnd = '2027-06-30' }: Props) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [persons, setPersons] = useState<Person[]>([]);

  const [name, setName] = useState('');
  const [pgy, setPgy] = useState('4');
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [status, setStatus] = useState('active');
  const [segments, setSegments] = useState<RotSegment[]>([{ hospital: 'CUH', start_date: blockStart, end_date: blockEnd }]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      api<Person[]>('/persons').then(setPersons).catch(() => {});
    }
  }, [open]);

  const existingPersonIds = new Set(existingResidents.map((r) => r.person_id).filter(Boolean));
  const available = persons.filter((p) => !existingPersonIds.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));

  function reset() {
    setName(''); setPgy('4'); setSelectedPersonId('');
    setStatus('active');
    setSegments([{ hospital: 'CUH', start_date: blockStart, end_date: blockEnd }]);
    setMode('new');
  }

  async function doAdd() {
    if (segments.length === 0) { showToast('Add at least one rotation segment', true); return; }
    setLoading(true);
    try {
      // Derive a primary hospital from the first segment
      const primaryHospital = segments[0].hospital;
      const payload: Record<string, unknown> = {
        hospital: primaryHospital,
        status,
        rotations: segments,
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
              <div className="fl">
                <label className="flb">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="away">Away / Excused</option>
                </select>
              </div>
            </div>
          )}

          {mode === 'existing' && (
            <>
              <div className="fl" style={{ marginBottom: 12 }}>
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
                        <option key={p.id} value={p.id}>{p.name} · PGY-{p.pgy}</option>
                      ))}
                    </select>
                    <div className="hint">Their existing PIN will be reused — no new PIN is generated</div>
                  </>
                )}
              </div>
              <div className="fl" style={{ marginBottom: 12 }}>
                <label className="flb">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="active">Active</option>
                  <option value="away">Away / Excused</option>
                </select>
              </div>
            </>
          )}

          <div className="fl">
            <label className="flb">Rotation Schedule</label>
            <div className="hint" style={{ marginBottom: 6 }}>
              Add one segment per hospital rotation. The scheduler pulls the resident into the call
              pool only during their active segments.
            </div>
            <RotationEditor
              segments={segments}
              onChange={setSegments}
              blockStart={blockStart}
              blockEnd={blockEnd}
              pgy={parseInt(pgy) || 4}
            />
          </div>
        </div>

        <div className="mf">
          <button className="btn bgh" onClick={() => { reset(); onClose(); }}>Cancel</button>
          <button
            className="btn bg"
            onClick={doAdd}
            disabled={loading || !canSubmit || segments.length === 0 || (mode === 'existing' && available.length === 0)}
          >
            {loading ? <span className="spinner" /> : mode === 'new' ? 'Add & Generate PIN' : 'Add to Block'}
          </button>
        </div>
      </div>
    </div>
  );
}
