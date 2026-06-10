'use client';

import { useState } from 'react';
import type { Block, Resident, Hospital } from '@/types';
import { HOLIDAYS, parseDate, fmtShort } from '@/lib/scheduler';
import { api } from '../App';
import AddResidentModal from '../modals/AddResidentModal';
import EditResidentModal from '../modals/EditResidentModal';
import PinDisplayModal from '../modals/PinDisplayModal';

const HOSP_COLOR: Record<Hospital, string> = {
  CUH: 'var(--green)', PMH: 'var(--purple)', CMC: 'var(--blue)',
  VA: 'var(--orange)', Research: 'var(--pink)',
};

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
  const [activeTab, setActiveTab] = useState<'setup' | 'rotations'>('setup');

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
  const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');

  function hasRotationAt(r: Resident, hosp: Hospital) {
    return r.rotations?.some((rot) => rot.hospital === hosp) ?? r.hospital === hosp;
  }

  const bStart = parseDate(startDate);
  const bEnd = parseDate(endDate);
  const inBlockHolidays = [...HOLIDAYS]
    .filter((h) => { const d = parseDate(h); return d >= bStart && d <= bEnd; })
    .sort();

  function renderRotationsTab() {
    const bStart = parseDate(startDate);
    const bEnd = parseDate(endDate);
    const totalMs = bEnd.getTime() - bStart.getTime();

    const months: { label: string; pct: number }[] = [];
    let cur = new Date(bStart.getFullYear(), bStart.getMonth(), 1);
    while (cur <= bEnd) {
      const pct = Math.max(0, (cur.getTime() - bStart.getTime()) / totalMs * 100);
      months.push({ label: cur.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }), pct });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }

    const hasAnyRotations = sorted.some((r) => r.rotations && r.rotations.length > 0);

    if (!hasAnyRotations && sorted.length === 0) {
      return (
        <div className="card">
          <div className="cb" style={{ textAlign: 'center', padding: 48, color: 'var(--muted)', fontStyle: 'italic' }}>
            No residents added yet.
          </div>
        </div>
      );
    }

    return (
      <div className="card">
        <div className="ch">
          <div className="ct">Rotation Timeline</div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {(['CUH', 'PMH', 'CMC', 'VA', 'Research'] as Hospital[]).map((h) => (
              <div key={h} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <div style={{ width: 10, height: 10, borderRadius: 2, background: HOSP_COLOR[h] }} />
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{h}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="cb">
          {/* Month axis */}
          <div style={{ display: 'flex', marginLeft: 144, position: 'relative', height: 22, marginBottom: 6 }}>
            {months.map((m) => (
              <div key={m.label} style={{
                position: 'absolute', left: `${m.pct}%`,
                fontSize: 9, color: 'var(--muted)', fontFamily: "'JetBrains Mono', monospace",
                transform: 'translateX(-50%)', whiteSpace: 'nowrap',
              }}>{m.label}</div>
            ))}
          </div>

          {/* Resident rows */}
          {sorted.map((res) => {
            const rots = res.rotations ?? [];
            const bars = rots.map((rot) => {
              const s = parseDate(rot.start_date);
              const e = parseDate(rot.end_date);
              const clampS = s < bStart ? bStart : s;
              const clampE = e > bEnd ? bEnd : e;
              const leftPct = (clampS.getTime() - bStart.getTime()) / totalMs * 100;
              const widthPct = (clampE.getTime() - clampS.getTime()) / totalMs * 100 + (1 / totalMs * 86400000 * 100);
              return { hospital: rot.hospital, leftPct: Math.max(0, leftPct), widthPct: Math.min(widthPct, 100 - Math.max(0, leftPct)), title: `${rot.hospital}: ${fmtShort(rot.start_date)} – ${fmtShort(rot.end_date)}` };
            });

            return (
              <div key={res.id} style={{ display: 'flex', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                {/* Name label */}
                <div style={{ width: 136, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden' }}>
                  {avatar(res, 20)}
                  <span style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{res.name}</span>
                  <span className={`bdg ${res.pgy >= 4 ? 'bg2' : 'bb'}`} style={{ fontSize: 8, flexShrink: 0 }}>{res.pgy}</span>
                </div>
                {/* Gantt bar */}
                <div style={{ flex: 1, position: 'relative', height: 26, background: 'var(--s2)', borderRadius: 4 }}>
                  {/* Grid lines */}
                  {months.map((m) => (
                    <div key={m.label} style={{
                      position: 'absolute', left: `${m.pct}%`, top: 0, bottom: 0,
                      width: 1, background: 'var(--border)', opacity: 0.6,
                    }} />
                  ))}
                  {bars.length === 0 ? (
                    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', paddingLeft: 8, fontSize: 10, color: 'var(--muted2)', fontStyle: 'italic' }}>
                      no rotations
                    </div>
                  ) : bars.map((bar, i) => (
                    <div key={i} title={bar.title} style={{
                      position: 'absolute',
                      left: `${bar.leftPct}%`,
                      width: `${bar.widthPct}%`,
                      top: 3, bottom: 3,
                      background: HOSP_COLOR[bar.hospital],
                      borderRadius: 3,
                      opacity: res.status === 'away' ? 0.35 : 0.85,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                      {bar.widthPct > 7 && (
                        <span style={{ fontSize: 8, fontWeight: 700, color: '#000', letterSpacing: '0.04em' }}>
                          {bar.hospital}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {sorted.length === 0 && (
            <div style={{ textAlign: 'center', padding: 32, color: 'var(--muted)', fontStyle: 'italic' }}>
              No residents added yet.
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-title">Year Setup</div>
      <div className="page-sub">
        Configure the academic year container and build the call pool. The year dates define the
        full resident request window (Jul 1 – Jun 30). Individual schedule periods are set at
        generation time. Each resident gets a unique PIN for blinded request submission.
      </div>

      {/* Tab bar */}
      <div className="tabrow" style={{ marginBottom: 20 }}>
        {([{ id: 'setup', label: '⚙ Setup' }, { id: 'rotations', label: '📅 Rotations' }] as const).map(({ id, label }) => (
          <button key={id} className={`tabbtn${activeTab === id ? ' active' : ''}`} onClick={() => setActiveTab(id)}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'rotations' && renderRotationsTab()}

      {activeTab === 'setup' && <div>
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
                        {r.pgy >= 4 ? 'Senior Call' : 'Junior Call'}
                      </span>
                    </td>
                    <td>{statusBadge}</td>
                    <td>
                      {r.rotations && r.rotations.length > 0 ? (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {r.rotations.map((rot) => {
                            const hospColor: Record<Hospital, string> = { CUH: 'bgr', PMH: 'bp', CMC: 'bb', VA: 'bo', Research: 'bpk' };
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
          { l: 'Seniors', v: srs.length, c: 'var(--gold)' },
          { l: 'Research Rot', v: residents.filter((r) => r.rotations?.some((rot) => rot.hospital === 'Research')).length, c: 'var(--pink)' },
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
      </div>}

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
