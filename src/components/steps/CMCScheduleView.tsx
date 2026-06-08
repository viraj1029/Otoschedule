'use client';

import { useState } from 'react';
import type { CMCScheduleData, Resident } from '@/types';
import { parseDate, fmtShort, dk, addDays, HOLIDAYS, HOLIDAY_NAMES } from '@/lib/scheduler';

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
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
  schedule: CMCScheduleData;
  residents: Resident[];
  role?: string;
  onOverride?: (dateKey: string, newRes: Resident) => void;
}

export default function CMCScheduleView({ schedule, residents, role, onOverride }: Props) {
  const { days, counts, hours, bStart, bEnd } = schedule;
  const [overrideState, setOverrideState] = useState<{ open: boolean; dateKey: string; currentRes: Resident | null }>({ open: false, dateKey: '', currentRes: null });
  const [newResId, setNewResId] = useState('');

  function handleOverrideClick(dateKey: string, currentRes: Resident) {
    setNewResId(currentRes.id);
    setOverrideState({ open: true, dateKey, currentRes });
  }

  function saveOverride() {
    if (!overrideState.dateKey || !newResId || !onOverride) return;
    const res = residents.find(r => r.id === newResId);
    if (!res) return;
    onOverride(overrideState.dateKey, res);
    setOverrideState({ open: false, dateKey: '', currentRes: null });
  }

  // Build a lookup: dateKey → CMCDay
  const dayMap: Record<string, typeof days[0]> = {};
  days.forEach((d) => (dayMap[d.dateKey] = d));

  // Collect unique residents in the schedule
  const resSet = new Map<string, Resident>();
  days.forEach((d) => resSet.set(d.res.id, d.res));
  const poolResidents = [...resSet.values()].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  const bStartDate = parseDate(bStart);
  const bEndDate   = parseDate(bEnd);
  const months = getBlockMonths(bStart, bEnd);

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
            if (!day) return <div key={`e${i}-${j}`} style={{ background: 'var(--s2)', minHeight: 72, borderRadius: 6 }} />;
            const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const d = parseDate(key);
            if (d < bStartDate || d > bEndDate) return <div key={key} style={{ background: 'var(--s2)', minHeight: 72, borderRadius: 6, opacity: 0.3 }} />;
            const entry = dayMap[key];
            const isHol = HOLIDAYS.has(key);
            const isPW = entry?.isPowerWeekend;
            const dow = d.getDay();
            const isWknd = dow === 0 || dow === 6;
            const bgColor = isPW
              ? 'rgba(234,179,8,0.15)'
              : isHol ? 'rgba(251,146,60,0.12)'
              : isWknd ? 'rgba(0,0,0,0.04)'
              : undefined;
            return (
              <div
                key={key}
                style={{
                  background: bgColor, minHeight: 72, borderRadius: 6,
                  border: isPW ? '1px solid rgba(234,179,8,0.4)' : '1px solid var(--border)',
                  padding: '6px 7px', display: 'flex', flexDirection: 'column', gap: 4,
                  cursor: role === 'chief' && onOverride && entry ? 'pointer' : 'default',
                }}
                onClick={() => { if (role === 'chief' && onOverride && entry) handleOverrideClick(key, entry.res); }}
              >
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted2)', display: 'flex', justifyContent: 'space-between' }}>
                  <span>{day}</span>
                  <span style={{ display: 'flex', gap: 3 }}>
                    {isPW && <span style={{ fontSize: 9, fontWeight: 700, color: '#92400e', letterSpacing: 0.5 }}>PW</span>}
                    {isHol && <span style={{ fontSize: 9, color: 'var(--orange)' }}>🎉</span>}
                    {entry?.override && <span style={{ fontSize: 9, color: 'var(--orange)', fontWeight: 700 }}>OV</span>}
                  </span>
                </div>
                {entry ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    {avatar(entry.res, 18)}
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 600, lineHeight: 1.2 }}>
                        {entry.res.name.split(' ').pop()}
                      </div>
                      <div style={{ fontSize: 9, color: 'var(--muted)' }}>{entry.shiftHrs}h</div>
                    </div>
                  </div>
                ) : (
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontStyle: 'italic' }}>—</div>
                )}
                {isHol && (
                  <div style={{ fontSize: 8, color: 'var(--orange)', lineHeight: 1 }}>{HOLIDAY_NAMES[key]}</div>
                )}
              </div>
            );
          })}
        </div>,
      );
    }
    return rows;
  }

  return (
    <div>
      {/* Stats summary */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${poolResidents.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
        {poolResidents.map((res) => {
          const totalDays = counts[res.id] ?? 0;
          const totalHrs  = hours[res.id]  ?? 0;
          const wkdayDays = days.filter((d) => !d.isPowerWeekend && d.res.id === res.id).length;
          const pwDays    = days.filter((d) => d.isPowerWeekend  && d.res.id === res.id).length;
          return (
            <div key={res.id} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                {avatar(res, 24)}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600 }}>{res.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>PGY-{res.pgy}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Total Days</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: res.color }}>{totalDays}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Total Hours</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 20, fontWeight: 700, color: 'var(--muted2)' }}>{totalHrs}h</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Weekdays</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 600, color: 'var(--blue)' }}>{wkdayDays}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Power Wknds</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 16, fontWeight: 600, color: '#92400e' }}>{Math.round(pwDays / 3)}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ marginBottom: 10, fontSize: 12, color: 'var(--muted)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginRight: 14 }}>
          <span style={{ width: 12, height: 12, borderRadius: 2, background: 'rgba(234,179,8,0.35)', display: 'inline-block', border: '1px solid rgba(234,179,8,0.5)' }} />
          Power Weekend (Fri 12h + Sat 24h + Sun 24h)
        </span>
      </div>

      {/* Monthly calendar grids */}
      {months.map(({ year, month }) => (
        <div key={`${year}-${month}`} style={{ marginBottom: 28 }}>
          <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 10 }}>
            {MONTHS[month]} {year}
          </div>
          {/* Day-of-week header */}
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

      {/* Detailed weekly breakdown */}
      <div className="card" style={{ marginTop: 8 }}>
        <div className="ch"><div className="ct">Daily Assignment Log</div></div>
        <div className="cbt">
          <table className="ptable">
            <thead>
              <tr><th>Date</th><th>Day</th><th>Type</th><th>Resident</th><th>Hours</th></tr>
            </thead>
            <tbody>
              {days.map((entry) => {
                const d   = parseDate(entry.dateKey);
                const dow = d.getDay();
                const isHol = HOLIDAYS.has(entry.dateKey);
                const typeLabel = entry.isPowerWeekend
                  ? (dow === 5 ? 'Fri (PW)' : dow === 6 ? 'Sat (PW)' : 'Sun (PW)')
                  : isHol ? 'Holiday'
                  : 'Weekday';
                const typeColor = entry.isPowerWeekend ? '#92400e' : isHol ? 'var(--orange)' : 'var(--muted)';
                return (
                  <tr key={entry.dateKey}>
                    <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{fmtShort(entry.dateKey)}</td>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>{DOW_SHORT[dow]}</td>
                    <td><span style={{ fontSize: 11, fontWeight: 600, color: typeColor }}>{typeLabel}</span></td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {avatar(entry.res, 20)}
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{entry.res.name}</span>
                        <span className={`bdg ${entry.res.pgy >= 4 ? 'bg2' : 'bb'}`} style={{ fontSize: 9 }}>PGY-{entry.res.pgy}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{entry.shiftHrs}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Unused to avoid TS lint — remove if needed */}
      <span style={{ display: 'none' }}>{DOW_SHORT[0]}{fmtShort(bEnd)}</span>

      {/* Override modal */}
      {overrideState.open && (
        <div className="modal-bg open">
          <div className="modal">
            <div className="mh">
              <div>
                <div className="mt">Override CMC Assignment</div>
                <div className="ms">{overrideState.dateKey}</div>
              </div>
              <button className="mx" onClick={() => setOverrideState({ open: false, dateKey: '', currentRes: null })}>✕</button>
            </div>
            <div className="mb">
              <div className="fl">
                <label className="flb">Current: {overrideState.currentRes?.name ?? '—'}</label>
              </div>
              <div className="fl">
                <label className="flb">Assign to</label>
                <select value={newResId} onChange={(e) => setNewResId(e.target.value)}>
                  <option value="">— select resident —</option>
                  {residents.filter(r => r.status === 'active' && r.pgy >= 2 && r.pgy <= 4).map((r) => (
                    <option key={r.id} value={r.id}>{r.name} (PGY-{r.pgy})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mf">
              <button className="btn bgh" onClick={() => setOverrideState({ open: false, dateKey: '', currentRes: null })}>Cancel</button>
              <button className="btn bg" onClick={saveOverride} disabled={!newResId}>Save Override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
