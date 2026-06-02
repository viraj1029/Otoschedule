'use client';

import { useState } from 'react';
import type { Block, Resident, Request, ScheduleData } from '@/types';
import { HOLIDAYS, parseDate, generateSchedule } from '@/lib/scheduler';
import type { ScheduleMode } from '@/lib/scheduler';
import { api } from '../App';

interface Props {
  block: Block | null;
  residents: Resident[];
  allRequests: Request[];
  schedule: ScheduleData | null;
  onScheduleGenerated: (sched: ScheduleData) => void;
  onBack: () => void;
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
  const vacDays = new Set(allRequests.filter((r) => r.resident_id === resId && r.type === 'vacation').map((r) => r.date));
  const weekends = new Set(allRequests.filter((r) => r.resident_id === resId && r.type === 'weekend').map((r) => r.date));
  return { vacDays, weekends };
}

export default function Generate({ block, residents, allRequests, onScheduleGenerated, onBack, showToast }: Props) {
  const [generating, setGenerating] = useState(false);
  const [mode, setMode] = useState<ScheduleMode>('merged');

  const srs = residents.filter((r) => r.pgy >= 4 && r.status === 'active');
  const resR = residents.filter((r) => r.pgy >= 4 && r.status === 'research');
  const jrs = residents.filter((r) => r.pgy <= 3 && r.status === 'active');

  const bStart = block ? parseDate(block.start_date) : parseDate('2026-07-01');
  const bEnd = block ? parseDate(block.end_date) : parseDate('2026-09-30');

  function poolList(pool: Resident[]) {
    if (!pool.length) return (
      <div style={{ color: 'var(--muted)', fontStyle: 'italic', fontSize: 13 }}>None</div>
    );
    return pool.map((r) => (
      <div key={r.id} style={{
        display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
        borderBottom: '1px solid rgba(255,255,255,.04)',
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
    setGenerating(true);
    try {
      const scheduleData = generateSchedule(
        residents,
        allRequests,
        block?.name ?? 'CUH/PMH Block',
        block?.start_date ?? '2026-07-01',
        block?.end_date ?? '2026-09-30',
        block?.published ?? false,
        mode,
      );
      await api('/schedule/generate', 'POST', { scheduleData });
      onScheduleGenerated(scheduleData);
      showToast('Schedule generated & saved!');
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setGenerating(false);
    }
  }

  const sortedAll = [...residents].sort((a, b) => b.pgy - a.pgy);

  return (
    <div>
      <div className="page-title">Generate Schedule</div>
      <div className="page-sub">
        Review pools and requests, then generate. The schedule is saved to the database.
        You can publish it when ready so residents can view it.
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
        <div className="ch"><div className="ct">Request Summary</div></div>
        <div className="cb">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px,1fr))', gap: 8 }}>
            {sortedAll.map((r) => {
              const { vacDays, weekends } = getResRequests(allRequests, r.id);
              const vac = [...vacDays].filter((d) => {
                const dd = parseDate(d); return dd >= bStart && dd <= bEnd && !HOLIDAYS.has(d);
              }).length;
              return (
                <div key={r.id} style={{
                  background: 'var(--s2)', border: '1px solid var(--border)',
                  borderRadius: 'var(--r)', padding: 10,
                }}>
                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{r.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)', fontFamily: "'JetBrains Mono',monospace", marginBottom: 6 }}>
                    PGY-{r.pgy} · {r.hospital}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <span className="bdg bb" style={{ fontSize: 9 }}>{vac} vac</span>
                    <span className="bdg bp" style={{ fontSize: 9 }}>{weekends.size} wkd</span>
                  </div>
                </div>
              );
            })}
          </div>
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
