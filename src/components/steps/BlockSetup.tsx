'use client';

import { useState } from 'react';
import type { Block, Resident, Hospital } from '@/types';
import { HOLIDAYS, parseDate, fmtShort } from '@/lib/scheduler';
import { api } from '../App';
import AddResidentModal from '../modals/AddResidentModal';
import EditResidentModal from '../modals/EditResidentModal';
import PinDisplayModal from '../modals/PinDisplayModal';

interface Props {
  block: Block | null;
  residents: Resident[];
  onBlockSaved: (b: Block | null) => void;
  onResidentsChanged: () => void;
  onNext: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

function avatar(res: Resident, size = 26) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: res.color,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.38),
        fontWeight: 700,
        color: '#000',
        flexShrink: 0,
      }}
    >
      {res.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

export default function BlockSetup({ block, residents, onBlockSaved, onResidentsChanged, onNext, showToast }: Props) {
  const [blockName, setBlockName] = useState(block?.name ?? 'OTO Call — 2026–2027');
  const [startDate, setStartDate] = useState(block?.start_date ?? '2026-07-01');
  const [endDate, setEndDate] = useState(block?.end_date ?? '2027-06-30');
  const [newChiefPw, setNewChiefPw] = useState('');
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [editResident, setEditResident] = useState<Resident | null>(null);
  const [pinModal, setPinModal] = useState<{ open: boolean; title: string; name: string; pin: string }>({
    open: false, title: '', name: '', pin: '',
  });

  async function saveBlock() {
    try {
      const body: Record<string, string> = { name: blockName, start_date: startDate, end_date: endDate };
      if (newChiefPw) body.chief_password = newChiefPw;
      await api('/block', 'PUT', body);
      setNewChiefPw('');
      // Re-fetch block
      const updated = await api<Block | null>('/block');
      onBlockSaved(updated);
      showToast('Block saved');
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }

  async function removeResident(id: string) {
    try {
      await api(`/residents/${id}`, 'DELETE');
      onResidentsChanged();
      showToast('Resident removed');
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }

  function revealPin(res: Resident) {
    setPinModal({ open: true, title: 'Reveal PIN', name: res.name, pin: res.pin });
  }

  function handleAdded(id: string, pin: string, name: string) {
    onResidentsChanged();
    setPinModal({ open: true, title: 'Resident PIN', name, pin });
    showToast(`${name} added`);
  }

  const sorted = [...residents].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
  const srs = residents.filter((r) => r.pgy >= 4 && r.status === 'active');
  const res = residents.filter((r) => r.pgy >= 4 && r.status === 'research');
  const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');

  function hasRotationAt(r: Resident, hosp: Hospital) {
    return r.rotations?.some((rot) => rot.hospital === hosp) ?? r.hospital === hosp;
  }

  const bStart = parseDate(startDate);
  const bEnd = parseDate(endDate);
  const inBlockHolidays = [...HOLIDAYS]
    .filter((h) => { const d = parseDate(h); return d >= bStart && d <= bEnd; })
    .sort();

  return (
    <div>
      <div className="page-title">Year Setup</div>
      <div className="page-sub">
        Configure the academic year container and build the call pool. The year dates define the
        full resident request window (Jul 1 – Jun 30). Individual schedule periods are set at
        generation time. Each resident gets a unique PIN for blinded request submission.
      </div>

      <div style={{ marginBottom: 18 }}>
        {/* Block config card */}
        <div className="card">
          <div className="ch">
            <div className="ct">Year Configuration</div>
            <button className="btn bgh bsm" onClick={saveBlock}>Save</button>
          </div>
          <div className="cb">
            <div className="fg f2" style={{ marginBottom: 14 }}>
              <div className="fl">
                <label className="flb">Academic Year Start</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="fl">
                <label className="flb">Academic Year End</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <div className="fg f2" style={{ marginBottom: 14 }}>
              <div className="fl">
                <label className="flb">Year Name</label>
                <input type="text" value={blockName} onChange={(e) => setBlockName(e.target.value)} />
              </div>
              <div className="fl">
                <label className="flb">New Admin Password</label>
                <input
                  type="password"
                  placeholder="Leave blank to keep current"
                  value={newChiefPw}
                  onChange={(e) => setNewChiefPw(e.target.value)}
                />
              </div>
            </div>
            <span className="slabel">Federal Holidays in Academic Year (all 24h shifts)</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {inBlockHolidays.length > 0
                ? inBlockHolidays.map((h) => (
                    <span key={h} className="bdg bo">{fmtShort(h)} 24h</span>
                  ))
                : <span style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>None in this block</span>
              }
            </div>
          </div>
        </div>
      </div>

      {/* Call pool */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="ch">
          <div className="ct">Call Pool</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: 'var(--muted)' }}>Click PIN to copy</span>
            <button className="btn bg bsm" onClick={() => setAddModalOpen(true)}>＋ Add Resident</button>
          </div>
        </div>
        <div className="cbt">
          <table className="ptable">
            <thead>
              <tr>
                <th>Name</th><th>PGY</th><th>Role</th><th>Status</th><th>Rotations</th><th>PIN</th><th></th>
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 28, color: 'var(--muted)', fontStyle: 'italic' }}>
                    No residents added yet.
                  </td>
                </tr>
              ) : sorted.map((r) => {
                const statusBadge =
                  r.status === 'research' ? <span className="bdg bpk">Research</span> :
                  r.status === 'active' ? <span className="bdg bm">Active</span> :
                  <span className="bdg bo">Away</span>;
                return (
                  <tr key={r.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {avatar(r)}
                        <span style={{ fontWeight: 500 }}>{r.name}</span>
                      </div>
                    </td>
                    <td><span className={`bdg ${r.pgy >= 4 ? 'bg2' : 'bb'}`}>PGY-{r.pgy}</span></td>
                    <td>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {r.status === 'research' ? 'Research (backup)' : r.pgy >= 4 ? 'Senior Call' : 'Junior Call'}
                      </span>
                    </td>
                    <td>{statusBadge}</td>
                    <td>
                      {r.rotations && r.rotations.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {r.rotations.map((rot) => {
                            const hospColor: Record<Hospital, string> = { CUH: 'bgr', PMH: 'bp', CMC: 'bb', VA: 'bo' };
                            return (
                              <span key={rot.id} className={`bdg ${hospColor[rot.hospital]}`} title={`${rot.start_date} → ${rot.end_date}`}>
                                {rot.hospital} {fmtShort(rot.start_date)}–{fmtShort(rot.end_date)}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span style={{ fontSize: 11, color: 'var(--muted2)', fontStyle: 'italic' }}>No segments</span>
                      )}
                    </td>
                    <td>
                      <span
                        className="pin-chip"
                        title="Click to copy"
                        onClick={() => navigator.clipboard.writeText(r.pin).then(() => showToast('PIN copied!'))}
                      >
                        {r.pin}
                      </span>
                    </td>
                    <td style={{ display: 'flex', gap: 4 }}>
                      <button
                        className="bico"
                        style={{ fontSize: 11, width: 'auto', padding: '0 8px', color: 'var(--muted)' }}
                        onClick={() => revealPin(r)}
                      >
                        🔑
                      </button>
                      <button
                        className="bico"
                        style={{ fontSize: 11, width: 'auto', padding: '0 8px', color: 'var(--muted)' }}
                        onClick={() => setEditResident(r)}
                      >
                        ✎
                      </button>
                      <button className="bico" onClick={() => removeResident(r.id)}>✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pool summary */}
      <div className="srow" style={{ gridTemplateColumns: 'repeat(6,1fr)', marginBottom: 20 }}>
        {[
          { l: 'Seniors Active', v: srs.length, c: 'var(--gold)' },
          { l: 'Research Sr', v: res.length, c: 'var(--pink)' },
          { l: 'Juniors PGY-2/3', v: jrs.length, c: 'var(--blue)' },
          { l: 'CUH', v: residents.filter((r) => r.status !== 'away' && hasRotationAt(r, 'CUH')).length, c: 'var(--green)' },
          { l: 'PMH', v: residents.filter((r) => r.status !== 'away' && hasRotationAt(r, 'PMH')).length, c: 'var(--purple)' },
          { l: 'CMC', v: residents.filter((r) => r.status !== 'away' && hasRotationAt(r, 'CMC')).length, c: 'var(--blue)' },
        ].map((s) => (
          <div key={s.l} className="sc">
            <div className="sn" style={{ color: s.c }}>{s.v}</div>
            <div className="sl">{s.l}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn bg" onClick={onNext}>Continue to Requests →</button>
      </div>

      <EditResidentModal
        resident={editResident}
        onClose={() => setEditResident(null)}
        onSaved={onResidentsChanged}
        showToast={showToast}
        blockStart={startDate}
        blockEnd={endDate}
      />
      <AddResidentModal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        onAdded={handleAdded}
        showToast={showToast}
        existingResidents={residents}
        blockStart={startDate}
        blockEnd={endDate}
      />
      <PinDisplayModal
        open={pinModal.open}
        title={pinModal.title}
        residentName={pinModal.name}
        pin={pinModal.pin}
        onClose={() => setPinModal((p) => ({ ...p, open: false }))}
        showToast={showToast}
      />
    </div>
  );
}
