'use client';

import React, { useState, useEffect, type ReactElement } from 'react';
import type { Block, Resident, Request, ScheduleData, CMCScheduleData, VAScheduleData, AnyScheduleData, Schedule, Tab, Role } from '@/types';
import { HOLIDAYS, HOLIDAY_NAMES, TRAUMA_WEEKS, parseDate, fmtShort, dk, addDays } from '@/lib/scheduler';
import { api } from '../App';
import OverrideModal from '../modals/OverrideModal';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface Props {
  schedule: AnyScheduleData | null;
  schedules?: Schedule[];          // all schedule metadata (chief only)
  activeScheduleId?: string | null;
  residents: Resident[];
  allRequests: Request[];
  block: Block | null;
  role: Role;
  onScheduleChanged: (s: AnyScheduleData | null) => void;
  onBlockChanged: (b: Block | null) => void;
  onScheduleSelected?: (id: string) => void;
  onScheduleListChanged?: () => void;
  onScheduleDeleted?: (id: string) => Promise<void>;
  onRegenerate: () => void;
  showToast: (msg: string, err?: boolean) => void;
  currentResId?: string | null;
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

type HospitalTab = 'cuh_pmh' | 'va' | 'cmc';

export default function ScheduleView({
  schedule, schedules = [], activeScheduleId, residents, allRequests, block, role,
  onScheduleChanged, onBlockChanged, onScheduleSelected, onScheduleListChanged, onScheduleDeleted, onRegenerate, showToast, currentResId,
}: Props) {
  const [tab, setTab] = useState<Tab>(role === 'resident' ? 'stats' : 'calendar');
  const [statsMonth, setStatsMonth] = useState<{ year: number; month: number } | null>(null);
  const [calYear, setCalYear] = useState<number>(0);
  const [calMonth, setCalMonth] = useState<number>(0);
  const [hrsMonth, setHrsMonth] = useState<{ year: number; month: number } | null>(null);
  const [published, setPublished] = useState<boolean>(schedule?.published ?? block?.published ?? false);
  const [overrideKeys, setOverrideKeys] = useState<string[]>([]);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  const [editingRounding, setEditingRounding] = useState<string | null>(null);

  const initialHospTab: HospitalTab = schedule?.type === 'va' ? 'va' : schedule?.type === 'cmc' ? 'cmc' : 'cuh_pmh';
  const [hospitalTab, setHospitalTab] = useState<HospitalTab>(initialHospTab);
  const [tabLoading, setTabLoading] = useState(false);
  const [vaOverride, setVaOverride] = useState<{ open: boolean; weekIndex: number }>({ open: false, weekIndex: -1 });
  const [cmcOverride, setCmcOverride] = useState<{ open: boolean; dateKey: string }>({ open: false, dateKey: '' });
  const [poolOverrideResId, setPoolOverrideResId] = useState('');

  useEffect(() => {
    if (schedule) {
      const start = parseDate(schedule.bStart);
      setCalYear(start.getFullYear());
      setCalMonth(start.getMonth());
      setHrsMonth({ year: start.getFullYear(), month: start.getMonth() });
      // Per-schedule published state: prefer the DB-injected flag on the schedule object
      setPublished(schedule.published ?? block?.published ?? false);
    }
  }, [schedule, block?.published]);

  async function switchToTab(tab: HospitalTab) {
    setHospitalTab(tab);
    setSelectMode(false);
    setSelectedKeys([]);
    const match = schedules.filter((s) => (s.schedule_type ?? 'cuh_pmh') === tab)[0];
    if (!match) return;
    const currentSchedId = (schedule as AnyScheduleData & { _scheduleId?: string })?._scheduleId ?? activeScheduleId;
    if (match.id === currentSchedId) return;
    setTabLoading(true);
    try {
      await onScheduleSelected?.(match.id);
    } finally {
      setTimeout(() => setTabLoading(false), 300);
    }
  }

  async function persistSchedule(updated: AnyScheduleData) {
    const schedId = (schedule as AnyScheduleData & { _scheduleId?: string })?._scheduleId ?? activeScheduleId;
    onScheduleChanged(updated);
    if (schedId) {
      try { await api('/schedule', 'PUT', { id: schedId, scheduleData: updated }); } catch { /* non-critical */ }
    }
  }

  if (!schedule && schedules.filter((s) => (s.schedule_type ?? 'cuh_pmh') === hospitalTab).length === 0 && hospitalTab === 'cuh_pmh') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 300, color: 'var(--muted)' }}>
        No schedule generated yet.
      </div>
    );
  }

  async function togglePublish() {
    const next = !published;
    setPublished(next);
    const scheduleId = (schedule as AnyScheduleData & { _scheduleId?: string })?._scheduleId ?? activeScheduleId;
    await api('/block/publish', 'POST', { published: next, scheduleId });
    if (block) onBlockChanged({ ...block, published: next });
    if (schedule) onScheduleChanged({ ...schedule, published: next });
    onScheduleListChanged?.();
    showToast(next ? 'Schedule published — residents can now view it' : 'Schedule unpublished');
  }

  function fmtDate(s: string) {
    return parseDate(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // ── CUH/PMH schedule data ─────────────────────────────────────────────────────
  const cuhSched = (schedule && schedule.type !== 'cmc' && schedule.type !== 'va') ? schedule as ScheduleData : null;

  // Build maps (only used when cuhSched is present)
  const jrMap: Record<string, ScheduleData['juniorDays'][0]> = {};
  if (cuhSched) cuhSched!.juniorDays.forEach((d) => (jrMap[d.dateKey] = d));
  const srMap: Record<string, ScheduleData['seniorWeeks'][0]> = {};
  if (cuhSched) {
    cuhSched!.seniorWeeks.forEach((w) => {
      let d = parseDate(w.wS);
      const end = parseDate(w.wE);
      while (d <= end) { srMap[dk(d)] = w; d = addDays(d, 1); }
    });
  }
  const resBkpDayKeys = new Set(cuhSched?.resBkpDayKeys ?? []);

  // ── VA / CMC schedule data ────────────────────────────────────────────────────
  const vaSched   = schedule?.type === 'va'  ? schedule as VAScheduleData  : null;
  const cmcDayData = schedule?.type === 'cmc' ? schedule as CMCScheduleData : null;

  const vaWeekMap: Record<string, number> = {};
  if (vaSched) vaSched.weeks.forEach((w, i) => {
    let d = parseDate(w.wS); const end = parseDate(w.wE);
    while (d <= end) { vaWeekMap[dk(d)] = i; d = addDays(d, 1); }
  });
  const cmcDayMap: Record<string, CMCScheduleData['days'][0]> = {};
  if (cmcDayData) cmcDayData.days.forEach((d) => (cmcDayMap[d.dateKey] = d));

  // ── Calendar rendering (shared by screen + print) ────────────────────────────
  function buildChips(key: string, isWk: boolean, isHol: boolean, isTrauma = false): string {
    const rc = (color: string, label: string) =>
      `<div class="chip" style="background:${color}22;color:${color};border:1px solid ${color}44">${label}</div>`;
    // Plain text row for CUH/PMH rounding — no background box, no dot
    const rt = (_color: string, label: string) =>
      `<div class="rrt">${label}</div>`;

    // VA mode
    if (vaSched) {
      const idx = vaWeekMap[key];
      if (idx === undefined) return '';
      const w = vaSched.weeks[idx];
      return rc(w.res.color, `🔶 ${w.res.name}${w.override ? ' ✎' : ''}`);
    }
    // CMC mode
    if (cmcDayData) {
      const entry = cmcDayMap[key];
      if (!entry) return '';
      return rc(entry.res.color, `${entry.res.name}${entry.override ? ' ✎' : ''}`);
    }

    const sr = srMap[key];
    const jr = jrMap[key];
    const isResBkpDay = resBkpDayKeys.has(key);
    const dow = parseDate(key).getDay();
    let chips = '';

    if (jr) {
      const label = isHol ? `🎉${isTrauma ? ' 🚨' : ''} ${jr.res.name}`
        : jr.type === 'saturday' ? `🟣${isTrauma ? ' 🚨' : ''} ${jr.res.name}`
        : (jr.type === 'fri-pair' || jr.type === 'sun-pair') ? `🔗${isTrauma ? ' 🚨' : ''} ${jr.res.name}`
        : isTrauma ? `🚨 ${jr.res.name}`
        : jr.res.name;
      chips += rc(jr.res.color, label);

      if (isWk || isHol) {
        const ov = (cuhSched?.roundingOverrides ?? {})[key];
        if (dow === 6) {
          // Saturday
          const friJr = jrMap[dk(addDays(parseDate(key), -1))];
          // CUH rounding: override takes priority, else Sat call if CUH, else Fri call post-call
          if (ov?.cuhResId !== undefined) {
            if (ov.cuhResId) {
              const ovRes = residents.find(r => r.id === ov.cuhResId);
              if (ovRes) chips += rt(ovRes.color, `CUH: ${ovRes.name}`);
            }
          } else if (jr.res.hospital === 'CUH') {
            chips += rt(jr.res.color, `CUH: ${jr.res.name}`);
          } else if (friJr?.res.hospital === 'CUH') {
            chips += rt(friJr.res.color, `CUH: ${friJr.res.name}`);
          }
          // PMH rounding: override takes priority, else Sat call if PMH, else Parkland intern
          if (ov?.pmhResId === '__intern__') {
            chips += rt('var(--purple)', 'PMH: Parkland intern');
          } else if (ov?.pmhResId) {
            const ovRes = residents.find(r => r.id === ov.pmhResId);
            chips += ovRes
              ? rt(ovRes.color, `PMH: ${ovRes.name}`)
              : jr.res.hospital === 'PMH' ? rt(jr.res.color, `PMH: ${jr.res.name}`) : rt('var(--purple)', 'PMH: Parkland intern');
          } else {
            chips += jr.res.hospital === 'PMH'
              ? rt(jr.res.color, `PMH: ${jr.res.name}`)
              : rt('var(--purple)', 'PMH: Parkland intern');
          }
        } else if (dow === 0) {
          // Sunday
          const satJr = jrMap[dk(addDays(parseDate(key), -1))];
          // CUH rounding: override takes priority, else Sun call if CUH, else Sat call post-call
          if (ov?.cuhResId !== undefined) {
            if (ov.cuhResId) {
              const ovRes = residents.find(r => r.id === ov.cuhResId);
              if (ovRes) chips += rt(ovRes.color, `CUH: ${ovRes.name}`);
            }
          } else if (jr.res.hospital === 'CUH') {
            chips += rt(jr.res.color, `CUH: ${jr.res.name}`);
          } else if (satJr?.res.hospital === 'CUH') {
            chips += rt(satJr.res.color, `CUH: ${satJr.res.name}`);
          }
          // PMH rounding: override takes priority, else Sun call if PMH, else Parkland intern
          if (ov?.pmhResId === '__intern__') {
            chips += rt('var(--purple)', 'PMH: Parkland intern');
          } else if (ov?.pmhResId) {
            const ovRes = residents.find(r => r.id === ov.pmhResId);
            chips += ovRes
              ? rt(ovRes.color, `PMH: ${ovRes.name}`)
              : jr.res.hospital === 'PMH' ? rt(jr.res.color, `PMH: ${jr.res.name}`) : rt('var(--purple)', 'PMH: Parkland intern');
          } else {
            chips += jr.res.hospital === 'PMH'
              ? rt(jr.res.color, `PMH: ${jr.res.name}`)
              : rt('var(--purple)', 'PMH: Parkland intern');
          }
        } else {
          // Holiday on a weekday
          if (jr.res.hospital === 'CUH') chips += rt(jr.res.color, `CUH: ${jr.res.name}`);
          if (jr.res.hospital === 'PMH') {
            chips += rt(jr.res.color, `PMH: ${jr.res.name}`);
            chips += jr.cuhRounder
              ? rt(jr.cuhRounder.color, `CUH: ${jr.cuhRounder.name}`)
              : `<div class="rrt"><span class="rrdot" style="background:var(--red)"></span>⚠ CUH?</div>`;
          }
        }
      }
    }

    if (sr) chips += rc(sr.res.color, `${sr.isBackup ? '🔬' : '🔶'} ${sr.res.name}${sr.isBackup ? ' (bkp)' : ''}`);
    if (isResBkpDay) {
      const rb = (cuhSched?.resBkpDays ?? []).find((d) => d.dateKey === key);
      if (rb) chips += rc(rb.res.color, `🔬 ${rb.res.name} (bkp)`);
    }
    return chips;
  }

  function renderCalendarMonth(year: number, month: number, forPrint = false): ReactElement[] {
    const today = new Date();
    const firstDay = new Date(year, month, 1).getDay();
    const dim = new Date(year, month + 1, 0).getDate();
    const cells: (number | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= dim; d++) cells.push(d);

    const rows: ReactElement[] = [];
    let wn = 1;
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      if (!forPrint) rows.push(<div key={`wl-${i}`} className="cwl">W{wn++}</div>);
      week.forEach((day, j) => {
        const pfx = forPrint ? 'p' : '';
        if (!day) { rows.push(<div key={`empty-${i}-${j}${pfx}`} className="ccell coff" />); return; }
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const d = parseDate(key);
        const dow = d.getDay();
        const isWk = dow === 0 || dow === 6;
        const isHol = HOLIDAYS.has(key);
        const isTrauma = TRAUMA_WEEKS.has(key);
        const isToday = !forPrint && today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
        const isSel = !forPrint && selectedKeys.includes(key);
        const chips = buildChips(key, isWk, isHol, isTrauma);
        const isPW = !!(cmcDayData && cmcDayMap[key]?.isPowerWeekend);
        const handleClick = forPrint ? undefined : (role === 'chief'
          ? hospitalTab === 'va'
            ? selectMode
              ? () => {
                  const idx = vaWeekMap[key];
                  if (idx === undefined) return;
                  const w = vaSched!.weeks[idx];
                  let wd = parseDate(w.wS); const we = parseDate(w.wE);
                  const wKeys: string[] = [];
                  while (wd <= we) { wKeys.push(dk(wd)); wd = addDays(wd, 1); }
                  setSelectedKeys(wKeys);
                }
              : () => { const idx = vaWeekMap[key]; if (idx !== undefined) { setPoolOverrideResId(vaSched!.weeks[idx].res.id); setVaOverride({ open: true, weekIndex: idx }); } }
            : hospitalTab === 'cmc'
            ? selectMode
              ? () => setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
              : () => { const entry = cmcDayMap[key]; if (entry) { setPoolOverrideResId(entry.res.id); setCmcOverride({ open: true, dateKey: key }); } }
            : selectMode
              ? () => setSelectedKeys((prev) => prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key])
              : () => setOverrideKeys([key])
          : undefined);

        const cellStyle: React.CSSProperties = isTrauma && !isWk
          ? { background: 'rgba(239,68,68,0.20)' }
          : isTrauma ? { background: 'rgba(239,68,68,0.28)' }
          : {};

        rows.push(
          <div
            key={key + pfx}
            className={`ccell${isWk ? ' cwk' : ''}${isHol ? ' chol' : ''}${isSel ? ' csel' : ''}`}
            style={{ ...cellStyle, cursor: !forPrint && role === 'chief' && (hospitalTab === 'va' || hospitalTab === 'cmc') ? 'pointer' : undefined }}
            onClick={handleClick}
          >
            <div className={`cdate${isToday ? ' tod' : ''}`}>
              {day}{isSel ? ' ✓' : ''}
              {isHol && <span style={{ marginLeft: 4, color: 'var(--orange)', fontFamily: 'Inter, sans-serif', fontWeight: 600, letterSpacing: 0 }}>🎉 {HOLIDAY_NAMES[key] ?? 'Holiday'}</span>}
            </div>
            <div className="cchips" dangerouslySetInnerHTML={{ __html: chips }} />
            {role === 'chief' && hospitalTab === 'cuh_pmh' && (isWk || isHol) && (
              <button
                className="bico"
                style={{ fontSize: 9, padding: '1px 4px', marginTop: 2, width: '100%', opacity: 0.6 }}
                onClick={(e) => { e.stopPropagation(); setEditingRounding(editingRounding === key ? null : key); }}
              >
                {editingRounding === key ? '✕ close' : '✎ rounding'}
              </button>
            )}
            {role === 'chief' && hospitalTab === 'cuh_pmh' && editingRounding === key && (
              <RoundingEditor
                dateKey={key}
                residents={residents}
                currentOverride={(cuhSched!.roundingOverrides ?? {})[key]}
                onSave={async (cuhResId, pmhResId) => {
                  await api('/schedule/rounding', 'POST', { dateKey: key, cuhResId, pmhResId });
                  onScheduleChanged({ ...cuhSched!,roundingOverrides: { ...(cuhSched!.roundingOverrides ?? {}), [key]: { cuhResId, pmhResId } } });
                  setEditingRounding(null);
                }}
              />
            )}
          </div>
        );
      });
    }
    return rows;
  }

  function renderCalendar() {
    return renderCalendarMonth(calYear, calMonth);
  }

  // ── Senior tab ────────────────────────────────────────────────────────────────
  function renderSeniorTab() {
    return cuhSched!.seniorWeeks.map((w, i) => (
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
    return cuhSched!.juniorDays.map((jd, i) => {
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
    let d = parseDate(cuhSched!.bStart);
    const end = parseDate(cuhSched!.bEnd);
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
      const days = cuhSched!.juniorDays.filter((d) => d.res.id === res.id);
      const s12 = days.filter((d) => d.shiftHrs === 12).length;
      const s24 = days.filter((d) => d.shiftHrs === 24).length;
      const total = days.reduce((a, d) => a + d.shiftHrs, 0);
      return { res, s12, s24, total };
    });
    const tWd = cuhSched!.juniorDays.filter((d) => !d.isWeekend && !HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);
    const tSat = cuhSched!.juniorDays.filter((d) => parseDate(d.dateKey).getDay() === 6 && !HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);
    const tSun = cuhSched!.juniorDays.filter((d) => parseDate(d.dateKey).getDay() === 0 && !HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);
    const tHol = cuhSched!.juniorDays.filter((d) => HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);

    const months = getBlockMonths();
    const curHrs = hrsMonth ?? months[0];
    const prefix = curHrs ? `${curHrs.year}-${String(curHrs.month + 1).padStart(2, '0')}-` : '';
    const dim = curHrs ? new Date(curHrs.year, curHrs.month + 1, 0).getDate() : 30;
    const wks = Math.ceil(dim / 7);

    const monthRows = jrs.map((res) => {
      const days = cuhSched!.juniorDays.filter((d) => d.res.id === res.id && d.dateKey.startsWith(prefix));
      const s12 = days.filter((d) => d.shiftHrs === 12).length;
      const s24 = days.filter((d) => d.shiftHrs === 24).length;
      const total = days.reduce((a, d) => a + d.shiftHrs, 0);
      return { res, s12, s24, total };
    });
    const mAll = cuhSched!.juniorDays.filter((d) => d.dateKey.startsWith(prefix));
    const mTotal = mAll.reduce((a, d) => a + d.shiftHrs, 0);
    const ms12 = mAll.filter((d) => d.shiftHrs === 12).length;
    const ms24 = mAll.filter((d) => d.shiftHrs === 24).length;

    // All senior residents (active + research) treated as one pool
    const srs = residents.filter((r) => r.pgy >= 4 && (r.status === 'active' || r.status === 'research' ||
        r.rotations?.some((seg) => seg.hospital === 'Research')))
      .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

    function countWeekDays(weeks: ScheduleData['seniorWeeks']) {
      let totalDays = 0, weekendDays = 0, holidayDays = 0;
      weeks.forEach((w) => {
        let d = parseDate(w.wS);
        const end = parseDate(w.wE);
        while (d <= end) {
          const key = dk(d); totalDays++;
          const dow = d.getDay();
          if (dow === 0 || dow === 6) weekendDays++;
          if (HOLIDAYS.has(key)) holidayDays++;
          d = addDays(d, 1);
        }
      });
      return { totalDays, weekendDays, holidayDays };
    }

    const allSrStats = srs.map((res) => {
      const weeks = cuhSched!.seniorWeeks.filter((w) => w.res.id === res.id);
      const { totalDays, weekendDays, holidayDays } = countWeekDays(weeks);
      const isResearch = res.status === 'research' || (res.rotations?.some((seg) => seg.hospital === 'Research') ?? false);
      return { res, weeks: weeks.length, totalDays, weekendDays, holidayDays, isResearch };
    });

    return (
      <div>
        {allSrStats.length > 0 && (
          <div className="card" style={{ marginBottom: 18 }}>
            <div className="ch"><div className="ct">Senior Call Summary</div></div>
            <div className="cbt">
              <table className="htable">
                <thead>
                  <tr>
                    <th>Resident</th><th>PGY</th>
                    <th className="r">Weeks</th>
                    <th className="r">Total Days</th>
                    <th className="r">Weekend Days</th>
                    <th className="r">Holidays</th>
                  </tr>
                </thead>
                <tbody>
                  {allSrStats.map(({ res, weeks, totalDays, weekendDays, holidayDays, isResearch }) => (
                    <tr key={res.id}>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {avatar(res)}
                          <span style={{ fontWeight: 500 }}>{res.name}</span>
                          {isResearch && <span className="bdg bpk" style={{ fontSize: 9 }}>Research</span>}
                        </div>
                      </td>
                      <td><span className="bdg bg2">PGY-{res.pgy}</span></td>
                      <td className="r"><span className="hn">{weeks}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{totalDays}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--purple)' }}>{weekendDays}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--orange)' }}>{holidayDays}</span></td>
                    </tr>
                  ))}
                  <tr style={{ background: 'rgba(0,0,0,.04)' }}>
                    <td colSpan={2} style={{ fontWeight: 600, fontSize: 12, padding: '10px 12px' }}>TOTAL</td>
                    <td className="r"><span className="hn">{allSrStats.reduce((a, s) => a + s.weeks, 0)}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{allSrStats.reduce((a, s) => a + s.totalDays, 0)}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--purple)' }}>{allSrStats.reduce((a, s) => a + s.weekendDays, 0)}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--orange)' }}>{allSrStats.reduce((a, s) => a + s.holidayDays, 0)}</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
        <div className="sg2" style={{ gap: 18, marginBottom: 18 }}>
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
                  <tr style={{ background: 'rgba(0,0,0,.04)' }}>
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
                <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.l}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: s.c }}>{s.v}h</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="ch"><div className="ct">Weekend vs Weekday Breakdown (Juniors)</div></div>
          <div className="cbt">
            <table className="htable">
              <thead>
                <tr>
                  <th>Resident</th><th>PGY</th>
                  <th className="r" style={{ color: 'var(--purple)' }}>Wknd Days</th>
                  <th className="r" style={{ color: 'var(--purple)' }}>Wknd Hrs</th>
                  <th className="r" style={{ color: 'var(--blue)' }}>Wkday Days</th>
                  <th className="r" style={{ color: 'var(--blue)' }}>Wkday Hrs</th>
                  <th className="r" style={{ color: 'var(--teal)' }}>Rounding Wknds</th>
                  <th className="r" style={{ color: 'var(--gold)' }}>Trauma Hrs</th>
                  <th className="r" style={{ color: 'var(--gold)' }}>Trauma Days</th>
                  <th className="r">Total Hrs</th>
                </tr>
              </thead>
              <tbody>
                {jrs.map((res) => {
                  const wkndDays = cuhSched!.juniorDays.filter((d) => d.res.id === res.id && (d.isWeekend || HOLIDAYS.has(d.dateKey)));
                  const wkdayDays = cuhSched!.juniorDays.filter((d) => d.res.id === res.id && !d.isWeekend && !HOLIDAYS.has(d.dateKey));
                  const wkndHrs = wkndDays.reduce((a, d) => a + d.shiftHrs, 0);
                  const wkdayHrs = wkdayDays.reduce((a, d) => a + d.shiftHrs, 0);
                  const roundingWknds = cuhSched!.juniorDays.filter((d) => d.cuhRounder?.id === res.id).length;
                  const traumaHrs = cuhSched!.jrTH?.[res.id] ?? 0;
                  const traumaDays = cuhSched!.jrTD?.[res.id] ?? 0;
                  return (
                    <tr key={res.id}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{avatar(res)}<span style={{ fontWeight: 500 }}>{res.name}</span></div></td>
                      <td><span className="bdg bb">PGY-{res.pgy}</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--purple)' }}>{wkndDays.length}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--purple)' }}>{wkndHrs}h</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--blue)' }}>{wkdayDays.length}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--blue)' }}>{wkdayHrs}h</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--teal)' }}>{roundingWknds}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{traumaHrs}h</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--gold)' }}>{traumaDays}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--green)' }}>{wkndHrs + wkdayHrs}h</span></td>
                    </tr>
                  );
                })}
                {(() => {
                  const totWkndD = jrs.reduce((a, r) => a + cuhSched!.juniorDays.filter((d) => d.res.id === r.id && (d.isWeekend || HOLIDAYS.has(d.dateKey))).length, 0);
                  const totWkndH = jrs.reduce((a, r) => a + cuhSched!.juniorDays.filter((d) => d.res.id === r.id && (d.isWeekend || HOLIDAYS.has(d.dateKey))).reduce((s, d) => s + d.shiftHrs, 0), 0);
                  const totWkdD = jrs.reduce((a, r) => a + cuhSched!.juniorDays.filter((d) => d.res.id === r.id && !d.isWeekend && !HOLIDAYS.has(d.dateKey)).length, 0);
                  const totWkdH = jrs.reduce((a, r) => a + cuhSched!.juniorDays.filter((d) => d.res.id === r.id && !d.isWeekend && !HOLIDAYS.has(d.dateKey)).reduce((s, d) => s + d.shiftHrs, 0), 0);
                  const totRounding = jrs.reduce((a, r) => a + cuhSched!.juniorDays.filter((d) => d.cuhRounder?.id === r.id).length, 0);
                  const totTraumaH = jrs.reduce((a, r) => a + (cuhSched!.jrTH?.[r.id] ?? 0), 0);
                  const totTraumaD = jrs.reduce((a, r) => a + (cuhSched!.jrTD?.[r.id] ?? 0), 0);
                  return (
                    <tr style={{ background: 'rgba(0,0,0,.04)' }}>
                      <td colSpan={2} style={{ fontWeight: 600, fontSize: 12, padding: '10px 12px' }}>TOTAL</td>
                      <td className="r"><span className="hn" style={{ color: 'var(--purple)' }}>{totWkndD}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--purple)' }}>{totWkndH}h</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--blue)' }}>{totWkdD}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--blue)' }}>{totWkdH}h</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--teal)' }}>{totRounding}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{totTraumaH}h</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--gold)' }}>{totTraumaD}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{totWkndH + totWkdH}h</span></td>
                    </tr>
                  );
                })()}
              </tbody>
            </table>
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
                <tr style={{ background: 'rgba(0,0,0,.04)' }}>
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

  // ── Equity gauge (reusable for all schedule types) ───────────────────────────
  function renderEquityGauge(
    myRatio: number,
    myAssigned: number,
    myPotential: number,
    groupRatios: number[],
    unitLabel: string,
  ) {
    if (groupRatios.length === 0) return null;
    const avg = Math.round((groupRatios.reduce((a, b) => a + b, 0) / groupRatios.length) * 10) / 10;
    const minR = Math.round(Math.min(...groupRatios) * 10) / 10;
    const maxR = Math.round(Math.max(...groupRatios) * 10) / 10;
    const diff = Math.round((myRatio - avg) * 10) / 10;
    const color = Math.abs(diff) <= 3 ? 'var(--green)' : Math.abs(diff) <= 8 ? 'var(--gold)' : 'var(--red)';
    const sentiment = Math.abs(diff) <= 3 ? 'On par with peers' : diff > 0 ? 'Above average call load' : 'Below average call load';
    const pctOf = (v: number) => maxR > 0 ? Math.min(Math.round((v / maxR) * 100), 100) : 0;

    return (
      <div className="card" style={{ marginTop: 20 }}>
        <div className="ch">
          <div>
            <div className="ct">📊 My Call Equity</div>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>
              Your share of assigned call hours relative to your potential availability during this block.
              Equal percentages across all residents = a perfectly equitable schedule.
            </div>
          </div>
        </div>
        <div className="cb">
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 6 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 42, fontWeight: 700, color, lineHeight: 1 }}>
              {myRatio}%
            </span>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>utilization ratio</span>
          </div>
          <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 16 }}>
            {myAssigned}{unitLabel} assigned ÷ {myPotential}{unitLabel} potential call hours
          </div>

          {/* Comparison track */}
          <div style={{ position: 'relative', height: 10, background: 'var(--s2)', borderRadius: 6, marginBottom: 6 }}>
            {/* Range band */}
            <div style={{
              position: 'absolute',
              left: `${pctOf(minR)}%`,
              width: `${pctOf(maxR) - pctOf(minR)}%`,
              height: '100%',
              background: 'rgba(148,163,184,.25)',
              borderRadius: 6,
            }} />
            {/* Average tick */}
            <div style={{
              position: 'absolute',
              left: `${pctOf(avg)}%`,
              width: 2,
              height: '100%',
              background: 'var(--muted)',
              borderRadius: 1,
            }} />
            {/* My marker */}
            <div style={{
              position: 'absolute',
              left: `${pctOf(myRatio)}%`,
              transform: 'translateX(-50%)',
              width: 4,
              height: 14,
              top: -2,
              background: color,
              borderRadius: 2,
              boxShadow: `0 0 0 2px ${color}40`,
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--muted)', marginBottom: 14 }}>
            <span>Min {minR}%</span>
            <span>▼ Group avg {avg}%</span>
            <span>Max {maxR}%</span>
          </div>

          {/* Status badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: `${color}18`, border: `1px solid ${color}44`,
            borderRadius: 8, padding: '5px 12px',
          }}>
            <span style={{ color, fontWeight: 600, fontSize: 12 }}>{sentiment}</span>
            <span style={{ color: 'var(--muted)', fontSize: 11 }}>
              ({diff > 0 ? '+' : ''}{diff}% vs group avg)
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ── Stats tab (resident personal dashboard) ───────────────────────────────────
  function renderStatsTab() {
    if (!currentResId || !schedule) return null;
    const res = residents.find((r) => r.id === currentResId);
    if (!res) return null;

    // Resolve all resident-record IDs belonging to the same person (multi-rotation support)
    const personId = res.person_id;
    const myResIds = new Set(
      personId ? residents.filter((r) => r.person_id === personId).map((r) => r.id) : [currentResId],
    );

    if (!cuhSched) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--muted)', flexDirection: 'column', gap: 12 }}>
          <div>Personal stats are based on the CUH/PMH schedule.</div>
          {schedules.some((s) => (s.schedule_type ?? 'cuh_pmh') === 'cuh_pmh') && (
            <button className="btn bsm bgh" onClick={() => switchToTab('cuh_pmh')}>Load CUH/PMH Schedule</button>
          )}
        </div>
      );
    }
    const isJunior = res.pgy <= 3;
    const months = getBlockMonths();
    const prefix = statsMonth
      ? `${statsMonth.year}-${String(statsMonth.month + 1).padStart(2, '0')}-`
      : null;

    function computeJrStats() {
      const days = cuhSched!.juniorDays.filter(
        (d) => myResIds.has(d.res.id) && (!prefix || d.dateKey.startsWith(prefix)),
      );
      const cuhRdrDays = cuhSched!.juniorDays.filter(
        (d) => (d.cuhRounder?.id ? myResIds.has(d.cuhRounder.id) : false) && (!prefix || d.dateKey.startsWith(prefix)),
      );
      const wkday  = days.filter((d) => !d.isWeekend && !HOLIDAYS.has(d.dateKey));
      const wknd   = days.filter((d) => d.isWeekend && !HOLIDAYS.has(d.dateKey));
      const hol    = days.filter((d) => HOLIDAYS.has(d.dateKey));
      const trauma = days.filter((d) => d.isTrauma);
      return {
        wkdayCount: wkday.length, wkdayHrs: wkday.reduce((a, d) => a + d.shiftHrs, 0),
        wkndCount:  wknd.length,  wkndHrs:  wknd.reduce((a, d) => a + d.shiftHrs, 0),
        holCount:   hol.length,   holHrs:   hol.reduce((a, d) => a + d.shiftHrs, 0),
        totalHrs:   days.reduce((a, d) => a + d.shiftHrs, 0),
        cuhRdrCount: cuhRdrDays.length,
        traumaCount: trauma.length, traumaHrs: trauma.reduce((a, d) => a + d.shiftHrs, 0),
      };
    }

    function computeSrStats() {
      const srWeeks = cuhSched!.seniorWeeks.filter((w) => myResIds.has(w.res.id));
      let wkdayCount = 0, wkndCount = 0, holCount = 0;
      srWeeks.forEach((w) => {
        let d = parseDate(w.wS); const end = parseDate(w.wE);
        while (d <= end) {
          const key = dk(d);
          if (!prefix || key.startsWith(prefix)) {
            if (HOLIDAYS.has(key)) holCount++;
            else if (d.getDay() === 0 || d.getDay() === 6) wkndCount++;
            else wkdayCount++;
          }
          d = addDays(d, 1);
        }
      });
      return { wkdayCount, wkndCount, holCount, totalCount: wkdayCount + wkndCount + holCount };
    }

    const jrS = isJunior ? computeJrStats() : null;
    const srS = !isJunior ? computeSrStats() : null;

    function sc(
      label: string, value: number, unit: string, color: string, sub?: string,
    ) {
      return (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>
            {label}
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>
              {value}
            </span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{unit}</span>
          </div>
          {sub && (
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color, marginTop: 6, opacity: 0.8 }}>
              {sub}
            </div>
          )}
        </div>
      );
    }

    const resInitials = (() => {
      const parts = res.name.trim().split(/\s+/);
      return (parts.length === 1 ? parts[0].slice(0, 2) : parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    })();

    return (
      <div>
        {/* Resident header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, padding: '12px 16px', background: 'var(--blue-dim)', border: '1px solid rgba(96,165,250,.25)', borderRadius: 'var(--r-lg)' }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: res.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#000', flexShrink: 0 }}>
            {resInitials}
          </div>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{res.name}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>
              PGY-{res.pgy} · {res.hospital} · {isJunior ? 'Junior Call' : 'Senior Call'}
            </div>
          </div>
        </div>

        {/* Month selector */}
        <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
          <button className={`btn bsm ${!statsMonth ? 'bg' : 'bgh'}`} onClick={() => setStatsMonth(null)}>
            Total Block
          </button>
          {months.map((m) => (
            <button
              key={`${m.year}-${m.month}`}
              className={`btn bsm ${statsMonth?.year === m.year && statsMonth?.month === m.month ? 'bg' : 'bgh'}`}
              onClick={() => setStatsMonth(m)}
            >
              {MONTHS[m.month].slice(0, 3)} {m.year}
            </button>
          ))}
        </div>

        {/* Junior stats */}
        {isJunior && jrS && (
          <>
            {/* Hours hero */}
            <div className="sg3" style={{ marginBottom: 18, background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
              {([
                { label: 'Total Hours on Call', value: jrS.totalHrs, color: 'var(--green)' },
                { label: 'Weekday Hours', value: jrS.wkdayHrs, color: 'var(--blue)' },
                { label: 'Weekend & Holiday Hours', value: jrS.wkndHrs + jrS.holHrs, color: 'var(--purple)' },
              ] as { label: string; value: number; color: string }[]).map(({ label, value, color }, i) => (
                <div key={label} style={{ padding: '20px 24px', borderLeft: i > 0 ? '1px solid var(--border)' : undefined }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 600 }}>{label}</div>
                  <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color, lineHeight: 1 }}>
                    <span style={{ fontSize: 38 }}>{value}</span>
                    <span style={{ fontSize: 18 }}>h</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Stat cards grid */}
            <div className="sg3" style={{ gap: 14 }}>
              {sc('Weekday Call Days', jrS.wkdayCount, 'days', 'var(--blue)', `${jrS.wkdayHrs}h`)}
              {sc('Weekend Call Days', jrS.wkndCount, 'days', 'var(--purple)', `${jrS.wkndHrs}h`)}
              {sc('Holiday Call Days', jrS.holCount, 'days', 'var(--orange)', `${jrS.holHrs}h`)}
              {sc(
                'Weekend Rounding Days',
                jrS.wkndCount + jrS.holCount + jrS.cuhRdrCount,
                'days',
                'var(--teal)',
                jrS.cuhRdrCount > 0
                  ? `${jrS.wkndCount + jrS.holCount} primary call + ${jrS.cuhRdrCount} CUH rounder`
                  : 'as primary call',
              )}
              {sc('CUH Rounder Duties', jrS.cuhRdrCount, 'days', 'var(--green)', 'additional rounding')}
              {sc('Trauma Call Days', jrS.traumaCount, 'days', 'var(--red)', `${jrS.traumaHrs}h`)}
            </div>
          </>
        )}

        {/* Senior stats */}
        {!isJunior && srS && (
          <div className="sg4" style={{ gap: 14 }}>
            {sc('Total Call Days', srS.totalCount, 'days', 'var(--gold)')}
            {sc('Weekday Call Days', srS.wkdayCount, 'days', 'var(--blue)')}
            {sc('Weekend Call Days', srS.wkndCount, 'days', 'var(--purple)')}
            {sc('Holiday Call Days', srS.holCount, 'days', 'var(--orange)')}
          </div>
        )}

        {/* ── Equity gauge (block-level, not filtered by month) ─────────────── */}
        {(() => {
          const cuhBStart = parseDate(cuhSched!.bStart);
          const cuhBEnd   = parseDate(cuhSched!.bEnd);

          if (isJunior) {
            const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');
            const potMap: Record<string, number> = {};
            jrs.forEach((r) => {
              const rS = r.rotation_start ? parseDate(r.rotation_start) : cuhBStart;
              const rE = r.rotation_end   ? parseDate(r.rotation_end)   : cuhBEnd;
              const effS = rS < cuhBStart ? cuhBStart : rS;
              const effE = rE > cuhBEnd   ? cuhBEnd   : rE;
              const offDays = new Set(allRequests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
              let pot = 0; let d = new Date(effS);
              while (d <= effE) {
                const key = dk(d);
                if (!offDays.has(key)) {
                  const dow = d.getDay();
                  pot += (dow === 0 || dow === 6 || HOLIDAYS.has(key)) ? 24 : 12;
                }
                d = addDays(d, 1);
              }
              potMap[r.id] = Math.max(1, pot);
            });
            const hrsMap: Record<string, number> = {};
            jrs.forEach((r) => { hrsMap[r.id] = cuhSched!.juniorDays.filter((d) => d.res.id === r.id).reduce((a, d) => a + d.shiftHrs, 0); });
            const ratioMap: Record<string, number> = {};
            jrs.forEach((r) => { ratioMap[r.id] = Math.round((hrsMap[r.id] / potMap[r.id]) * 1000) / 10; });

            // Sum across all rotation records for the same person
            const myAssigned = [...myResIds].reduce((a, id) => a + (hrsMap[id] ?? 0), 0);
            const myPotential = [...myResIds].reduce((a, id) => a + (potMap[id] ?? 0), 0) || 1;
            const myRatio = Math.round((myAssigned / myPotential) * 1000) / 10;
            return renderEquityGauge(myRatio, myAssigned, myPotential, Object.values(ratioMap), 'h');
          } else {
            // Senior: days assigned / potential call days
            const srs = residents.filter((r) => r.pgy >= 4 && (r.status === 'active' || r.status === 'research'));
            const potDays: Record<string, number> = {};
            srs.forEach((r) => {
              const rS = r.rotation_start ? parseDate(r.rotation_start) : cuhBStart;
              const rE = r.rotation_end   ? parseDate(r.rotation_end)   : cuhBEnd;
              const effS = rS < cuhBStart ? cuhBStart : rS;
              const effE = rE > cuhBEnd   ? cuhBEnd   : rE;
              const offDays = new Set(allRequests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
              let cnt = 0; let d = new Date(effS);
              while (d <= effE) { if (!offDays.has(dk(d))) cnt++; d = addDays(d, 1); }
              potDays[r.id] = Math.max(1, cnt);
            });
            const assignedDays: Record<string, number> = {};
            srs.forEach((r) => {
              let cnt = 0;
              cuhSched!.seniorWeeks.filter((w) => w.res.id === r.id).forEach((w) => {
                let d = parseDate(w.wS); const end = parseDate(w.wE);
                while (d <= end) { cnt++; d = addDays(d, 1); }
              });
              assignedDays[r.id] = cnt;
            });
            const ratioMap: Record<string, number> = {};
            srs.forEach((r) => { ratioMap[r.id] = Math.round((assignedDays[r.id] / potDays[r.id]) * 1000) / 10; });

            const myAssigned = [...myResIds].reduce((a, id) => a + (assignedDays[id] ?? 0), 0);
            const myPotential = [...myResIds].reduce((a, id) => a + (potDays[id] ?? 0), 0) || 1;
            const myRatio = Math.round((myAssigned / myPotential) * 1000) / 10;
            return renderEquityGauge(myRatio, myAssigned, myPotential, Object.values(ratioMap), 'd');
          }
        })()}
      </div>
    );
  }

  // ── VA personal stats tab (resident view) ────────────────────────────────────
  function renderVAStatsTab() {
    if (!currentResId || !vaSched) return null;

    // Resolve all resident-record IDs belonging to the same person (multi-rotation support)
    const loginRes = residents.find((r) => r.id === currentResId);
    if (!loginRes) return null;
    const personId = loginRes.person_id;
    const myResIds = new Set(
      personId ? residents.filter((r) => r.person_id === personId).map((r) => r.id) : [currentResId],
    );

    // Find the VA record ID that appears in the schedule
    const myWeeks = vaSched.weeks.filter((w) => myResIds.has(w.res.id));
    const myVaResId = myWeeks[0]?.res.id ?? currentResId;

    if (myWeeks.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
          You have no VA call assignments in this schedule.
        </div>
      );
    }

    let wkday = 0, wknd = 0, hol = 0;
    myWeeks.forEach((w) => {
      let d = parseDate(w.wS); const end = parseDate(w.wE);
      while (d <= end) {
        const key = dk(d);
        if (HOLIDAYS.has(key)) hol++;
        else if (d.getDay() === 0 || d.getDay() === 6) wknd++;
        else wkday++;
        d = addDays(d, 1);
      }
    });
    const totalHrs = vaSched.hours[myVaResId] ?? 0;

    // Equity
    const pool = (() => {
      const m = new Map<string, Resident>();
      vaSched.weeks.forEach((w) => m.set(w.res.id, w.res));
      return [...m.values()];
    })();
    const vaBStart = parseDate(vaSched.bStart);
    const vaBEnd   = parseDate(vaSched.bEnd);
    const potMap: Record<string, number> = {};
    pool.forEach((r) => {
      const vaSegs = r.rotations?.filter((s) => s.hospital === 'VA') ?? [];
      const offDays = new Set(allRequests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
      let pot = 0; let d = new Date(vaBStart);
      while (d <= vaBEnd) {
        const dstr = dk(d);
        const inVA = vaSegs.length === 0 || vaSegs.some((s) => dstr >= s.start_date && dstr <= s.end_date);
        if (inVA && !offDays.has(dstr)) {
          const dow = d.getDay();
          pot += (dow === 0 || dow === 6 || HOLIDAYS.has(dstr)) ? 24 : 12;
        }
        d = addDays(d, 1);
      }
      potMap[r.id] = Math.max(1, pot);
    });
    const ratioMap: Record<string, number> = {};
    pool.forEach((r) => { ratioMap[r.id] = Math.round(((vaSched!.hours[r.id] ?? 0) / potMap[r.id]) * 1000) / 10; });

    function sc(label: string, value: number, unit: string, color: string, sub?: string) {
      return (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{unit}</span>
          </div>
          {sub && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color, marginTop: 6, opacity: 0.8 }}>{sub}</div>}
        </div>
      );
    }

    return (
      <div>
        <div className="sg4" style={{ gap: 14, marginBottom: 4 }}>
          {sc('VA Call Weeks', myWeeks.length, 'wks', 'var(--gold)')}
          {sc('Total Call Hours', totalHrs, 'h', 'var(--green)')}
          {sc('Weekday Days', wkday, 'days', 'var(--blue)')}
          {sc('Weekend & Holiday', wknd + hol, 'days', 'var(--purple)')}
        </div>
        {renderEquityGauge(ratioMap[myVaResId] ?? 0, totalHrs, potMap[myVaResId] ?? 1, Object.values(ratioMap), 'h')}
      </div>
    );
  }

  // ── CMC personal stats tab (resident view) ────────────────────────────────────
  function renderCMCStatsTab() {
    if (!currentResId || !cmcDayData) return null;

    // Resolve all resident-record IDs belonging to the same person (multi-rotation support)
    const loginRes = residents.find((r) => r.id === currentResId);
    if (!loginRes) return null;
    const personId = loginRes.person_id;
    const myResIds = new Set(
      personId ? residents.filter((r) => r.person_id === personId).map((r) => r.id) : [currentResId],
    );

    // Find the CMC record ID that appears in the schedule
    const myDays = cmcDayData.days.filter((d) => myResIds.has(d.res.id));
    const myCmcResId = myDays[0]?.res.id ?? currentResId;

    if (myDays.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
          You have no CMC call assignments in this schedule.
        </div>
      );
    }

    const pwDays  = myDays.filter((d) => d.isPowerWeekend);
    const wdDays  = myDays.filter((d) => !d.isPowerWeekend);
    const holDays = myDays.filter((d) => HOLIDAYS.has(d.dateKey));
    const traumaDays = myDays.filter((d) => TRAUMA_WEEKS.has(d.dateKey));
    const totalHrs = cmcDayData.hours[myCmcResId] ?? 0;

    // Equity
    const pool = (() => {
      const m = new Map<string, Resident>();
      cmcDayData.days.forEach((d) => m.set(d.res.id, d.res));
      return [...m.values()];
    })();
    const cmcBStart = parseDate(cmcDayData.bStart);
    const cmcBEnd   = parseDate(cmcDayData.bEnd);
    const potMap: Record<string, number> = {};
    pool.forEach((r) => {
      const cmcSegs = r.rotations?.filter((s) => s.hospital === 'CMC') ?? [];
      const offDays = new Set(allRequests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
      let pot = 0; let d = new Date(cmcBStart);
      while (d <= cmcBEnd) {
        const dstr = dk(d);
        const inCMC = cmcSegs.length === 0 || cmcSegs.some((s) => dstr >= s.start_date && dstr <= s.end_date);
        if (inCMC && !offDays.has(dstr)) {
          const dow = d.getDay();
          pot += (dow === 0 || dow === 6 || HOLIDAYS.has(dstr)) ? 24 : 12;
        }
        d = addDays(d, 1);
      }
      potMap[r.id] = Math.max(1, pot);
    });
    const ratioMap: Record<string, number> = {};
    pool.forEach((r) => { ratioMap[r.id] = Math.round(((cmcDayData!.hours[r.id] ?? 0) / potMap[r.id]) * 1000) / 10; });

    function sc(label: string, value: number, unit: string, color: string, sub?: string) {
      return (
        <div className="card" style={{ padding: '18px 20px' }}>
          <div style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 10 }}>{label}</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 34, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{unit}</span>
          </div>
          {sub && <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color, marginTop: 6, opacity: 0.8 }}>{sub}</div>}
        </div>
      );
    }

    return (
      <div>
        <div className="sg3" style={{ marginBottom: 18, background: 'var(--s1)', border: '1px solid var(--border)', borderRadius: 'var(--r-lg)', overflow: 'hidden' }}>
          {([
            { label: 'Total Hours on Call', value: totalHrs, color: 'var(--green)' },
            { label: 'Weekday Hours', value: wdDays.reduce((a, d) => a + d.shiftHrs, 0), color: 'var(--blue)' },
            { label: 'Power Weekend Hours', value: pwDays.reduce((a, d) => a + d.shiftHrs, 0), color: '#92400e' },
          ] as { label: string; value: number; color: string }[]).map(({ label, value, color }, i) => (
            <div key={label} style={{ padding: '20px 24px', borderLeft: i > 0 ? '1px solid var(--border)' : undefined }}>
              <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, fontWeight: 600 }}>{label}</div>
              <div style={{ fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color, lineHeight: 1 }}>
                <span style={{ fontSize: 38 }}>{value}</span>
                <span style={{ fontSize: 18 }}>h</span>
              </div>
            </div>
          ))}
        </div>
        <div className="sg3" style={{ gap: 14 }}>
          {sc('Weekday Call Days', wdDays.length, 'days', 'var(--blue)', `${wdDays.reduce((a, d) => a + d.shiftHrs, 0)}h`)}
          {sc('Power Weekends', Math.round(pwDays.length / 3), 'wknds', '#92400e', `${pwDays.length} days · ${pwDays.reduce((a, d) => a + d.shiftHrs, 0)}h`)}
          {sc('Holiday Call Days', holDays.length, 'days', 'var(--orange)')}
          {sc('Trauma Call Days', traumaDays.length, 'days', 'var(--red)', `${traumaDays.reduce((a, d) => a + d.shiftHrs, 0)}h`)}
        </div>
        {renderEquityGauge(ratioMap[myCmcResId] ?? 0, totalHrs, potMap[myCmcResId] ?? 1, Object.values(ratioMap), 'h')}
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
    const srs = residents.filter((r) => r.pgy >= 4 && (r.status === 'active' || r.status === 'research' ||
        r.rotations?.some((seg) => seg.hospital === 'Research')));
    const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');
    const bStart = parseDate(cuhSched!.bStart);
    const bEnd = parseDate(cuhSched!.bEnd);

    const srWkdays: Record<string, number> = {};
    const srWkends: Record<string, number> = {};
    srs.forEach((r) => { srWkdays[r.id] = 0; srWkends[r.id] = 0; });
    cuhSched!.seniorWeeks.forEach((w) => {
      if (!srs.find((r) => r.id === w.res.id)) return;
      let d = parseDate(w.wS); const end = parseDate(w.wE);
      while (d <= end) {
        const dow = d.getDay();
        if (dow === 0 || dow === 6) srWkends[w.res.id]++;
        else srWkdays[w.res.id]++;
        d = addDays(d, 1);
      }
    });

    const jrH: Record<string, number> = {};
    jrs.forEach((r) => { jrH[r.id] = cuhSched!.juniorDays.filter((d) => d.res.id === r.id).reduce((a, d) => a + d.shiftHrs, 0); });

    const jrH24: Record<string, number> = {};
    jrs.forEach((r) => { jrH24[r.id] = cuhSched!.juniorDays.filter((d) => d.res.id === r.id && d.shiftHrs === 24).length; });

    const jrPotentialHours: Record<string, number> = {};
    jrs.forEach((r) => {
      const rS = r.rotation_start ? parseDate(r.rotation_start) : bStart;
      const rE = r.rotation_end   ? parseDate(r.rotation_end)   : bEnd;
      const effS = rS < bStart ? bStart : rS;
      const effE = rE > bEnd   ? bEnd   : rE;
      const offDays = new Set(allRequests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
      let pot = 0; let d = new Date(effS);
      while (d <= effE) {
        const key = dk(d);
        if (!offDays.has(key)) {
          const dow = d.getDay();
          pot += (dow === 0 || dow === 6 || HOLIDAYS.has(key)) ? 24 : 12;
        }
        d = addDays(d, 1);
      }
      jrPotentialHours[r.id] = Math.max(1, pot);
    });
    // Utilization ratio: assigned hours / potential call hours (as percentage)
    const jrUtilRatio: Record<string, number> = {};
    jrs.forEach((r) => { jrUtilRatio[r.id] = Math.round((jrH[r.id] / jrPotentialHours[r.id]) * 1000) / 10; });

    return (
      <div className="sg2" style={{ gap: 18 }}>
        <div className="card">
          <div className="ch"><div className="ct">Senior Weekday Call Days</div></div>
          <div className="cb">{eqBars(srs.map((r) => ({ name: r.name, val: srWkdays[r.id] ?? 0, color: r.color })), 'd')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Senior Weekend Call Days</div></div>
          <div className="cb">{eqBars(srs.map((r) => ({ name: r.name, val: srWkends[r.id] ?? 0, color: r.color })), 'd')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Junior Call Hours (total)</div></div>
          <div className="cb">{eqBars(jrs.map((r) => ({ name: r.name, val: jrH[r.id] ?? 0, color: r.color })), 'h')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">Junior Trauma Hours</div></div>
          <div className="cb">{eqBars(jrs.map((r) => ({ name: r.name, val: cuhSched!.jrTH?.[r.id] ?? 0, color: r.color })), 'h')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">24h Shifts</div></div>
          <div className="cb">{eqBars(jrs.map((r) => ({ name: r.name, val: jrH24[r.id] ?? 0, color: r.color })), 'shifts')}</div>
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="ch">
            <div>
              <div className="ct">Junior Call Utilization Ratio</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Assigned hours ÷ potential call hours (rotation window minus official vacation days only) — equal bars = perfectly equitable</div>
            </div>
          </div>
          <div className="cb">{eqBars(jrs.map((r) => ({ name: `${r.name}  ${jrH[r.id]}h / ${jrPotentialHours[r.id]}h potential`, val: jrUtilRatio[r.id] ?? 0, color: r.color })), '%')}</div>
        </div>
      </div>
    );
  }

  // ── VA Hours/Equity tabs ──────────────────────────────────────────────────────
  function renderVAHoursTab() {
    if (!vaSched) return null;
    const resSet = new Map<string, Resident>();
    vaSched.weeks.forEach((w) => resSet.set(w.res.id, w.res));
    const pool = [...resSet.values()].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
    return (
      <div className="card">
        <div className="ch"><div className="ct">VA Call Summary</div></div>
        <div className="cbt">
          <table className="htable">
            <thead>
              <tr>
                <th>Resident</th><th>PGY</th>
                <th className="r">Weeks</th>
                <th className="r">Weekday Days</th>
                <th className="r">Weekend Days</th>
                <th className="r">Holidays</th>
                <th className="r">Total Hours</th>
              </tr>
            </thead>
            <tbody>
              {pool.map((res) => {
                const myWeeks = vaSched!.weeks.filter((w) => w.res.id === res.id);
                let wkday = 0, wknd = 0, hol = 0;
                myWeeks.forEach((w) => {
                  let d = parseDate(w.wS); const end = parseDate(w.wE);
                  while (d <= end) {
                    const key = dk(d);
                    if (HOLIDAYS.has(key)) hol++;
                    else if (d.getDay() === 0 || d.getDay() === 6) wknd++;
                    else wkday++;
                    d = addDays(d, 1);
                  }
                });
                const hrs = vaSched!.hours[res.id] ?? 0;
                return (
                  <tr key={res.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{avatar(res)}<span style={{ fontWeight: 500 }}>{res.name}</span></div></td>
                    <td><span className={`bdg ${res.pgy >= 4 ? 'bg2' : 'bb'}`}>PGY-{res.pgy}</span></td>
                    <td className="r"><span className="hn">{vaSched!.counts[res.id] ?? 0}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--blue)' }}>{wkday}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--purple)' }}>{wknd}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--orange)' }}>{hol}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--green)' }}>{hrs}h</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  function renderVAEquityTab() {
    if (!vaSched) return null;
    const resSet = new Map<string, Resident>();
    vaSched.weeks.forEach((w) => resSet.set(w.res.id, w.res));
    const pool = [...resSet.values()].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

    // Compute potential call hours per VA resident (VA rotation window minus vacation)
    const vaBStart = parseDate(vaSched.bStart);
    const vaBEnd   = parseDate(vaSched.bEnd);
    const vaPotentialHours: Record<string, number> = {};
    pool.forEach((r) => {
      const vaSegs = r.rotations?.filter((s) => s.hospital === 'VA') ?? [];
      const offDays = new Set(allRequests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
      let pot = 0; let d = new Date(vaBStart);
      while (d <= vaBEnd) {
        const dstr = dk(d);
        const inVA = vaSegs.length === 0 || vaSegs.some((s) => dstr >= s.start_date && dstr <= s.end_date);
        if (inVA && !offDays.has(dstr)) {
          const dow = d.getDay();
          pot += (dow === 0 || dow === 6 || HOLIDAYS.has(dstr)) ? 24 : 12;
        }
        d = addDays(d, 1);
      }
      vaPotentialHours[r.id] = Math.max(1, pot);
    });
    const vaUtilRatio: Record<string, number> = {};
    pool.forEach((r) => { vaUtilRatio[r.id] = Math.round(((vaSched!.hours[r.id] ?? 0) / vaPotentialHours[r.id]) * 1000) / 10; });

    return (
      <div className="sg2" style={{ gap: 18 }}>
        <div className="card">
          <div className="ch"><div className="ct">VA Call Weeks</div></div>
          <div className="cb">{eqBars(pool.map((r) => ({ name: r.name, val: vaSched!.counts[r.id] ?? 0, color: r.color })), ' wks')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">VA Call Hours</div></div>
          <div className="cb">{eqBars(pool.map((r) => ({ name: r.name, val: vaSched!.hours[r.id] ?? 0, color: r.color })), 'h')}</div>
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="ch">
            <div>
              <div className="ct">VA Call Utilization Ratio</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Assigned hours ÷ potential call hours (rotation window minus official vacation days only) — equal bars = perfectly equitable</div>
            </div>
          </div>
          <div className="cb">{eqBars(pool.map((r) => ({ name: `${r.name}  ${vaSched!.hours[r.id] ?? 0}h / ${vaPotentialHours[r.id]}h potential`, val: vaUtilRatio[r.id] ?? 0, color: r.color })), '%')}</div>
        </div>
      </div>
    );
  }

  // ── CMC Hours/Equity tabs ─────────────────────────────────────────────────────
  function renderCMCHoursTab() {
    if (!cmcDayData) return null;
    const resSet = new Map<string, Resident>();
    cmcDayData.days.forEach((d) => resSet.set(d.res.id, d.res));
    const pool = [...resSet.values()].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

    // Block months
    const cmcMonths: { year: number; month: number }[] = [];
    let dm = parseDate(cmcDayData.bStart); const cmcEnd = parseDate(cmcDayData.bEnd);
    while (dm <= cmcEnd) {
      const y = dm.getFullYear(), mo = dm.getMonth();
      if (!cmcMonths.find((x) => x.year === y && x.month === mo)) cmcMonths.push({ year: y, month: mo });
      dm = addDays(dm, 28);
    }
    const ly2 = cmcEnd.getFullYear(), lm2 = cmcEnd.getMonth();
    if (!cmcMonths.find((x) => x.year === ly2 && x.month === lm2)) cmcMonths.push({ year: ly2, month: lm2 });

    const curHrs = hrsMonth ?? cmcMonths[0];
    const prefix = curHrs ? `${curHrs.year}-${String(curHrs.month + 1).padStart(2, '0')}-` : '';
    const dim2 = curHrs ? new Date(curHrs.year, curHrs.month + 1, 0).getDate() : 30;
    const wks2 = Math.ceil(dim2 / 7);

    // Block total hours by type
    const tPW   = cmcDayData.days.filter((d) => d.isPowerWeekend).reduce((a, d) => a + d.shiftHrs, 0);
    const tWd   = cmcDayData.days.filter((d) => !d.isPowerWeekend).reduce((a, d) => a + d.shiftHrs, 0);
    const tHol  = cmcDayData.days.filter((d) => HOLIDAYS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);
    const tTrauma = cmcDayData.days.filter((d) => TRAUMA_WEEKS.has(d.dateKey)).reduce((a, d) => a + d.shiftHrs, 0);

    const bd = pool.map((res) => {
      const myDays = cmcDayData!.days.filter((d) => d.res.id === res.id);
      const pw  = myDays.filter((d) => d.isPowerWeekend).length;
      const wd  = myDays.filter((d) => !d.isPowerWeekend).length;
      const hrs = cmcDayData!.hours[res.id] ?? 0;
      return { res, pw, wd, hrs };
    });

    // Breakdown per resident
    const detailRows = pool.map((res) => {
      const myDays = cmcDayData!.days.filter((d) => d.res.id === res.id);
      const pwDays    = myDays.filter((d) => d.isPowerWeekend);
      const wdDays    = myDays.filter((d) => !d.isPowerWeekend);
      const holDays   = myDays.filter((d) => HOLIDAYS.has(d.dateKey));
      const traumaDays = myDays.filter((d) => TRAUMA_WEEKS.has(d.dateKey));
      const pwHrs   = pwDays.reduce((a, d) => a + d.shiftHrs, 0);
      const wdHrs   = wdDays.reduce((a, d) => a + d.shiftHrs, 0);
      const traumaHrs = traumaDays.reduce((a, d) => a + d.shiftHrs, 0);
      return { res, pwCount: pwDays.length, wdCount: wdDays.length, holCount: holDays.length,
               traumaCount: traumaDays.length, pwHrs, wdHrs, traumaHrs,
               totalHrs: cmcDayData!.hours[res.id] ?? 0 };
    });

    // Monthly breakdown
    const monthRows = pool.map((res) => {
      const myDays = cmcDayData!.days.filter((d) => d.res.id === res.id && d.dateKey.startsWith(prefix));
      const hrs = myDays.reduce((a, d) => a + d.shiftHrs, 0);
      const pw  = myDays.filter((d) => d.isPowerWeekend).length;
      const wd  = myDays.filter((d) => !d.isPowerWeekend).length;
      return { res, pw, wd, hrs };
    });
    const mTotal = cmcDayData.days.filter((d) => d.dateKey.startsWith(prefix)).reduce((a, d) => a + d.shiftHrs, 0);

    return (
      <div>
        <div className="card" style={{ marginBottom: 18 }}>
          <div className="ch"><div className="ct">CMC Call Summary</div></div>
          <div className="cbt">
            <table className="htable">
              <thead>
                <tr>
                  <th>Resident</th><th>PGY</th>
                  <th className="r">Total Days</th>
                  <th className="r">Power Wknds</th>
                  <th className="r">Weekdays</th>
                  <th className="r">Total Hours</th>
                </tr>
              </thead>
              <tbody>
                {bd.map(({ res, pw, wd, hrs }) => (
                  <tr key={res.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{avatar(res)}<span style={{ fontWeight: 500 }}>{res.name}</span></div></td>
                    <td><span className="bdg bb">PGY-{res.pgy}</span></td>
                    <td className="r"><span className="hn">{cmcDayData!.counts[res.id] ?? 0}</span></td>
                    <td className="r"><span className="ht" style={{ color: '#92400e' }}>{Math.round(pw / 3)}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--blue)' }}>{wd}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--green)' }}>{hrs}h</span></td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(0,0,0,.04)' }}>
                  <td colSpan={2} style={{ fontWeight: 600, fontSize: 12, padding: '10px 12px' }}>TOTAL</td>
                  <td className="r"><span className="hn">{bd.reduce((a, d) => a + d.pw + d.wd, 0)}</span></td>
                  <td className="r"><span className="ht" style={{ color: '#92400e' }}>{Math.round(bd.reduce((a, d) => a + d.pw, 0) / 3)}</span></td>
                  <td className="r"><span className="ht" style={{ color: 'var(--blue)' }}>{bd.reduce((a, d) => a + d.wd, 0)}</span></td>
                  <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{bd.reduce((a, d) => a + d.hrs, 0)}h</span></td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="sg2" style={{ gap: 18, marginBottom: 18 }}>
          <div className="card">
            <div className="ch"><div className="ct">Hours by Type</div></div>
            <div className="cb">
              {[
                { l: 'Weekday Mon–Thu (12h)', v: tWd,    c: 'var(--blue)' },
                { l: 'Power Weekend (60h)',   v: tPW,    c: '#92400e' },
                { l: 'Holiday',               v: tHol,   c: 'var(--orange)' },
                { l: 'Trauma Week',           v: tTrauma, c: 'var(--red)' },
              ].map((s) => (
                <div key={s.l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(0,0,0,.05)' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{s.l}</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 15, fontWeight: 700, color: s.c }}>{s.v}h</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="ch"><div className="ct">Weekend vs Weekday Breakdown</div></div>
            <div className="cbt">
              <table className="htable">
                <thead>
                  <tr>
                    <th>Resident</th>
                    <th className="r" style={{ color: '#92400e' }}>PW Days</th>
                    <th className="r" style={{ color: '#92400e' }}>PW Hrs</th>
                    <th className="r" style={{ color: 'var(--blue)' }}>WD Days</th>
                    <th className="r" style={{ color: 'var(--blue)' }}>WD Hrs</th>
                    <th className="r" style={{ color: 'var(--red)' }}>Trauma Hrs</th>
                    <th className="r">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map(({ res, pwCount, wdCount, pwHrs, wdHrs, traumaHrs, totalHrs }) => (
                    <tr key={res.id}>
                      <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{avatar(res)}<span style={{ fontWeight: 500 }}>{res.name}</span></div></td>
                      <td className="r"><span className="hn" style={{ color: '#92400e' }}>{pwCount}</span></td>
                      <td className="r"><span className="ht" style={{ color: '#92400e' }}>{pwHrs}h</span></td>
                      <td className="r"><span className="hn" style={{ color: 'var(--blue)' }}>{wdCount}</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--blue)' }}>{wdHrs}h</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--red)' }}>{traumaHrs}h</span></td>
                      <td className="r"><span className="ht" style={{ color: 'var(--green)' }}>{totalHrs}h</span></td>
                    </tr>
                  ))}
                  {(() => {
                    const totPWD = detailRows.reduce((a, r) => a + r.pwCount, 0);
                    const totPWH = detailRows.reduce((a, r) => a + r.pwHrs, 0);
                    const totWDD = detailRows.reduce((a, r) => a + r.wdCount, 0);
                    const totWDH = detailRows.reduce((a, r) => a + r.wdHrs, 0);
                    const totTH  = detailRows.reduce((a, r) => a + r.traumaHrs, 0);
                    const totH   = detailRows.reduce((a, r) => a + r.totalHrs, 0);
                    return (
                      <tr style={{ background: 'rgba(0,0,0,.04)' }}>
                        <td style={{ fontWeight: 600, fontSize: 12, padding: '10px 12px' }}>TOTAL</td>
                        <td className="r"><span className="hn" style={{ color: '#92400e' }}>{totPWD}</span></td>
                        <td className="r"><span className="ht" style={{ color: '#92400e' }}>{totPWH}h</span></td>
                        <td className="r"><span className="hn" style={{ color: 'var(--blue)' }}>{totWDD}</span></td>
                        <td className="r"><span className="ht" style={{ color: 'var(--blue)' }}>{totWDH}h</span></td>
                        <td className="r"><span className="ht" style={{ color: 'var(--red)' }}>{totTH}h</span></td>
                        <td className="r"><span className="ht" style={{ color: 'var(--gold)' }}>{totH}h</span></td>
                      </tr>
                    );
                  })()}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="ch">
            <div className="ct">Monthly Breakdown</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {cmcMonths.map((m) => (
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
              <thead>
                <tr>
                  <th>Resident</th><th>PGY</th>
                  <th className="r">Power Wknds</th>
                  <th className="r">Weekdays</th>
                  <th className="r">Hours</th>
                  <th className="r">Avg/Wk</th>
                </tr>
              </thead>
              <tbody>
                {monthRows.map(({ res, pw, wd, hrs }) => (
                  <tr key={res.id}>
                    <td><div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{avatar(res)}<span style={{ fontWeight: 500 }}>{res.name}</span></div></td>
                    <td><span className="bdg bb">PGY-{res.pgy}</span></td>
                    <td className="r"><span className="hn" style={{ color: '#92400e' }}>{Math.round(pw / 3)}</span></td>
                    <td className="r"><span className="hn" style={{ color: 'var(--blue)' }}>{wd}</span></td>
                    <td className="r"><span className="ht" style={{ color: 'var(--green)' }}>{hrs}h</span></td>
                    <td className="r"><span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: 'var(--muted)' }}>{wks2 > 0 ? Math.round(hrs / wks2) : 0}h/wk</span></td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(0,0,0,.04)' }}>
                  <td colSpan={4} style={{ fontWeight: 600, fontSize: 12, padding: '10px 12px' }}>MONTH TOTAL</td>
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

  function renderCMCEquityTab() {
    if (!cmcDayData) return null;
    const resSet = new Map<string, Resident>();
    cmcDayData.days.forEach((d) => resSet.set(d.res.id, d.res));
    const pool = [...resSet.values()].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

    const bStart = parseDate(cmcDayData.bStart);
    const bEnd   = parseDate(cmcDayData.bEnd);
    const cmcPotentialHours: Record<string, number> = {};
    pool.forEach((r) => {
      const cmcSegs = r.rotations?.filter((s) => s.hospital === 'CMC') ?? [];
      const offDays = new Set(allRequests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
      let pot = 0; let d = new Date(bStart);
      while (d <= bEnd) {
        const dstr = dk(d);
        const inCMC = cmcSegs.length === 0 || cmcSegs.some((s) => dstr >= s.start_date && dstr <= s.end_date);
        if (inCMC && !offDays.has(dstr)) {
          const dow = d.getDay();
          pot += (dow === 0 || dow === 6 || HOLIDAYS.has(dstr)) ? 24 : 12;
        }
        d = addDays(d, 1);
      }
      cmcPotentialHours[r.id] = Math.max(1, pot);
    });
    const cmcUtilRatio: Record<string, number> = {};
    pool.forEach((r) => {
      cmcUtilRatio[r.id] = Math.round(((cmcDayData!.hours[r.id] ?? 0) / cmcPotentialHours[r.id]) * 1000) / 10;
    });

    return (
      <div className="sg2" style={{ gap: 18 }}>
        <div className="card">
          <div className="ch"><div className="ct">CMC Call Days</div></div>
          <div className="cb">{eqBars(pool.map((r) => ({ name: r.name, val: cmcDayData!.counts[r.id] ?? 0, color: r.color })), 'd')}</div>
        </div>
        <div className="card">
          <div className="ch"><div className="ct">CMC Call Hours</div></div>
          <div className="cb">{eqBars(pool.map((r) => ({ name: r.name, val: cmcDayData!.hours[r.id] ?? 0, color: r.color })), 'h')}</div>
        </div>
        <div className="card" style={{ gridColumn: 'span 2' }}>
          <div className="ch">
            <div>
              <div className="ct">CMC Call Utilization Ratio</div>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Assigned hours ÷ potential call hours (rotation window minus official vacation days only) — equal bars = perfectly equitable</div>
            </div>
          </div>
          <div className="cb">{eqBars(pool.map((r) => ({ name: `${r.name}  ${cmcDayData!.hours[r.id] ?? 0}h / ${cmcPotentialHours[r.id]}h potential`, val: cmcUtilRatio[r.id] ?? 0, color: r.color })), '%')}</div>
        </div>
      </div>
    );
  }

  function exportExcel() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx');
    const wb = XLSX.utils.book_new();

    getBlockMonths().forEach(({ year, month }) => {
      const monthName = MONTHS[month];
      const firstDay = new Date(year, month, 1).getDay();
      const dim = new Date(year, month + 1, 0).getDate();

      const aoa: (string | null)[][] = [];
      aoa.push([`${monthName} ${year}`, null, null, null, null, null, null]);
      aoa.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

      let row: (string | null)[] = Array(firstDay).fill(null);
      for (let day = 1; day <= dim; day++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const d = parseDate(key);
        const isHol = HOLIDAYS.has(key);
        const parts: string[] = [`${day}${isHol ? ' 🎉' : ''}`];
        const sr = srMap[key];
        if (sr) parts.push(`Sr: ${sr.res.name}${sr.isBackup ? ' (bkp)' : ''}`);
        if (resBkpDayKeys.has(key)) {
          const rb = (cuhSched!.resBkpDays ?? []).find((x) => x.dateKey === key);
          if (rb) parts.push(`Bkp: ${rb.res.name}`);
        }
        const jr = jrMap[key];
        if (jr) parts.push(`Jr: ${jr.res.name} (${jr.shiftHrs}h)`);
        row.push(parts.join('\n'));

        if (d.getDay() === 6 || day === dim) {
          while (row.length < 7) row.push(null);
          aoa.push(row);
          row = [];
        }
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = Array(7).fill({ wch: 22 });
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      ws['!rows'] = [{ hpt: 20 }, { hpt: 16 }, ...Array(6).fill({ hpt: 60 })];
      XLSX.utils.book_append_sheet(wb, ws, monthName.slice(0, 3));
    });

    XLSX.writeFile(wb, `${cuhSched!.blockName.replace(/[^a-z0-9]/gi, '_')}_schedule.xlsx`);
    showToast('Excel exported');
  }

  function exportICS() {
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//OTO Scheduler//UTSW//EN\n';
    cuhSched!.juniorDays.forEach((jd) => {
      const ds = jd.dateKey.replace(/-/g, '');
      const de = dk(addDays(parseDate(jd.dateKey), 1)).replace(/-/g, '');
      ics += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${ds}\nDTEND;VALUE=DATE:${de}\nSUMMARY:Jr Call – ${jd.res.name} · ${jd.shiftHrs}h\nEND:VEVENT\n`;
    });
    cuhSched!.seniorWeeks.forEach((w) => {
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

  function exportVAExcel() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx');
    if (!vaSched) return;
    const wb = XLSX.utils.book_new();
    const monthSet: { year: number; month: number }[] = [];
    let d = parseDate(vaSched.bStart); const end = parseDate(vaSched.bEnd);
    while (d <= end) {
      const y = d.getFullYear(), m = d.getMonth();
      if (!monthSet.find((x) => x.year === y && x.month === m)) monthSet.push({ year: y, month: m });
      d = addDays(d, 28);
    }
    const ly = end.getFullYear(), lm = end.getMonth();
    if (!monthSet.find((x) => x.year === ly && x.month === lm)) monthSet.push({ year: ly, month: lm });

    monthSet.forEach(({ year, month }) => {
      const monthName = MONTHS[month];
      const firstDay = new Date(year, month, 1).getDay();
      const dim = new Date(year, month + 1, 0).getDate();
      const aoa: (string | null)[][] = [];
      aoa.push([`${monthName} ${year} — VA Call`, null, null, null, null, null, null]);
      aoa.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
      let row: (string | null)[] = Array(firstDay).fill(null);
      for (let day = 1; day <= dim; day++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const idx = vaWeekMap[key];
        const w = idx !== undefined ? vaSched!.weeks[idx] : null;
        const parts: string[] = [`${day}${HOLIDAYS.has(key) ? ' 🎉' : ''}`];
        if (w) parts.push(w.res.name);
        row.push(parts.join('\n'));
        if (parseDate(key).getDay() === 6 || day === dim) {
          while (row.length < 7) row.push(null);
          aoa.push(row); row = [];
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = Array(7).fill({ wch: 20 });
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      ws['!rows'] = [{ hpt: 20 }, { hpt: 16 }, ...Array(6).fill({ hpt: 50 })];
      XLSX.utils.book_append_sheet(wb, ws, monthName.slice(0, 3));
    });
    XLSX.writeFile(wb, `${vaSched!.blockName.replace(/[^a-z0-9]/gi, '_')}_VA_schedule.xlsx`);
    showToast('VA Excel exported');
  }

  function exportVAICS() {
    if (!vaSched) return;
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//OTO Scheduler//UTSW//EN\n';
    vaSched.weeks.forEach((w) => {
      const ds = w.wS.replace(/-/g, '');
      const de = dk(addDays(parseDate(w.wE), 1)).replace(/-/g, '');
      ics += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${ds}\nDTEND;VALUE=DATE:${de}\nSUMMARY:VA Call – ${w.res.name}\nEND:VEVENT\n`;
    });
    ics += 'END:VCALENDAR';
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'va_call_schedule.ics'; a.click();
    URL.revokeObjectURL(url);
    showToast('VA iCal exported');
  }

  function exportCMCExcel() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const XLSX = require('xlsx') as typeof import('xlsx');
    if (!cmcDayData) return;
    const wb = XLSX.utils.book_new();
    const monthSet: { year: number; month: number }[] = [];
    let d = parseDate(cmcDayData.bStart); const end = parseDate(cmcDayData.bEnd);
    while (d <= end) {
      const y = d.getFullYear(), m = d.getMonth();
      if (!monthSet.find((x) => x.year === y && x.month === m)) monthSet.push({ year: y, month: m });
      d = addDays(d, 28);
    }
    const ly = end.getFullYear(), lm = end.getMonth();
    if (!monthSet.find((x) => x.year === ly && x.month === lm)) monthSet.push({ year: ly, month: lm });

    monthSet.forEach(({ year, month }) => {
      const monthName = MONTHS[month];
      const firstDay = new Date(year, month, 1).getDay();
      const dim = new Date(year, month + 1, 0).getDate();
      const aoa: (string | null)[][] = [];
      aoa.push([`${monthName} ${year} — CMC Call`, null, null, null, null, null, null]);
      aoa.push(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
      let row: (string | null)[] = Array(firstDay).fill(null);
      for (let day = 1; day <= dim; day++) {
        const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const entry = cmcDayMap[key];
        const parts: string[] = [`${day}${HOLIDAYS.has(key) ? ' 🎉' : ''}${TRAUMA_WEEKS.has(key) ? ' 🚨' : ''}`];
        if (entry) parts.push(entry.res.name);
        row.push(parts.join('\n'));
        if (parseDate(key).getDay() === 6 || day === dim) {
          while (row.length < 7) row.push(null);
          aoa.push(row); row = [];
        }
      }
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws['!cols'] = Array(7).fill({ wch: 20 });
      ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }];
      ws['!rows'] = [{ hpt: 20 }, { hpt: 16 }, ...Array(6).fill({ hpt: 50 })];
      XLSX.utils.book_append_sheet(wb, ws, monthName.slice(0, 3));
    });
    XLSX.writeFile(wb, `${cmcDayData!.blockName.replace(/[^a-z0-9]/gi, '_')}_CMC_schedule.xlsx`);
    showToast('CMC Excel exported');
  }

  function exportCMCICS() {
    if (!cmcDayData) return;
    let ics = 'BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//OTO Scheduler//UTSW//EN\n';
    cmcDayData.days.forEach((day) => {
      const ds = day.dateKey.replace(/-/g, '');
      const de = dk(addDays(parseDate(day.dateKey), 1)).replace(/-/g, '');
      ics += `BEGIN:VEVENT\nDTSTART;VALUE=DATE:${ds}\nDTEND;VALUE=DATE:${de}\nSUMMARY:CMC Call – ${day.res.name} · ${day.shiftHrs}h\nEND:VEVENT\n`;
    });
    ics += 'END:VCALENDAR';
    const blob = new Blob([ics], { type: 'text/calendar' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'cmc_call_schedule.ics'; a.click();
    URL.revokeObjectURL(url);
    showToast('CMC iCal exported');
  }

  function navCal(dir: number) {
    let m = calMonth + dir; let y = calYear;
    if (m > 11) { m = 0; y++; } if (m < 0) { m = 11; y--; }
    setCalYear(y); setCalMonth(m);
  }

  const TABS: { id: Tab; label: string }[] = [
    ...(role === 'resident' && currentResId ? [{ id: 'stats' as Tab, label: '📊 My Stats' }] : []),
    { id: 'calendar', label: '📅 Calendar' },
    ...(role === 'chief' ? [
      { id: 'hours' as Tab, label: '⏱ Hours' },
      { id: 'equity' as Tab, label: '📊 Equity' },
    ] : []),
  ];

  // ── Per-tab schedule filtering ────────────────────────────────────────────────
  const currentSchedId = (schedule as AnyScheduleData & { _scheduleId?: string })?._scheduleId ?? activeScheduleId;
  const tabScheduleList = schedules.filter((s) => (s.schedule_type ?? 'cuh_pmh') === hospitalTab);
  const scheduleMatchesTab = schedule && (
    hospitalTab === 'va' ? schedule.type === 'va' :
    hospitalTab === 'cmc' ? schedule.type === 'cmc' :
    (schedule.type !== 'va' && schedule.type !== 'cmc')
  );
  const currentTabSchedule = scheduleMatchesTab ? schedule : null;

  return (
    <div>
      {/* Hospital type tab bar */}
      <div className="tabrow" style={{ marginBottom: 16 }}>
        {([
          { id: 'cuh_pmh' as HospitalTab, label: 'CUH / PMH' },
          { id: 'va'      as HospitalTab, label: 'VA' },
          { id: 'cmc'     as HospitalTab, label: 'CMC' },
        ]).map(({ id, label }) => {
          const typeCount = schedules.filter((s) => (s.schedule_type ?? 'cuh_pmh') === id).length;
          return (
            <button
              key={id}
              className={`tabbtn${hospitalTab === id ? ' active' : ''}`}
              onClick={() => switchToTab(id)}
            >
              {label}
              {typeCount > 0 && <span style={{ marginLeft: 5, fontSize: 10, opacity: 0.7 }}>({typeCount})</span>}
            </button>
          );
        })}
      </div>

      {tabLoading && <div style={{ color: 'var(--muted)', padding: 20, textAlign: 'center' }}>Loading…</div>}

      {!tabLoading && (
        <div>
          {/* Per-tab schedule selector */}
          {role === 'chief' && tabScheduleList.length > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 600 }}>SCHEDULE</span>
              {tabScheduleList.map((s) => {
                const isActive = s.id === currentSchedId;
                return (
                  <span key={s.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                    <button
                      className={`btn bsm${isActive ? ' bg' : ' bgh'}`}
                      onClick={async () => {
                        if (!isActive) await onScheduleSelected?.(s.id);
                      }}
                      style={{ position: 'relative' }}
                    >
                      {s.name}
                      {s.published && <span style={{ marginLeft: 5, fontSize: 9, color: 'var(--green)', fontWeight: 700 }}>●</span>}
                    </button>
                    {role === 'chief' && (
                      <button
                        style={{ fontSize: 9, color: 'var(--red)', marginLeft: 2, cursor: 'pointer', border: 'none', background: 'none', padding: '0 3px' }}
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (!confirm(`Delete "${s.name}"?`)) return;
                          await onScheduleDeleted?.(s.id);
                          onScheduleListChanged?.();
                          showToast('Schedule deleted');
                        }}
                        title="Delete schedule"
                      >✕</button>
                    )}
                  </span>
                );
              })}
              <button className="btn bsm bgh" onClick={onRegenerate} style={{ marginLeft: 'auto' }}>＋ New Schedule</button>
            </div>
          )}

          {/* VA tab */}
          {hospitalTab === 'va' && currentTabSchedule && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="page-title">
                  {currentTabSchedule.blockName}
                  <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: 'var(--orange)', verticalAlign: 'middle' }}>VA</span>
                </div>
                {role === 'chief' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {tabScheduleList.length === 0 && <button className="btn bgh bsm" onClick={onRegenerate}>← Regenerate</button>}
                    <button className={`btn bsm ${published ? 'bg' : 'bgh'}`} onClick={togglePublish}>
                      {published ? '✓ Published — Unpublish' : 'Publish to Residents'}
                    </button>
                    <button className="btn bgh bsm" onClick={exportVAICS}>📅 iCal</button>
                    <button className="btn bg bsm" onClick={exportVAExcel}>📊 Excel</button>
                  </div>
                )}
              </div>
              <div className="page-sub">{fmtDate(currentTabSchedule.bStart)} → {fmtDate(currentTabSchedule.bEnd)}</div>
              <div className="tabrow">
                {TABS.map((t) => (
                  <button key={t.id} className={`tabbtn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
              </div>
              {tab === 'calendar' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <button className="btn bgh bsm" onClick={() => navCal(-1)}>‹ Prev</button>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center' }}>{MONTHS[calMonth]} {calYear}</div>
                    {role === 'chief' && !selectMode && (
                      <button className="btn bgh bsm" onClick={() => setSelectMode(true)}>☑ Select Days</button>
                    )}
                    {role === 'chief' && selectMode && (
                      <>
                        {selectedKeys.length > 0 && (
                          <button className="btn bg bsm" onClick={() => {
                            const weekIdx = vaWeekMap[selectedKeys[0]];
                            if (weekIdx !== undefined) { setPoolOverrideResId(vaSched!.weeks[weekIdx].res.id); setVaOverride({ open: true, weekIndex: weekIdx }); }
                            setSelectMode(false); setSelectedKeys([]);
                          }}>Override week</button>
                        )}
                        <button className="btn bgh bsm" onClick={() => { setSelectMode(false); setSelectedKeys([]); }}>✕ Cancel</button>
                      </>
                    )}
                    <button className="btn bgh bsm" onClick={() => navCal(1)}>Next ›</button>
                  </div>
                  {selectMode && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: 6 }}>
                      Click a day to select its week · {selectedKeys.length > 0 ? `Week of ${selectedKeys[0]} selected` : 'none selected'}
                    </div>
                  )}
                  {!selectMode && role === 'chief' && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '5px 10px', background: 'rgba(0,0,0,0.04)', borderRadius: 6 }}>
                      Click any day to override the weekly assignment
                    </div>
                  )}
                  <div className="calgrid-wrap">
                    <div className="calgrid">
                      <div className="cdow" style={{ background: 'var(--s2)' }}>Wk</div>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d} className="cdow">{d}</div>)}
                      {renderCalendar()}
                    </div>
                  </div>
                </div>
              )}
              {tab === 'stats'  && renderVAStatsTab()}
              {tab === 'hours'  && renderVAHoursTab()}
              {tab === 'equity' && renderVAEquityTab()}
            </div>
          )}

          {hospitalTab === 'va' && !currentTabSchedule && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              <div style={{ marginBottom: 12 }}>No VA schedule generated yet.</div>
              {role === 'chief' && <button className="btn bg" onClick={onRegenerate}>Generate VA Schedule →</button>}
            </div>
          )}

          {/* CMC tab */}
          {hospitalTab === 'cmc' && currentTabSchedule && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="page-title">
                  {currentTabSchedule.blockName}
                  <span style={{ marginLeft: 10, fontSize: 12, fontWeight: 600, color: 'var(--blue)', verticalAlign: 'middle' }}>CMC</span>
                </div>
                {role === 'chief' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {tabScheduleList.length === 0 && <button className="btn bgh bsm" onClick={onRegenerate}>← Regenerate</button>}
                    <button className={`btn bsm ${published ? 'bg' : 'bgh'}`} onClick={togglePublish}>
                      {published ? '✓ Published — Unpublish' : 'Publish to Residents'}
                    </button>
                    <button className="btn bgh bsm" onClick={exportCMCICS}>📅 iCal</button>
                    <button className="btn bg bsm" onClick={exportCMCExcel}>📊 Excel</button>
                  </div>
                )}
              </div>
              <div className="page-sub">{fmtDate(currentTabSchedule.bStart)} → {fmtDate(currentTabSchedule.bEnd)}</div>
              <div className="tabrow">
                {TABS.map((t) => (
                  <button key={t.id} className={`tabbtn${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
                ))}
              </div>
              {tab === 'calendar' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <button className="btn bgh bsm" onClick={() => navCal(-1)}>‹ Prev</button>
                    <div style={{ fontFamily: "'Syne',sans-serif", fontSize: 16, fontWeight: 700, flex: 1, textAlign: 'center' }}>{MONTHS[calMonth]} {calYear}</div>
                    {role === 'chief' && !selectMode && (
                      <button className="btn bgh bsm" onClick={() => setSelectMode(true)}>☑ Select Days</button>
                    )}
                    {role === 'chief' && selectMode && (
                      <>
                        {selectedKeys.length > 0 && (
                          <button className="btn bg bsm" onClick={() => {
                            const entry = cmcDayMap[selectedKeys[0]];
                            if (entry) setPoolOverrideResId(entry.res.id);
                            setCmcOverride({ open: true, dateKey: selectedKeys[0] });
                          }}>Override {selectedKeys.length} day{selectedKeys.length !== 1 ? 's' : ''}</button>
                        )}
                        <button className="btn bgh bsm" onClick={() => { setSelectMode(false); setSelectedKeys([]); }}>✕ Cancel</button>
                      </>
                    )}
                    <button className="btn bgh bsm" onClick={() => navCal(1)}>Next ›</button>
                  </div>
                  {selectMode && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: 6 }}>
                      Click days to select · {selectedKeys.length} selected
                    </div>
                  )}
                  {!selectMode && role === 'chief' && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '5px 10px', background: 'rgba(0,0,0,0.04)', borderRadius: 6 }}>
                      Click any day to override the assignment
                    </div>
                  )}
                  <div className="calgrid-wrap">
                    <div className="calgrid">
                      <div className="cdow" style={{ background: 'var(--s2)' }}>Wk</div>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => <div key={d} className="cdow">{d}</div>)}
                      {renderCalendar()}
                    </div>
                  </div>
                </div>
              )}
              {tab === 'stats'  && renderCMCStatsTab()}
              {tab === 'hours'  && renderCMCHoursTab()}
              {tab === 'equity' && renderCMCEquityTab()}
            </div>
          )}

          {hospitalTab === 'cmc' && !currentTabSchedule && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              <div style={{ marginBottom: 12 }}>No CMC schedule generated yet.</div>
              {role === 'chief' && <button className="btn bg" onClick={onRegenerate}>Generate CMC Schedule →</button>}
            </div>
          )}

          {/* CUH/PMH tab */}
          {hospitalTab === 'cuh_pmh' && !currentTabSchedule && (
            <div style={{ textAlign: 'center', padding: 48, color: 'var(--muted)' }}>
              <div style={{ marginBottom: 12 }}>No CUH/PMH schedule generated yet.</div>
              {role === 'chief' && <button className="btn bg" onClick={onRegenerate}>Generate Schedule →</button>}
            </div>
          )}

          {hospitalTab === 'cuh_pmh' && currentTabSchedule && (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <div className="page-title">{currentTabSchedule.blockName}</div>
                {role === 'chief' && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {tabScheduleList.length === 0 && (
                      <button className="btn bgh bsm" onClick={onRegenerate}>← Regenerate</button>
                    )}
                    <button
                      className={`btn bsm ${published ? 'bg' : 'bgh'}`}
                      onClick={togglePublish}
                    >
                      {published ? '✓ Published — Unpublish' : 'Publish to Residents'}
                    </button>
                    <button className="btn bgh bsm" onClick={exportICS}>📅 iCal</button>
                    <button className="btn bg bsm" onClick={exportExcel}>📊 Excel</button>
                  </div>
                )}
              </div>

              <div className="page-sub">
                {fmtDate(currentTabSchedule.bStart)} → {fmtDate(currentTabSchedule.bEnd)}
              </div>

              {/* CUH/PMH sub-tabs */}
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
                    {role === 'chief' && !selectMode && (
                      <button className="btn bgh bsm" onClick={() => setSelectMode(true)}>☑ Select Days</button>
                    )}
                    {role === 'chief' && selectMode && (
                      <>
                        {selectedKeys.length > 0 && (
                          <button
                            className="btn bg bsm"
                            onClick={() => { setOverrideKeys([...selectedKeys]); }}
                          >
                            Override {selectedKeys.length} day{selectedKeys.length !== 1 ? 's' : ''}
                          </button>
                        )}
                        <button
                          className="btn bgh bsm"
                          onClick={() => { setSelectMode(false); setSelectedKeys([]); }}
                        >
                          ✕ Cancel
                        </button>
                      </>
                    )}
                    <button className="btn bgh bsm" onClick={() => navCal(1)}>Next ›</button>
                  </div>
                  {selectMode && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 10, padding: '6px 10px', background: 'rgba(0,0,0,0.05)', borderRadius: 6 }}>
                      Click days to select · {selectedKeys.length} selected
                    </div>
                  )}
                  <div className="calgrid-wrap">
                    <div className="calgrid">
                      <div className="cdow" style={{ background: 'var(--s2)' }}>Wk</div>
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                        <div key={d} className="cdow">{d}</div>
                      ))}
                      {renderCalendar()}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'stats' && renderStatsTab()}
              {tab === 'hours' && renderHoursTab()}
              {tab === 'equity' && renderEquityTab()}

              {/* Print-only calendar */}
              <div className="print-cal">
                {getBlockMonths().map(({ year, month }) => (
                  <div key={`${year}-${month}`} className="print-month">
                    <div className="print-month-title">{MONTHS[month]} {year}</div>
                    <div className="calgrid no-wl">
                      {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map((d) => (
                        <div key={d} className="cdow">{d}</div>
                      ))}
                      {renderCalendarMonth(year, month, true)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Override modal */}
              {role === 'chief' && (
                <OverrideModal
                  open={overrideKeys.length > 0}
                  dateKeys={overrideKeys}
                  schedule={currentTabSchedule as ScheduleData}
                  residents={residents}
                  onSave={(updated) => {
                    onScheduleChanged(updated);
                    setOverrideKeys([]);
                    setSelectedKeys([]);
                    setSelectMode(false);
                  }}
                  onClose={() => {
                    setOverrideKeys([]);
                    setSelectedKeys([]);
                    setSelectMode(false);
                  }}
                  showToast={showToast}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* VA override modal */}
      {vaOverride.open && vaSched && (
        <div className="modal-bg open">
          <div className="modal">
            <div className="mh">
              <div>
                <div className="mt">Override VA Week</div>
                <div className="ms">Week of {fmtShort(vaSched.weeks[vaOverride.weekIndex]?.wS ?? '')} – {fmtShort(vaSched.weeks[vaOverride.weekIndex]?.wE ?? '')}</div>
              </div>
              <button className="mx" onClick={() => setVaOverride({ open: false, weekIndex: -1 })}>✕</button>
            </div>
            <div className="mb">
              <div className="fl">
                <label className="flb">Assign VA call</label>
                <select value={poolOverrideResId} onChange={(e) => setPoolOverrideResId(e.target.value)}>
                  <option value="">— select resident —</option>
                  {residents.filter((r) => r.status !== 'away').map((r) => (
                    <option key={r.id} value={r.id}>{r.name} (PGY-{r.pgy})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mf">
              <button className="btn bgh" onClick={() => setVaOverride({ open: false, weekIndex: -1 })}>Cancel</button>
              <button className="btn bg" disabled={!poolOverrideResId} onClick={() => {
                const newRes = residents.find((r) => r.id === poolOverrideResId);
                if (!newRes || !vaSched) return;
                const oldWeek = vaSched.weeks[vaOverride.weekIndex];
                const oldResId = oldWeek.res.id; const newResId = newRes.id;
                const newCounts = { ...vaSched.counts }; const newDays2 = { ...vaSched.days }; const newHours2 = { ...vaSched.hours };
                newCounts[oldResId] = Math.max(0, (newCounts[oldResId] ?? 0) - 1); newCounts[newResId] = (newCounts[newResId] ?? 0) + 1;
                let d2 = parseDate(oldWeek.wS); const wEnd = parseDate(oldWeek.wE);
                while (d2 <= wEnd) {
                  const key2 = dk(d2); const dow2 = d2.getDay();
                  const hrs2 = (dow2 === 0 || dow2 === 6 || HOLIDAYS.has(key2)) ? 24 : 12;
                  newDays2[oldResId] = Math.max(0, (newDays2[oldResId] ?? 0) - 1); newDays2[newResId] = (newDays2[newResId] ?? 0) + 1;
                  newHours2[oldResId] = Math.max(0, (newHours2[oldResId] ?? 0) - hrs2); newHours2[newResId] = (newHours2[newResId] ?? 0) + hrs2;
                  d2 = addDays(d2, 1);
                }
                const newWeeks = [...vaSched.weeks];
                newWeeks[vaOverride.weekIndex] = { ...oldWeek, res: newRes, override: true };
                persistSchedule({ ...vaSched, weeks: newWeeks, counts: newCounts, days: newDays2, hours: newHours2 });
                setVaOverride({ open: false, weekIndex: -1 });
                showToast('VA override saved');
              }}>Save Override</button>
            </div>
          </div>
        </div>
      )}

      {/* CMC override modal */}
      {cmcOverride.open && cmcDayData && (
        <div className="modal-bg open">
          <div className="modal">
            <div className="mh">
              <div>
                <div className="mt">Override CMC {selectedKeys.length > 1 ? `${selectedKeys.length} Days` : 'Day'}</div>
                <div className="ms">{selectedKeys.length > 1 ? `${fmtShort(selectedKeys[0])} – ${fmtShort(selectedKeys[selectedKeys.length - 1])}` : fmtShort(cmcOverride.dateKey)}</div>
              </div>
              <button className="mx" onClick={() => { setCmcOverride({ open: false, dateKey: '' }); setSelectedKeys([]); setSelectMode(false); }}>✕</button>
            </div>
            <div className="mb">
              <div className="fl">
                <label className="flb">Assign CMC call</label>
                <select value={poolOverrideResId} onChange={(e) => setPoolOverrideResId(e.target.value)}>
                  <option value="">— select resident —</option>
                  {residents.filter((r) => r.status === 'active' && r.pgy >= 2 && r.pgy <= 4).map((r) => (
                    <option key={r.id} value={r.id}>{r.name} (PGY-{r.pgy})</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mf">
              <button className="btn bgh" onClick={() => { setCmcOverride({ open: false, dateKey: '' }); setSelectedKeys([]); setSelectMode(false); }}>Cancel</button>
              <button className="btn bg" disabled={!poolOverrideResId} onClick={() => {
                const newRes = residents.find((r) => r.id === poolOverrideResId);
                if (!newRes || !cmcDayData) return;
                const keysToUpdate = selectedKeys.length > 1 ? selectedKeys : [cmcOverride.dateKey];
                const newDaysArr = cmcDayData.days.map((d) => keysToUpdate.includes(d.dateKey) ? { ...d, res: newRes, override: true } : d);
                const finalCounts: Record<string, number> = {}; const finalHours: Record<string, number> = {};
                newDaysArr.forEach((d) => { finalCounts[d.res.id] = (finalCounts[d.res.id] ?? 0) + 1; finalHours[d.res.id] = (finalHours[d.res.id] ?? 0) + d.shiftHrs; });
                persistSchedule({ ...cmcDayData, days: newDaysArr, counts: finalCounts, hours: finalHours });
                setCmcOverride({ open: false, dateKey: '' });
                setSelectedKeys([]); setSelectMode(false);
                showToast('CMC override saved');
              }}>Save Override</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoundingEditor({ dateKey, residents, currentOverride, onSave }: {
  dateKey: string;
  residents: Resident[];
  currentOverride?: { cuhResId?: string | null; pmhResId?: string | null };
  onSave: (cuhResId: string | null, pmhResId: string | null) => Promise<void>;
}) {
  const [cuhId, setCuhId] = useState<string>(
    currentOverride?.cuhResId !== undefined
      ? (currentOverride.cuhResId === null ? '__none__' : currentOverride.cuhResId)
      : '__infer__'
  );
  const [pmhId, setPmhId] = useState<string>(
    currentOverride?.pmhResId !== undefined
      ? (currentOverride.pmhResId === null ? '__none__' : currentOverride.pmhResId)
      : '__infer__'
  );
  const [saving, setSaving] = useState(false);
  const cuhResidents = residents.filter(r => r.hospital === 'CUH' && r.status !== 'away');
  const pmhResidents = residents.filter(r => r.hospital === 'PMH' && r.status !== 'away');
  void dateKey;
  return (
    <div style={{ background: 'var(--s2)', border: '1px solid var(--border)', borderRadius: 6, padding: 8, marginTop: 4, fontSize: 11 }}>
      <div style={{ marginBottom: 6, fontWeight: 600 }}>Override Rounding</div>
      <div style={{ marginBottom: 4 }}>
        <label style={{ color: 'var(--muted)', display: 'block', marginBottom: 2 }}>CUH Rounder</label>
        <select style={{ width: '100%', fontSize: 11 }} value={cuhId} onChange={e => setCuhId(e.target.value)}>
          <option value="__infer__">— Auto (from schedule) —</option>
          <option value="__none__">None</option>
          {cuhResidents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 6 }}>
        <label style={{ color: 'var(--muted)', display: 'block', marginBottom: 2 }}>PMH Rounder</label>
        <select style={{ width: '100%', fontSize: 11 }} value={pmhId} onChange={e => setPmhId(e.target.value)}>
          <option value="__infer__">— Auto (from schedule) —</option>
          <option value="__intern__">Parkland intern</option>
          <option value="__none__">None</option>
          {pmhResidents.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <button
        className="btn bg bsm"
        style={{ width: '100%', fontSize: 10 }}
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          const resolvedCuh = cuhId === '__infer__' ? undefined : cuhId === '__none__' ? null : cuhId;
          const resolvedPmh = pmhId === '__infer__' ? undefined : pmhId === '__intern__' ? '__intern__' : pmhId === '__none__' ? null : pmhId;
          await onSave(resolvedCuh ?? null, resolvedPmh ?? null);
          setSaving(false);
        }}
      >
        {saving ? '...' : 'Save'}
      </button>
    </div>
  );
}
