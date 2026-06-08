'use client';

import { useState } from 'react';
import type { Block, Resident, Request, ScheduleData } from '@/types';
import { parseDate, generateSchedule } from '@/lib/scheduler';
import type { ScheduleMode } from '@/lib/scheduler';
import { api } from '../App';

interface Props {
  block: Block | null;
  residents: Resident[];
  allRequests: Request[];
  schedule: ScheduleData | null;
  onScheduleGenerated: (sched: ScheduleData, scheduleId: string) => void;
  onBack: () => void;
  showToast: (msg: string, err?: boolean) => void;
}

function defaultScheduleName(start: string, end: string): string {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const s = parseDate(start); const e = parseDate(end);
  return s.getFullYear() === e.getFullYear()
    ? `${M[s.getMonth()]} – ${M[e.getMonth()]} ${s.getFullYear()}`
    : `${M[s.getMonth()]} ${s.getFullYear()} – ${M[e.getMonth()]} ${e.getFullYear()}`;
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


export default function Generate({ block, residents, allRequests, onScheduleGenerated, onBack, showToast }: Props) {
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<ScheduleMode>('merged');

  const yearStart = block?.start_date ?? '2026-07-01';
  const yearEnd = block?.end_date ?? '2027-06-30';

  // Default end = end of first quarter within the year
  const defaultEnd = (() => {
    const s = parseDate(yearStart); const m = s.getMonth(); const y = s.getFullYear();
    if (m >= 6 && m <= 8) return `${y}-09-30`;
    if (m >= 9 && m <= 11) return `${y}-12-31`;
    if (m >= 0 && m <= 2) return `${y}-03-31`;
    return `${y}-06-30`;
  })();

  const [schedStart, setSchedStart] = useState(yearStart);
  const [schedEnd, setSchedEnd] = useState(defaultEnd);
  const [scheduleName, setScheduleName] = useState(() => defaultScheduleName(yearStart, defaultEnd));
  const [nameEdited, setNameEdited] = useState(false);

  function handleStartChange(v: string) {
    setSchedStart(v);
    if (!nameEdited) setScheduleName(defaultScheduleName(v, schedEnd));
  }
  function handleEndChange(v: string) {
    setSchedEnd(v);
    if (!nameEdited) setScheduleName(defaultScheduleName(schedStart, v));
  }

  const srs = residents.filter((r) => r.pgy >= 4 && r.status === 'active');
  const resR = residents.filter((r) => r.pgy >= 4 && r.status === 'research');
  const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');

  function poolList(pool: Resident[]) {
    if (!pool.length) return (
      <div style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 }}>None</div>
    );
    return pool.map((r) => (
      <div key={r.id} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
        borderBottom: '1px solid rgba(0,0,0,.05)',
      }}>
        {avatar(r)}
        <div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{r.name}</div>
          <div style={{ fontSize: 11, color: 'var(--muted)' }}>PGY-{r.pgy} · {r.hospital}</div>
        </div>
      </div>
    ));
  }

  async function generateAndSave() {
    if (!schedStart || !schedEnd) { showToast('Set start and end dates', true); return; }
    if (parseDate(schedStart) > parseDate(schedEnd)) { showToast('Start must be before end', true); return; }
    setGenerating(true);
    try {
      const carryIn = await api<Record<string, { hours: number; availDays: number }>>('/jr-carry');
      const scheduleData = generateSchedule(
        residents,
        allRequests,
        scheduleName,
        schedStart,
        schedEnd,
        false,
        mode,
        carryIn,
      );
      const result = await api<{ ok: boolean; id: string }>('/schedule/generate', 'POST', {
        scheduleData,
        name: scheduleName,
        start_date: schedStart,
        end_date: schedEnd,
      });
      onScheduleGenerated(scheduleData, result.id);
      showToast('Schedule generated & saved!');
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <div className="page-title">Generate Schedule</div>
      <div className="page-sub">
        Set the date range for this schedule period, then generate. Multiple schedules can be stored
        under the same academic year and viewed independently in Schedule View.
      </div>

      {/* Schedule period */}
      <div className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><div className="ct">Schedule Period</div></div>
        <div className="cb">
          <div className="fg f2" style={{ marginBottom: 14 }}>
            <div className="fl">
              <label className="flb">Start Date</label>
              <input type="date" value={schedStart} min={yearStart} max={yearEnd}
                onChange={(e) => handleStartChange(e.target.value)} />
            </div>
            <div className="fl">
              <label className="flb">End Date</label>
              <input type="date" value={schedEnd} min={schedStart} max={yearEnd}
                onChange={(e) => handleEndChange(e.target.value)} />
            </div>
          </div>
          <div className="fl">
            <label className="flb">Schedule Name</label>
            <input type="text" value={scheduleName}
              onChange={(e) => { setScheduleName(e.target.value); setNameEdited(true); }}
              placeholder="e.g. Jul – Sep 2026" />
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            Academic year: {yearStart} → {yearEnd}. Only residents whose rotation windows overlap this period are scheduled.
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18, marginBottom: 18 }}>
        <div className="card">
          <div className="ch">
            <div className="ct">Senior Pool</div>
            <span className="bdg bg2">{srs.length} residents</span>
          </div>
          <div className="cb">{poolList(srs)}</div>
        </div>
        <div className="card">
          <div className="ch">
            <div className="ct">Research Senior</div>
            <span className="bdg bpk">{resR.length} resident{resR.length !== 1 ? 's' : ''}</span>
          </div>
          <div className="cb">{poolList(resR)}</div>
        </div>
        <div className="card">
          <div className="ch">
            <div className="ct">Junior Pool</div>
            <span className="bdg bb">{jrs.length} residents</span>
          </div>
          <div className="cb">{poolList(jrs)}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <div className="ch"><div className="ct">Schedule Type</div></div>
        <div className="cb" style={{ display: 'flex', gap: 10 }}>
          {([
            { id: 'merged', label: '⚡ Merged (Senior + Junior)', desc: 'Generates both senior call weeks and junior call days together.' },
            { id: 'senior', label: '🔶 Senior Only', desc: 'Generates senior call weeks only. No junior days.' },
            { id: 'junior', label: '🔷 Junior Only', desc: 'Generates junior call days only. No senior weeks.' },
          ] as { id: ScheduleMode; label: string; desc: string }[]).map(({ id, label, desc }) => (
            <div
              key={id}
              onClick={() => setMode(id)}
              style={{
                flex: 1, padding: '12px 14px', borderRadius: 'var(--r)',
                border: `2px solid ${mode === id ? 'var(--blue)' : 'var(--border)'}`,
                background: mode === id ? 'var(--blue-dim)' : 'var(--s2)',
                cursor: 'pointer', transition: 'all .15s',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <button className="btn bgh" onClick={onBack}>← Back</button>
        <button
          className="btn bg"
          style={{ fontSize: 15, padding: '12px 32px' }}
          onClick={generateAndSave}
          disabled={generating}
        >
          {generating ? <><span className="spinner" /> Generating…</> : '⚡ Generate & Save Schedule'}
        </button>
      </div>
    </div>
  );
}
