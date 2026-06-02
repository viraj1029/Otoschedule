'use client';

import { useState, useEffect } from 'react';
import type { Block, Resident, Request, Role, ScheduleData } from '@/types';
import { HOLIDAYS, parseDate, fmtShort } from '@/lib/scheduler';
import { api } from '../App';
import ScheduleView from './ScheduleView';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DOW = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

interface Props {
  block: Block | null;
  residents: Resident[];
  allRequests: Request[];
  role: Role;
  currentResId: string | null;
  currentResidentFull: Resident | null;
  onRequestsChanged: (reqs: Request[]) => void;
  onBack: (() => void) | null;
  onNext: (() => void) | null;
  showToast: (msg: string, err?: boolean) => void;
  schedule?: ScheduleData | null;
}

function getResRequests(allRequests: Request[], resId: string) {
  const vacDays = new Set(allRequests.filter((r) => r.resident_id === resId && r.type === 'vacation').map((r) => r.date));
  const weekends = new Set(allRequests.filter((r) => r.resident_id === resId && r.type === 'weekend').map((r) => r.date));
  const holidayReqs = new Set(allRequests.filter((r) => r.resident_id === resId && r.type === 'holiday').map((r) => r.date));
  return { vacDays, weekends, holidayReqs };
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

export default function Requests({
  block, residents, allRequests, role, currentResId, currentResidentFull,
  onRequestsChanged, onBack, onNext, showToast, schedule,
}: Props) {
  const bStart = block ? parseDate(block.start_date) : parseDate('2026-07-01');
  const bEnd = block ? parseDate(block.end_date) : parseDate('2026-09-30');

  const [calYear, setCalYear] = useState(bStart.getFullYear());
  const [calMonth, setCalMonth] = useState(bStart.getMonth());
  const [selectedResId, setSelectedResId] = useState<string>(
    role === 'resident' ? (currentResId ?? '') :
    residents.length > 0 ? '__all__' : ''
  );

  // If resident and schedule is published, show schedule view instead
  const isResidentWithPublishedSchedule =
    role === 'resident' && schedule && (schedule.published || block?.published);

  useEffect(() => {
    if (role === 'chief' && !selectedResId && residents.length > 0) {
      setSelectedResId(residents[0].id);
    }
  }, [residents, role, selectedResId]);

  useEffect(() => {
    setCalYear(bStart.getFullYear());
    setCalMonth(bStart.getMonth());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block?.start_date]);

  async function toggleDay(date: string, type: 'vacation' | 'weekend' | 'holiday', resId: string) {
    try {
      const body: Record<string, string> = { date, type, residentId: resId };
      const result = await api<{ action: string; date: string; type: string }>(
        '/requests/toggle', 'POST', body,
      );
      if (result.action === 'removed') {
        onRequestsChanged(allRequests.filter(
          (r) => !(r.resident_id === resId && r.date === date && r.type === type),
        ));
      } else {
        onRequestsChanged([
          ...allRequests,
          { id: 'local_' + Date.now(), resident_id: resId, block_id: 'block_main', date, type },
        ]);
      }
    } catch (e) {
      showToast((e as Error).message, true);
    }
  }

  function navCal(dir: number) {
    let m = calMonth + dir;
    let y = calYear;
    if (m > 11) { m = 0; y++; }
    if (m < 0) { m = 11; y--; }
    setCalYear(y); setCalMonth(m);
  }

  // If resident with published schedule, show schedule view
  if (isResidentWithPublishedSchedule && schedule) {
    return (
      <ScheduleView
        schedule={schedule}
        residents={residents}
        allRequests={allRequests}
        block={block}
        role="resident"
        onScheduleChanged={() => {}}
        onBlockChanged={() => {}}
        onRegenerate={() => {}}
        showToast={showToast}
      />
    );
  }

  const isAllView = role === 'chief' && selectedResId === '__all__';
  const activeResId = role === 'resident' ? (currentResId ?? '') : (isAllView ? '' : selectedResId);
  const activeRes = residents.find((r) => r.id === activeResId);
  const { vacDays, weekends, holidayReqs } = activeResId ? getResRequests(allRequests, activeResId) : { vacDays: new Set<string>(), weekends: new Set<string>(), holidayReqs: new Set<string>() };

  const vacUsed = [...vacDays].filter((d) => {
    const dd = parseDate(d); return dd >= bStart && dd <= bEnd && !HOLIDAYS.has(d);
  }).length;

  // Build all-residents request map for chief "all" view
  const allResMap: Record<string, Resident[]> = {};
  if (isAllView) {
    residents.forEach((res) => {
      const { vacDays: v, weekends: w, holidayReqs: h } = getResRequests(allRequests, res.id);
      [...v, ...w, ...h].forEach((d) => {
        if (!allResMap[d]) allResMap[d] = [];
        if (!allResMap[d].find((x) => x.id === res.id)) allResMap[d].push(res);
      });
    });
  }

  // Request calendar cells
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const dim = new Date(calYear, calMonth + 1, 0).getDate();
  const today = new Date();

  const allDaysList: { d: string; t: 'vac' | 'wk' | 'hol' }[] = [
    ...[...vacDays].map((d) => ({ d, t: 'vac' as const })),
    ...[...weekends].map((d) => ({ d, t: 'wk' as const })),
    ...[...holidayReqs].map((d) => ({ d, t: 'hol' as const })),
  ].sort((a, b) => a.d.localeCompare(b.d));

  const sortedResidents = [...residents].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  return (
    <div>
      <div className="page-title" id="reqPageTitle">
        {role === 'resident' && activeRes
          ? `Your Requests — ${activeRes.name}`
          : 'Vacation & Time-Off Requests'}
      </div>
      <div className="page-sub">
        Submit vacation days (max 5 per block, holidays excluded) and weekend-off requests.
        Requests are saved immediately to the server.
      </div>

      {/* Chief resident selector */}
      {role === 'chief' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 18 }}>
          <div className="fl" style={{ flex: '0 0 260px' }}>
            <label className="flb">Viewing requests for</label>
            <select value={selectedResId} onChange={(e) => setSelectedResId(e.target.value)}>
              <option value="__all__">— All Residents —</option>
              {sortedResidents.map((r) => (
                <option key={r.id} value={r.id}>
                  PGY-{r.pgy} — {r.name}{r.status === 'research' ? ' [Research]' : ''}
                </option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }} />
          <span className="bdg bgr" style={{ padding: '6px 12px', fontSize: 11 }}>● Saved to server</span>
        </div>
      )}

      {/* Resident header */}
      {role === 'resident' && activeRes && (
        <div style={{ marginBottom: 18 }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px',
            background: 'var(--blue-dim)', border: '1px solid rgba(96,165,250,.25)', borderRadius: 'var(--r-lg)',
          }}>
            {avatar(activeRes, 32)}
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{activeRes.name}</div>
              <div style={{ fontSize: 11, color: 'var(--muted)' }}>PGY-{activeRes.pgy} · {activeRes.hospital}</div>
            </div>
            <div style={{ flex: 1 }} />
            <span className="bdg bgr" style={{ padding: '6px 12px', fontSize: 11 }}>● Saved to server</span>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 18, alignItems: 'start' }}>
        {/* Calendar */}
        <div className="card">
          <div className="ch">
            <div className="ct">{MONTHS[calMonth]} {calYear}{isAllView ? ' — All Residents' : activeRes ? ` — ${activeRes.name}` : ''}</div>
            <div style={{ display: 'flex', gap: 4 }}>
              <button className="bico" onClick={() => navCal(-1)}>‹</button>
              <button className="bico" onClick={() => navCal(1)}>›</button>
            </div>
          </div>
          <div className="cb">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 5 }}>
              {['Su','Mo','Tu','We','Th','Fr','Sa'].map((d) => (
                <div key={d} style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 9, textAlign: 'center', color: 'var(--muted)', textTransform: 'uppercase', padding: '3px 0' }}>{d}</div>
              ))}
            </div>
            <div className="rcalgrid">
              {Array.from({ length: firstDay }, (_, i) => (
                <div key={`pad-${i}`} className="rc rcoff" />
              ))}
              {Array.from({ length: dim }, (_, i) => {
                const day = i + 1;
                const key = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const d = parseDate(key);
                const dow = d.getDay();
                const isWk = dow === 0 || dow === 6;
                const isHol = HOLIDAYS.has(key);
                const inBlock = d >= bStart && d <= bEnd;
                const isToday = today.getFullYear() === calYear && today.getMonth() === calMonth && today.getDate() === day;

                if (isAllView) {
                  const rList = allResMap[key] ?? [];
                  let cls = 'rc';
                  if (!inBlock) cls += ' rcoff';
                  else if (isHol) cls += ' rchol';
                  else if (isWk) cls += ' rcwe';
                  return (
                    <div key={key} className={cls} style={{ position: 'relative' }}>
                      <span style={isToday ? { fontWeight: 700, color: 'var(--text)' } : {}}>{day}</span>
                      {rList.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, marginTop: 2, justifyContent: 'center' }}>
                          {rList.map((r) => (
                            <div key={r.id} title={r.name} style={{
                              width: 6, height: 6, borderRadius: '50%', background: r.color, flexShrink: 0,
                            }} />
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                const isVac = vacDays.has(key);
                const isWkReq = weekends.has(key);
                const isHolReq = holidayReqs.has(key);
                let cls = 'rc';
                if (!inBlock) cls += ' rcoff';
                else if (isHol && isHolReq) cls += ' rcholreq';
                else if (isHol) cls += ' rchol';
                else if (isVac) cls += ' rcvac';
                else if (isWkReq) cls += ' rcwk';
                else if (isWk) cls += ' rcwe';
                const clickable = inBlock && activeResId;
                return (
                  <div
                    key={key}
                    className={cls}
                    style={isToday ? { fontWeight: 700, color: 'var(--text)' } : {}}
                    onClick={clickable ? () => toggleDay(key, isHol ? 'holiday' : isWk ? 'weekend' : 'vacation', activeResId) : undefined}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
              {[
                { cls: 'rcvac', label: 'Vacation day (counts toward 5)' },
                { cls: 'rcwk', label: 'Weekend off' },
                { cls: 'rchol', label: 'Holiday (click to request off)' },
                { cls: 'rcholreq', label: 'Holiday requested off' },
              ].map(({ cls, label }) => (
                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <div className={`rc ${cls}`} style={{ width: 10, height: 10, borderRadius: 2, aspectRatio: 'unset' }} />
                  {label}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Allowance */}
          <div className="card">
            <div className="ch"><div className="ct">Allowance</div></div>
            <div className="cb" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Vacation days used</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{vacUsed} / 5</span>
                </div>
                <div style={{ height: 5, background: 'var(--s3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 3,
                    background: vacUsed > 5 ? 'var(--red)' : 'var(--blue)',
                    width: Math.min(100, vacUsed / 5 * 100) + '%',
                    transition: 'width .3s',
                  }} />
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>Weekend requests</span>
                  <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{weekends.size}</span>
                </div>
                <div className="hint">~7–8 approved per block</div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 2 }}>
                {allDaysList.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'var(--muted)', fontStyle: 'italic' }}>No days selected</div>
                ) : allDaysList.map(({ d, t }) => (
                  <div key={d + t} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span className={`bdg ${t === 'vac' ? 'bb' : t === 'hol' ? 'bo' : 'bp'}`} style={{ fontSize: 9 }}>
                      {t === 'vac' ? 'VAC' : t === 'hol' ? 'HOL' : 'WKD'}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>
                      {fmtShort(d)} ({DOW[parseDate(d).getDay()]})
                    </span>
                    {activeResId && (
                      <button
                        className="bico"
                        style={{ width: 20, height: 20, fontSize: 10 }}
                        onClick={() => toggleDay(d, t === 'vac' ? 'vacation' : t === 'hol' ? 'holiday' : 'weekend', activeResId)}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* All residents summary (chief only) */}
          {role === 'chief' && (
            <div className="card">
              <div className="ch"><div className="ct">All Residents</div></div>
              <div className="cb">
                {sortedResidents.map((res) => {
                  const { vacDays: v, weekends: w, holidayReqs: h } = getResRequests(allRequests, res.id);
                  const vac = [...v].filter((d) => {
                    const dd = parseDate(d); return dd >= bStart && dd <= bEnd && !HOLIDAYS.has(d);
                  }).length;
                  return (
                    <div key={res.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                      borderBottom: '1px solid rgba(255,255,255,.04)',
                    }}>
                      {avatar(res)}
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{res.name}</span>
                      <span className="bdg bm">PGY-{res.pgy}</span>
                      {res.status === 'research' && <span className="bdg bpk" style={{ fontSize: 9 }}>Res</span>}
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--blue)' }}>{vac}/5</span>
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--purple)' }}>{w.size}wk</span>
                      {h.size > 0 && <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--orange)' }}>{h.size}hol</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>

      {role === 'chief' && onBack && onNext && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 22 }}>
          <button className="btn bgh" onClick={onBack}>← Back</button>
          <button className="btn bg" onClick={onNext}>Continue to Generate →</button>
        </div>
      )}
    </div>
  );
}
