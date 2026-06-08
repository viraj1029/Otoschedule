'use client';

import { useState } from 'react';
import type { VAScheduleData, Resident } from '@/types';
import { parseDate, fmtShort, dk, addDays, HOLIDAYS, HOLIDAY_NAMES } from '@/lib/scheduler';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function avatar(res: Resident, size = 22) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: res.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.42), fontWeight: 700, color: '#000', flexShrink: 0,
    }}>
      {res.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function getBlockMonths(bStart: string, bEnd: string): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  const s = parseDate(bStart);
  const e = parseDate(bEnd);
  let d = new Date(s.getFullYear(), s.getMonth(), 1);
  while (d <= e) {
    months.push({ year: d.getFullYear(), month: d.getMonth() });
    d = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  }
  return months;
}

interface Props {
  schedule: VAScheduleData;
  residents: Resident[];
  role?: string;
  onOverride?: (weekIndex: number, newRes: Resident) => void;
}

interface OverrideState {
  open: boolean;
  weekIndex: number;
  weekLabel: string;
  currentRes: Resident | null;
}

export default function VAScheduleView({ schedule, residents, role, onOverride }: Props) {
  const { weeks, counts, days, hours, bStart, bEnd } = schedule;
  const [overrideState, setOverrideState] = useState<OverrideState>({ open: false, weekIndex: -1, weekLabel: '', currentRes: null });
  const [newResId, setNewResId] = useState('');

  // Build a lookup: dateKey → week index
  const dayToWeekIdx: Record<string, number> = {};
  weeks.forEach((w, i) => {
    let d = parseDate(w.wS);
    const end = parseDate(w.wE);
    while (d <= end) { dayToWeekIdx[dk(d)] = i; d = addDays(d, 1); }
  });

  // Collect unique residents in the schedule
  const resSet = new Map<string, Resident>();
  weeks.forEach((w) => resSet.set(w.res.id, w.res));
  const poolResidents = [...resSet.values()].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  const bStartDate = parseDate(bStart);
  const bEndDate   = parseDate(bEnd);
  const allMonths  = getBlockMonths(bStart, bEnd);

  function handleDayClick(key: string) {
    if (role !== 'chief' || !onOverride) return;
    const idx = dayToWeekIdx[key];
    if (idx === undefined) return;
    const w = weeks[idx];
    setNewResId(w.res.id);
    setOverrideState({ open: true, weekIndex: idx, weekLabel: `${fmtShort(w.wS)} – ${fmtShort(w.wE)}`, currentRes: w.res });
  }

  function saveOverride() {
    if (overrideState.weekIndex < 0 || !newResId) return;
    const res = residents.find((r) => r.id === newResId);
    if (!res || !onOverride) return;
    onOverride(overrideState.weekIndex, res);
    setOverrideState({ open: false, weekIndex: -1, weekLabel: '', currentRes: null });
  }

  function renderMonth(year: number, month: number) {
    const firstDow = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDow; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);

    const rows = [];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      rows.push(
        <div key={`w${i}`} style={{ display: 'contents' }}>
          {week.map((day, j) => {
            if (!day) return <div key={`e${i}-${j}`} style={{ background: 'var(--s2)', minHeight: 68, borderRadius: 6 }} />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const d = parseDate(key);
            if (d < bStartDate || d > bEndDate) return <div key={key} style={{ background: 'var(--s2)', minHeight: 68, borderRadius: 6, opacity: 0.3 }} />;

            const weekIdx = dayToWeekIdx[key];
            const vaWeek = weekIdx !== undefined ? weeks[weekIdx] : null;
            const isHol = HOLIDAYS.has(key);
            const dow = d.getDay();
            const isWknd = dow === 0 || dow === 6;
            const isActive = role === 'chief' && onOverride && vaWeek;

            const bgColor = vaWeek
              ? `${vaWeek.res.color}22`
              : isHol ? 'rgba(251,146,60,0.10)'
              : isWknd ? 'rgba(0,0,0,0.04)'
              : undefined;

            const borderColor = vaWeek ? `${vaWeek.res.color}55` : 'var(--border)';

            return (
              <div
                key={key}
                style={{
                  background: bgColor,
                  minHeight: 68, borderRadius: 6,
                  border: `1px solid ${borderColor}`,
                  padding: '5px 6px', display: 'flex', flexDirection: 'column', gap: 3,
                  cursor: isActive ? 'pointer' : 'default',
                  transition: 'opacity .1s',
                }}
                onClick={() => handleDayClick(key)}
                title={isActive ? 'Click to override' : undefined}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{day}</span>
                  {isHol && <span style={{ fontSize: 9, color: 'var(--orange)' }}>🎉</span>}
                  {vaWeek?.override && <span style={{ fontSize: 9, color: 'var(--orange)', fontWeight: 700 }}>OV</span>}
                </div>
                {vaWeek ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {avatar(vaWeek.res, 16)}
                    <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2, color: vaWeek.res.color }}>
                      {vaWeek.res.name.split(' ').pop()}
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 9, color: 'var(--muted)', fontStyle: 'italic' }}>—</div>
                )}
                {isHol && <div style={{ fontSize: 8, color: 'var(--orange)', lineHeight: 1 }}>{HOLIDAY_NAMES[key]}</div>}
              </div>
            );
          })}
        </div>,
      );
    }
    return rows;
  }

  const vaPool = residents.filter((r) => r.status === 'active' && r.rotations?.some((seg) => seg.hospital === 'VA'));

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(poolResidents.length, 1)}, 1fr)`, gap: 12, marginBottom: 20 }}>
        {poolResidents.map((res) => {
          const totalWeeks = counts[res.id] ?? 0;
          const totalDays  = days[res.id]   ?? 0;
          const totalHrs   = hours[res.id]  ?? 0;
          return (
            <div key={res.id} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {avatar(res, 24)}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{res.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>PGY-{res.pgy}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Weeks</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: res.color, lineHeight: 1 }}>{totalWeeks}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Days</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: 'var(--blue)', lineHeight: 1 }}>{totalDays}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Hours</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color: 'var(--muted2)', lineHeight: 1 }}>{totalHrs}h</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {role === 'chief' && onOverride && (
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '5px 10px', background: 'rgba(0,0,0,0.04)', borderRadius: 6 }}>
          Click any calendar day to override the weekly assignment
        </div>
      )}

      {/* Monthly calendar grids */}
      {allMonths.map(({ year, month }) => (
        <div key={`${year}-${month}`} style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            {MONTHS[month]} {year}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 4 }}>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} style={{ fontSize: 10, fontWeight: 700, color: 'var(--muted)', textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {d}
              </div>
            ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
            {renderMonth(year, month)}
          </div>
        </div>
      ))}

      {/* Override modal */}
      {overrideState.open && (
        <div className="modal-bg open">
          <div className="modal">
            <div className="mh">
              <div>
                <div className="mt">Override VA Assignment</div>
                <div className="ms">Week of {overrideState.weekLabel}</div>
              </div>
              <button className="mx" onClick={() => setOverrideState({ open: false, weekIndex: -1, weekLabel: '', currentRes: null })}>✕</button>
            </div>
            <div className="mb">
              <div className="fl">
                <label className="flb">Current: {overrideState.currentRes?.name ?? '—'}</label>
              </div>
              <div className="fl">
                <label className="flb">Assign to</label>
                <select value={newResId} onChange={(e) => setNewResId(e.target.value)}>
                  <option value="">— select resident —</option>
                  {(vaPool.length > 0 ? vaPool : residents.filter(r => r.status !== 'away')).map((r) => (
                    <option key={r.id} value={r.id}>{r.name} (PGY-{r.pgy})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mf">
              <button className="btn bgh" onClick={() => setOverrideState({ open: false, weekIndex: -1, weekLabel: '', currentRes: null })}>Cancel</button>
              <button className="btn bg" onClick={saveOverride} disabled={!newResId}>Save Override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
