'use client';

import type { VAScheduleData, Resident } from '@/types';
import { parseDate, fmtShort, dk, addDays, HOLIDAYS } from '@/lib/scheduler';

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

interface Props {
  schedule: VAScheduleData;
  residents: Resident[];
}

export default function VAScheduleView({ schedule, residents: _residents }: Props) {
  const { weeks, counts, days, hours } = schedule;

  // Collect unique residents
  const resSet = new Map<string, Resident>();
  weeks.forEach((w) => resSet.set(w.res.id, w.res));
  const poolResidents = [...resSet.values()].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  // Per-week day breakdown helper
  function weekDayBreakdown(wS: string, wE: string, res: Resident): { wkday: number; wknd: number; hol: number; totalHrs: number } {
    let wkday = 0, wknd = 0, hol = 0, totalHrs = 0;
    let d = parseDate(wS);
    const end = parseDate(wE);
    while (d <= end) {
      const key = dk(d);
      const dow = d.getDay();
      const isHol = HOLIDAYS.has(key);
      const isWknd = dow === 0 || dow === 6;
      if (isHol) { hol++; totalHrs += 24; }
      else if (isWknd) { wknd++; totalHrs += 24; }
      else { wkday++; totalHrs += 12; }
      d = addDays(d, 1);
    }
    void res;
    return { wkday, wknd, hol, totalHrs };
  }

  return (
    <div>
      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${poolResidents.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
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

      {/* Weekly schedule table */}
      <div className="card">
        <div className="ch"><div className="ct">VA Weekly Call Schedule</div></div>
        <div className="cbt">
          <table className="ptable">
            <thead>
              <tr>
                <th>#</th>
                <th>Week</th>
                <th>Resident</th>
                <th>Weekdays</th>
                <th>Weekends</th>
                <th>Holidays</th>
                <th>Hours</th>
              </tr>
            </thead>
            <tbody>
              {weeks.map((week, i) => {
                const bd = weekDayBreakdown(week.wS, week.wE, week.res);
                const isAlternate = i % 2 === 0;
                return (
                  <tr key={`${week.wS}-${week.wE}`} style={{ background: isAlternate ? undefined : 'rgba(0,0,0,0.02)' }}>
                    <td style={{ color: 'var(--muted)', fontSize: 11 }}>{i + 1}</td>
                    <td>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11 }}>
                        {fmtShort(week.wS)} – {fmtShort(week.wE)}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        {avatar(week.res, 20)}
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{week.res.name}</span>
                        <span className={`bdg ${week.res.pgy >= 4 ? 'bg2' : 'bb'}`} style={{ fontSize: 9 }}>PGY-{week.res.pgy}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{bd.wkday}</td>
                    <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{bd.wknd}</td>
                    <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{bd.hol}</td>
                    <td style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600 }}>{bd.totalHrs}h</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
