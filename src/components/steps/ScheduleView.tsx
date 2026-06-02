'use client';

import { useState, useEffect, type ReactElement } from 'react';
import type { Block, Resident, Request, ScheduleData, Tab, Role } from '@/types';
import { HOLIDAYS, parseDate, fmtShort, dk, addDays } from '@/lib/scheduler';
import { api } from '../App';
import OverrideModal from '../modals/OverrideModal';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface Props {
  schedule: ScheduleData | null;
  residents: Resident[];
  allRequests: Request[];
  block: Block | null;
  role: Role;
  onScheduleChanged: (s: ScheduleData | null) => void;
  onBlockChanged: (b: Block | null) => void;
  onRegenerate: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

function avatar(res: Resident, size = 26) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: res.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 700, color: '#000', flexShrink: 0,
    }}>
      {res.name.slice(0, 2).toUpperCase()}
    </div>
  );
}

function getResRequests(allRequests: Request[], resId: string) {
  const weekends = new Set(allRequests.filter((r) => r.resident_id === resId && r.type === 'weekend').map((r) => r.date));
  return { weekends };
}

export default function ScheduleView({
  schedule, residents, allRequests, block, role, onScheduleChanged, onBlockChanged, onRegenerate, showToast,
}: Props) {
  const [tab, setTab] = useState<Tab>('calendar');
  const [calYear, setCalYear] = useState<number>(0);
  const [calMonth, setCalMonth] = useState<number>(0);
  const [hrsMonth, setHrsMonth] = useState<{ year: number; month: number } | null>(null);
  const [published, setPublished] = useState<boolean>(block?.published ?? false);
  const [overrideKey, setOverrideKey] = useState<string | null>(null);

  useEffect(() => {
    if (schedule) {
      const start = parseDate(schedule.bStart);
      setCalYear(start.getFullYear());
      setCalMonth(start.getMonth());
      setHrsMonth({ year: start.getFullYear(), month: start.getMonth() });
    }
    setPublished(block?.published ?? false);
  }, [schedule, block?.published]);

  if (!schedule) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
        No schedule generated yet.
      </div>
    );
  }

  // Build maps
  const jrMap: Record<string, typeof schedule.juniorDays[0]> = {};
  schedule.juniorDays.forEach((d) => (jrMap[d.dateKey] = d));
  const srMap: Record<string, typeof schedule.seniorWeeks[0]> = {};
  schedule.seniorWeeks.forEach((w) => {
    let d = parseDate(w.wS);
    const end = parseDate(w.wE);
    while (d <= end) { srMap[dk(d)] = w; d = addDays(d, 1); }
  });
  const resBkpDayKeys = new Set(schedule.resBkpDayKeys ?? []);

  // Stats
  const s24 = schedule.juniorDays.filter((d) => d.shiftHrs === 24).length;
  const s12 = schedule.juniorDays.filter((d) => d.shiftHrs === 12).length;

  async function togglePublish() {
    const next = !published;
    setPublished(next);
    await api('/block/publish', 'POST', { published: next });
    if (block) onBlockChanged({ ...block, published: next });
    if (schedule) onScheduleChanged({ ...schedule, published: next });
    showToast(next ? 'Schedule published — residents can now view it' : 'Schedule unpublished');
  }

  function fmtDate(s: string) {
    return parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── Calendar tab ──────────────────────────────────────────────────────────────
  function renderCalendar() {
    const today = new Date();
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const dim = new Date(calYear, calMonth + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);

    const rows: ReactElement[] = [];
    let wn = 1;
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      rows.push(
        <div key={`wl-${i}`} className="cwl">W{wn++}</div>
      );
      week.forEach((day, j) => {
        if (!day) { rows.push(<div key={`empty-${i}-${j}`} className="ccell coff" />); return; }
        const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const d = parseDate(key);
        const dow = d.getDay();
        const isWk = dow === 0 || dow === 6;
        const isHol = HOLIDAYS.has(key);
        const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;
        const jr = jrMap[key];
        const sr = srMap[key];
        const isResBkpDay = resBkpDayKeys.has(key);

        let chips = '';
        const rc = (color: string, label: string) =>
          `<div class="chip" style="background:${color}22;color:${color};border:1px solid ${color}44">${label}</div>`;

        if (sr) chips += rc(sr.res.color, `${sr.isBackup ? '🔬' : '🔶'} ${sr.res.name}${sr.isBackup ? ' (bkp)' : ''}`);
        if (isResBkpDay) {
          const rb = (schedule!.resBkpDays ?? []).find((d) => d.dateKey === key);
          if (rb) chips += rc(rb.res.color, `🔬 ${rb.res.name} (bkp)`);
        }
        if (jr) {
          const label = isHol ? `🎉 ${jr.res.name} 24h`
            : jr.type === 'saturday' ? `🟣 ${jr.res.name} 24h`
            : jr.type === 'fri-pair' ? `🔗Fri ${jr.res.name} 12h`
            : jr.type === 'sun-pair' ? `🔗Sun ${jr.res.name} 24h`
            : `${jr.res.name} ${jr.shiftHrs}h`;
          chips += rc(jr.res.color, label);
          if ((isWk || isHol) && jr.res.hospital === 'CUH') chips += `<div class="chip ccuh">🏥 CUH</div>`;
          if ((isWk || isHol) && jr.res.hospital === 'PMH') {
            chips += `<div class="chip csat">🏥 PMH</div>`;
            chips += jr.cuhRounder
              ? rc(jr.cuhRounder.color, `CUH:${jr.cuhRounder.name}`)
              : `<div class="chip cwrn">⚠CUH?</div>`;
          }
        }

        rows.push(
          <div
            key={key}
            className={`ccell${isWk ? ' cwk' : ''}${isHol ? ' chol' : ''}`}
            onClick={role === 'chief' ? () => setOverrideKey(key) : undefined}
          >
            <div className={`cdate${isToday ? ' tod' : ''}`}>{day}{isHol ? ' 🎉' : ''}</div>
            <div className="cchips" dangerouslySetInnerHTML={{ __html: chips }} />
          </div>
        );
      });
    }
    return rows;
  }

  // ── Senior tab ────────────────────────────────────────────────────────────────
  function renderSeniorTab() {
    return schedule!.seniorWeeks.map((w, i) => (
      <div key={i} className="wrow" style={w.isBackup ? { borderLeft: '3px solid var(--pink)' } : {}}>
        <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--muted)', lineHeight: 1.7 }}>
          {fmtShort(w.wS)}<br />→ {fmtShort(w.wE)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {avatar(w.res)}
          <div>
            <div style={{ fontSize: 13, fontWeight: 500 }}>
              {w.res.name}
              {w.isBackup && <span className="bdg bpk" style={{ fontSize: 9, marginLeft: 6 }}>Backup</span>}
            </div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              PGY-{w.res.pgy} · {w.res.hospital}
              {w.isBackup ? ' · Research backup week' : ' · Rounds both hospitals on weekends'}
            </div>
          </div>
        </div>
        <span />
      </div>
    ));
  }

  // ── Junior tab ────────────────────────────────────────────────────────────────
  function renderJuniorTab() {
    const TYPE_LABEL: Record<string, string> = {
      weekday: 'Weekday', 'fri-pair': 'Fri (paired)', 'sun-pair': 'Sun (paired)',
      saturday: 'Saturday 24h', sunday: 'Sunday',
    };
    return schedule!.juniorDays.map((jd, i) => {
      const d = parseDate(jd.dateKey);
      const dow = DOW[d.getDay()];
      const isHol = HOLIDAYS.has(jd.dateKey);
      let rc = 'jday';
      if (jd.paired) rc += ' jpair';
      else if (jd.type === 'saturday') rc += ' jsat';
      if (isHol) rc += ' jhol';
      let ri: ReactElement | null = null;
      if (jd.isWeekend || isHol) {
        if (jd.res.hospital === 'CUH') ri = <span style={{ color: 'var(--green)', fontSize: 11 }}>🟢 CUH</span>;
        else {
          ri = <>
            <span style={{ color: 'var(--purple)', fontSize: 11 }}>🟣 PMH</span>
            {jd.cuhRounder
              ? <span style={{ color: 'var(--green)', fontSize: 11 }}> ✦ CUH:{jd.cuhRounder.name}</span>
              : <span style={{ color: 'var(--red)', fontSize: 11 }}> ⚠ CUH needed</span>
            }
          </>;
        }
      }
      return (
        <div key={jd.dateKey + i} className={rc}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: 'var(--muted)' }}>{jd.dateKey}</div>
            <div style={{ fontSize: 10, color: 'var(--muted2)' }}>{dow}</div>
          </div>
          <div>
            <span className={`bdg ${jd.shiftHrs === 24 ? 'bp' : 'bb'}`} style={{ fontSize: 9 }}>{jd.shiftHrs}h</span>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>
              {TYPE_LABEL[jd.type] ?? jd.type}{isHol ? ' 🎉' : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {avatar(jd.res)}
            <span style={{ fontSize: 13, fontWeight: 500 }}>{jd.res.name}</span>
            <span className={`bdg ${jd.res.hospital === 'CUH' ? 'bgr' : 'bp'}`} style={{ fontSize: 9 }}>{jd.res.hospital}</span>
            {ri}
          </div>
          <div>{jd.override && <span className="bdg bo" style={{ fontSize: 9 }}>override</span>}</div>
        </div>
      );
    });
  }

  // ── Hours tab ─────────────────────────────────────────────────────────────────
  function getBlockMonths() {
    const months: { year: number; month: number }[] = [];
    let d = parseDate(schedule!.bStart);
    const end = parseDate(schedule!.bEnd);
    while (d <= end) {
      const y = d.getFullYear(), m = d.getMonth();
      if (!months.find((x) => x.year === y && x.month === m)) months.push({ year: y, month: m });
      d = addDays(d, 28);
    }
    const ly = end.getFullYear(), lm = end.getMonth();
    if (!months.find((x) => x.year === ly && x.month === lm)) months.push({ year: ly, month: lm });
    return months;
  }

  function renderHoursTab() {
    const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active')
      .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
    const bd = jrs.map((res) => {
      const days = schedule!.juniorDays.filter((d) => d.res.id === res.id);
      const s12 = days.filter((d) => d.shiftHrs === 12).length;
      const s24 = days.filter((d) => d.shiftHrs === 24).length;
      const total = days.reduce((a, d) => a + d.shiftHrs, 0);
      return { res, s12, s24, total };
    });
    const tWd = schedule!.juniorDays.filter((d) => !d.isWeekend && !HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);
    const tSat = schedule!.juniorDays.filter((d) => parseDate(d.dateKey).getDay() === 6 && !HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);
    const tSun = schedule!.juniorDays.filter((d) => parseDate(d.dateKey).getDay() === 0 && !HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);
    const tHol = schedule!.juniorDays.filter((d) => HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);

    const months = getBlockMonths();
    const curHrs = hrsMonth ?? months[0];
    const prefix = curHrs ? `${curHrs.year}-${String(curHrs.month + 1).padStart(2, '0')}-` : '';
    const dim = curHrs ? new Date(curHrs.year, curHrs.month + 1, 0).getDate() : 30;
    const wks = Math.ceil(dim / 7);

    const monthRows = jrs.map((res) => {
      const days = schedule!.juniorDays.filter((d) => d.res.id === res.id && d.dateKey.startsWith(prefix));
      const s12 = days.filter((d) => d.shiftHrs === 12).length;
      const s24 = days.filter((d) => d.shiftHrs === 24).length;
      const total = days.reduce((a, d) => a + d.shiftHrs, 0);
      return { res, s12, s24, total };
    });
    const mAll = schedule!.juniorDays.filter((d) => d.dateKey.startsWith(prefix));
    const mTotal = mAll.reduce((a, d) => a + d.shiftHrs, 0);
    const ms12 = mAll.filter((d) => d.shiftHrs === 12).length;
    const ms24 = mAll.filter((d) => d.shiftHrs === 24).length;

    return (
      <div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
          <div className="card">
            <div className="ch"><div className="ct">Block Total Hours</div></div>
            <div className="cbt">
              <table className="htable">
                <thead><tr><th>Resident</th><th>PGY</th><th className="r">12h</th><th className="r">24h</th><th className="r">Total</th></tr></thead>
                <tbody>
                  {bd.map(({ res, s12, s24, total }) => (
                    <tr key={res.id}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{avatar(res)}<span style={{ fontWeight: 500 }}>{res.name}</span></div></td>
                      <td><span className="bdg bb">PGY-{res.pgy}</span></td>
                      <td className="r"><span className="hn">{s12}</span></td>
                      <td className="r"><span className="hn">{s24}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--green)' }}>{total}h</span></td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                    <td colSpan={2} style={{ fontWeight: 600, fontSize: 12, padding: '10px 12px' }}>TOTAL</td>
                    <td className="r"><span className="hn">{bd.reduce((a, d) => a + d.s12, 0)}</span></td>
                    <td className="r"><span className="hn">{bd.reduce((a, d) => a + d.s24, 0)}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{bd.reduce((a, d) => a + d.total, 0)}h</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="card">
            <div className="ch"><div className="ct">Hours by Type</div></div>
            <div className="cb">
              {[
                { l: 'Weekday (12h)', v: tWd, c: 'var(--blue)' },
                { l: 'Saturday (24h)', v: tSat, c: 'var(--purple)' },
                { l: 'Sunday (24h)', v: tSun, c: 'var(--teal)' },
                { l: 'Holiday (24h)', v: tHol, c: 'var(--orange)' },
              ].map((s) => (
                <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,.04)' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.l}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: s.c }}>{s.v}h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card">
          <div className="ch">
            <div className="ct">Monthly Breakdown</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {months.map((m) => (
                <button
                  key={`${m.year}-${m.month}`}
                  className={`btn bsm ${curHrs && curHrs.year === m.year && curHrs.month === m.month ? 'bg' : 'bgh'}`}
                  onClick={() => setHrsMonth(m)}
                >
                  {MONTHS[m.month].slice(0, 3)} {m.year}
                </button>
              ))}
            </div>
          </div>
          <div className="cbt">
            <table className="htable">
              <thead><tr><th>Resident</th><th>PGY</th><th>Hosp</th><th className="r">12h</th><th className="r">24h</th><th className="r">Hours</th><th className="r">Avg/Wk</th></tr></thead>
              <tbody>
                {monthRows.map(({ res, s12, s24, total }) => (
                  <tr key={res.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{avatar(res)}<span style={{ fontWeight: 500 }}>{res.name}</span></div></td>
                    <td><span className="bdg bb">PGY-{res.pgy}</span></td>
                    <td><span className={`bdg ${res.hospital === 'CUH' ? 'bgr' : 'bp'}`}>{res.hospital}</span></td>
                    <td className="r"><span className="hn">{s12}</span></td>
                    <td className="r"><span className="hn">{s24}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--green)' }}>{total}h</span></td>
                    <td className="r"><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--muted)' }}>{wks > 0 ? Math.round(total / wks) : 0}h/wk</span></td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(255,255,255,.03)' }}>
                  <td colSpan={3} style={{ fontWeight: 600, fontSize: 12, padding: '10px 12px' }}>MONTH TOTAL</td>
                  <td className="r"><span className="hn">{ms12}</span></td>
                  <td className="r"><span className="hn">{ms24}</span></td>
                  <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{mTotal}h</span></td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // ── Equity tab ────────────────────────────────────────────────────────────────
  function eqBars(data: { name: string; val: number; color: string }[], unit: string) {
    const max = Math.max(...data.map((d) => d.val), 1);
    return data.sort((a, b) => b.val - a.val).map((d) => (
      <div key={d.name} className="erow">
        <div className="ename">{d.name}</div>
        <div className="etrack">
          <div className="efill" style={{ width: Math.round(d.val / max * 100) + '%', background: d.color }} />
        </div>
        <div className="eval">{d.val}{unit}</div>
      </div>
    ));
  }

  function renderEquityTab() {
    const srs = residents.filter((r) => r.pgy >= 4 && r.status === 'active');
    const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');
    const srW: Record<string, number> = {};
    srs.forEach((r) => (srW[r.id] = 0));
    schedule!.seniorWeeks.filter((w) => !w.isBackup).forEach((w) => { srW[w.res.id] = (srW[w.res.id] ?? 0) + 1; });
    const jrH: Record<string, number> = {};
    jrs.forEach((r) => { jrH[r.id] = schedule!.juniorDays.filter((d) => d.res.id === r.id).reduce((a, d) => a + d.shiftHrs, 0); });
    const jrH24: Record<string, number> = {};
    jrs.forEach((r) => { jrH24[r.id] = schedule!.juniorDays.filter((d) => d.res.id === r.id && d.shiftHrs === 24).length; });
    const wkOff: Record<string, number> = {};
    residents.forEach((r) => { const { weekends } = getResRequests(allRequests, r.id); wkOff[r.id] = weekends.size; });

    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
        <div className="card">
          <div className="ch"><div className="ct">Senior Call Weeks</div></div>
          <div className="cb">{eqBars(srs.map((r) => ({ name: r.name, val: srW[r.id] ?? 0, color: r.color })), 'wks')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Junior Call Hours</div></div>
          <div className="cb">{eqBars(jrs.map((r) => ({ name: r.name, val: jrH[r.id] ?? 0, color: r.color })), 'h')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">24h Shifts</div></div>
          <div className="cb">{eqBars(jrs.map((r) => ({ name: r.name, val: jrH24[r.id] ?? 0, color: r.color })), 'shifts')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Weekend Requests</div></div>
          <div className="cb">{eqBars([...residents].sort((a, b) => b.pgy - a.pgy).map((r) => ({ name: r.name, val: wkOff[r.id] ?? 0, color: r.color })), 'days')}</div>
        </div>
      </div>
    );
  }

  // ── CSV export ────────────────────────────────────────────────────────────────
  function exportCSV() {
    const rows = [['Date','Day','Holiday','Senior','Sr PGY','Junior','Jr PGY','Jr Hospital','Shift Type','Shift Hours','CUH Rounder','Override']];
    schedule!.juniorDays.forEach((jd) => {
      const d = parseDate(jd.dateKey);
      const sr = srMap[jd.dateKey];
      rows.push([
        jd.dateKey, DOW[d.getDay()], HOLIDAYS.has(jd.dateKey) ? 'Yes' : 'No',
        sr ? sr.res.name : '', sr ? `PGY-${sr.res.pgy}` : '',
        jd.res.name, `PGY-${jd.res.pgy}`, jd.res.hospital,
        jd.type, `${jd.shiftHrs}h`, jd.cuhRounder ? jd.cuhRounder.name : '',
        jd.override ? 'Yes' : 'No',
      ]);
    });
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'oto_call_schedule.csv'; a.click();
    URL.revokeObjectURL(url);
    showToast('CSV exported');
  }

  function exportICS() {
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//OTO Scheduler//UTSW//EN\n';
    schedule!.juniorDays.forEach((jd) => {
      const ds = jd.dateKey.replace(/-/g, '');
      const de = dk(addDays(parseDate(jd.dateKey), 1)).replace(/-/g, '');
      ics += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${ds}\nDTEND;VALUE=DATE:${de}\nSUMMARY:Jr Call – ${jd.res.name} · ${jd.shiftHrs}h\nEND:VEVENT\n`;
    });
    schedule!.seniorWeeks.forEach((w) => {
      const ds = w.wS.replace(/-/g, '');
      const de = dk(addDays(parseDate(w.wE), 1)).replace(/-/g, '');
      ics += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${ds}\nDTEND;VALUE=DATE:${de}\nSUMMARY:${w.isBackup ? 'Research Backup' : 'Sr Call'} – ${w.res.name}\nEND:VEVENT\n`;
    });
    ics += 'END:VCALENDAR';
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'oto_call_schedule.ics'; a.click();
    URL.revokeObjectURL(url);
    showToast('iCal exported');
  }

  function navCal(dir: number) {
    let m = calMonth + dir; let y = calYear;
    if (m > 11) { m = 0; y++; } if (m < 0) { m = 11; y--; }
    setCalYear(y); setCalMonth(m);
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: 'calendar', label: '📅 Calendar' },
    { id: 'senior', label: '🔶 Senior Call' },
    { id: 'junior', label: '🔷 Junior Call' },
    ...(role === 'chief' ? [
      { id: 'hours' as Tab, label: '⏱ Hours' },
      { id: 'equity' as Tab, label: '📊 Equity' },
    ] : []),
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <div className="page-title">{schedule.blockName}</div>
        {role === 'chief' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn bgh bsm" onClick={onRegenerate}>← Regenerate</button>
            <button
              className={`btn bsm ${published ? 'bg' : 'bgh'}`}
              onClick={togglePublish}
            >
              {published ? '✓ Published — Unpublish' : 'Publish to Residents'}
            </button>
            <button className="btn bgh bsm" onClick={exportCSV}>↓ CSV</button>
            <button className="btn bg bsm" onClick={exportICS}>📅 iCal</button>
          </div>
        )}
      </div>

      <div className="page-sub">
        {fmtDate(schedule.bStart)} → {fmtDate(schedule.bEnd)}
      </div>

      {/* Stats */}
      <div className="srow" style={{ gridTemplateColumns: 'repeat(5,1fr)' }}>
        {[
          { l: 'Senior Weeks', v: schedule.seniorWeeks.filter((w) => !w.isBackup).length, c: 'var(--gold)' },
          { l: 'Research Backup', v: `${(schedule.resBkpWeeks ?? []).length}+${(schedule.resBkpDays ?? []).length}`, c: 'var(--pink)' },
          { l: 'Junior Days', v: schedule.juniorDays.length, c: 'var(--blue)' },
          { l: '12h Shifts', v: s12, c: 'var(--teal)' },
          { l: '24h Shifts', v: s24, c: 'var(--purple)' },
        ].map((s) => (
          <div key={s.l} className="sc">
            <div className="sn" style={{ color: s.c }}>{s.v}</div>
            <div className="sl">{s.l}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
        {[
          { cls: 'csr', label: 'Senior on call' },
          { cls: 'cjr', label: 'Junior weekday (12h)' },
          { cls: 'csun', label: 'Fri+Sun pair' },
          { cls: 'csat', label: 'Saturday (24h)' },
          { cls: 'chc', label: 'Holiday (24h)' },
          { cls: 'ccuh', label: 'CUH weekend rounder' },
          { cls: 'cres', label: 'Research backup' },
        ].map(({ cls, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 10, height: 10, borderRadius: 2 }} className={`chip ${cls}`} />
            {label}
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="tabrow">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tabbtn${tab === t.id ? ' active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'calendar' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <button className="btn bgh bsm" onClick={() => navCal(-1)}>‹ Prev</button>
            <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center' }}>
              {MONTHS[calMonth]} {calYear}
            </div>
            <button className="btn bgh bsm" onClick={() => navCal(1)}>Next ›</button>
          </div>
          <div className="calgrid">
            <div className="cdow" style={{ background: 'var(--s2)' }}>Wk</div>
            {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
              <div key={d} className="cdow">{d}</div>
            ))}
            {renderCalendar()}
          </div>
        </div>
      )}

      {tab === 'senior' && (
        <div className="card">
          <div className="ch"><div className="ct">Senior Call — Weekly Blocks</div></div>
          <div className="cb">{renderSeniorTab()}</div>
        </div>
      )}

      {tab === 'junior' && (
        <div className="card">
          <div className="ch"><div className="ct">Junior Call — Daily Rotation</div></div>
          <div className="cb">{renderJuniorTab()}</div>
        </div>
      )}

      {tab === 'hours' && renderHoursTab()}
      {tab === 'equity' && renderEquityTab()}

      {/* Override modal */}
      {role === 'chief' && (
        <OverrideModal
          open={overrideKey !== null}
          dateKey={overrideKey}
          schedule={schedule}
          residents={residents}
          onSave={(updated) => {
            onScheduleChanged(updated);
            setOverrideKey(null);
          }}
          onClose={() => setOverrideKey(null)}
          showToast={showToast}
        />
      )}
    </div>
  );
}
