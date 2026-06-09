'use client';

import { useState, useEffect } from 'react';
import type { Resident, Rotation, Hospital } from '@/types';
import { api } from '../App';

interface Props {
  resident: Resident | null;
  onClose: () => void;
  onSaved: () => void;
  showToast: (msg: string, err?: boolean) => void;
  blockStart?: string;
  blockEnd?: string;
}

const ALL_HOSPITALS: Hospital[] = ['CUH', 'PMH', 'CMC', 'VA', 'Research'];

export default function EditResidentModal({ resident, onClose, onSaved, showToast, blockStart = '2026-07-01', blockEnd = '2027-06-30' }: Props) {
  const [name,    setName]    = useState('');
  const [pgy,     setPgy]     = useState('4');
  const [status,  setStatus]  = useState<'active' | 'research' | 'away'>('active');
  const [loading, setLoading] = useState(false);

  // Rotation segments
  const [rotations, setRotations] = useState<Rotation[]>([]);
  const [addingRot, setAddingRot] = useState(false);
  const [newHosp,   setNewHosp]   = useState<Hospital>('CUH');
  const [newStart,  setNewStart]  = useState(blockStart);
  const [newEnd,    setNewEnd]    = useState(blockEnd);

  // Editing an existing segment inline
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editHosp,   setEditHosp]   = useState<Hospital>('CUH');
  const [editStart,  setEditStart]  = useState('');
  const [editEnd,    setEditEnd]    = useState('');

  useEffect(() => {
    if (resident) {
      setName(resident.name);
      setPgy(String(resident.pgy));
      setStatus(resident.status);
      setRotations(resident.rotations ?? []);
      setAddingRot(false);
      setEditingId(null);
    }
  }, [resident]);

  if (!resident) return null;

  async function save() {
    setLoading(true);
    try {
      await api(`/residents/${resident!.id}`, 'PATCH', {
        name: name.trim() || undefined,
        pgy: parseInt(pgy),
        status,
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

  async function addRotation() {
    if (!newStart || !newEnd) return;
    try {
      const { id: rotId } = await api<{ id: string }>(
        `/residents/${resident!.id}/rotations`, 'POST',
        { hospital: newHosp, start_date: newStart, end_date: newEnd },
      );
      setRotations((prev) => [...prev, { id: rotId, resident_id: resident!.id, hospital: newHosp, start_date: newStart, end_date: newEnd }]);
      setAddingRot(false);
      setNewHosp('CUH'); setNewStart(blockStart); setNewEnd(blockEnd);
      onSaved();
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }

  async function deleteRotation(rotId: string) {
    try {
      await api(`/rotations/${rotId}`, 'DELETE');
      setRotations((prev) => prev.filter((r) => r.id !== rotId));
      onSaved();
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }

  function startEdit(rot: Rotation) {
    setEditingId(rot.id);
    setEditHosp(rot.hospital);
    setEditStart(rot.start_date);
    setEditEnd(rot.end_date);
  }

  async function saveEditRotation() {
    if (!editingId) return;
    try {
      await api(`/rotations/${editingId}`, 'PATCH', { hospital: editHosp, start_date: editStart, end_date: editEnd });
      setRotations((prev) => prev.map((r) => r.id === editingId
        ? { ...r, hospital: editHosp, start_date: editStart, end_date: editEnd }
        : r,
      ));
      setEditingId(null);
      onSaved();
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }

  return (
    <div className="modal-bg open">
      <div className="modal" style={{ maxWidth: 560 }}>
        <div className="mh">
          <div>
            <div className="mt">Edit Resident</div>
            <div className="ms">{resident.name}</div>
          </div>
          <button className="mx" onClick={onClose}>✕</button>
        </div>
        <div className="mb">
          {/* Person-level fields */}
          <div className="fg f2" style={{ marginBottom: 14 }}>
            <div className="fl" style={{ gridColumn: 'span 2' }}>
              <label className="flb">Full Name <span style={{ color: 'var(--muted)', fontWeight: 400 }}>(updates account across blocks)</span></label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
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
              <select value={status} onChange={(e) => setStatus(e.target.value as 'active' | 'research' | 'away')}>
                <option value="active">Active</option>
                <option value="away">Away / Excused</option>
              </select>
            </div>
          </div>

          {/* Rotation segments */}
          <div className="fl">
            <label className="flb">Rotation Schedule</label>
            <div className="hint" style={{ marginBottom: 8 }}>
              One segment per hospital rotation. The scheduler uses these to determine call pool eligibility.
            </div>
          </div>

          {rotations.length === 0 && (
            <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 8 }}>
              No rotation segments defined.
            </div>
          )}

          {rotations.map((rot) => (
            <div key={rot.id} style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', marginBottom: 4,
              background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 7,
            }}>
              {editingId === rot.id ? (
                <>
                  <select value={editHosp} onChange={(e) => setEditHosp(e.target.value as Hospital)} style={{ width: 80, fontSize: 12 }}>
                    {ALL_HOSPITALS.filter((h) => h !== 'Research' || parseInt(pgy) >= 4).map((h) => <option key={h} value={h}>{h === 'Research' ? 'Research (backup)' : h}</option>)}
                  </select>
                  <input type="date" value={editStart} onChange={(e) => setEditStart(e.target.value)} style={{ fontSize: 11, width: 130 }} />
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>→</span>
                  <input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} style={{ fontSize: 11, width: 130 }} />
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="btn bg bsm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={saveEditRotation}>Save</button>
                    <button className="btn bgh bsm" style={{ fontSize: 11, padding: '2px 8px' }} onClick={() => setEditingId(null)}>✕</button>
                  </div>
                </>
              ) : (
                <>
                  <span style={{
                    fontWeight: 700, fontSize: 12, minWidth: 40,
                    color: rot.hospital === 'CUH' ? 'var(--green)' : rot.hospital === 'PMH' ? 'var(--purple)' : rot.hospital === 'CMC' ? 'var(--blue)' : rot.hospital === 'Research' ? 'var(--pink)' : 'var(--orange)',
                  }}>{rot.hospital}</span>
                  <span style={{ fontSize: 12, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace" }}>
                    {rot.start_date} → {rot.end_date}
                  </span>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                    <button className="bico" style={{ fontSize: 11 }} onClick={() => startEdit(rot)}>✎</button>
                    <button className="bico" onClick={() => deleteRotation(rot.id)}>✕</button>
                  </div>
                </>
              )}
            </div>
          ))}

          {addingRot ? (
            <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 8, padding: 10, marginTop: 6 }}>
              <div className="fg f2" style={{ marginBottom: 8 }}>
                <div className="fl">
                  <label className="flb">Hospital</label>
                  <select value={newHosp} onChange={(e) => setNewHosp(e.target.value as Hospital)}>
                    {ALL_HOSPITALS.filter((h) => h !== 'Research' || parseInt(pgy) >= 4).map((h) => <option key={h} value={h}>{h === 'Research' ? 'Research (backup)' : h}</option>)}
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
                <button className="btn bg bsm" onClick={addRotation}>Add Segment</button>
                <button className="btn bgh bsm" onClick={() => setAddingRot(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn bgh bsm" style={{ marginTop: 6 }} onClick={() => setAddingRot(true)}>
              ＋ Add Rotation Segment
            </button>
          )}
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
