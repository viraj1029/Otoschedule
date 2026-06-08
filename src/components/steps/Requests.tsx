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

function getResRequests(allRequests: Request[], resIds: string[]) {
  const set = new Set(resIds);
  const mine = allRequests.filter((r) => set.has(r.resident_id));
  const vacDays = new Set(mine.filter((r) => r.type === 'vacation').map((r) => r.date));
  const weekends = new Set(mine.filter((r) => r.type === 'weekend').map((r) => r.date));
  const holidayReqs = new Set(mine.filter((r) => r.type === 'holiday').map((r) => r.date));
  // date+type → actual resident_id that owns the request (for correct delete routing)
  const reqOwner = new Map<string, string>();
  mine.forEach((r) => reqOwner.set(`${r.date}:${r.type}`, r.resident_id));
  return { vacDays, weekends, holidayReqs, reqOwner };
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function avatar(res: Resident, size = 26) {
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', background: res.color,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.38), fontWeight: 700, color: '#000', flexShrink: 0,
    }}>
      {initials(res.name)}
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
  const [resFilter, setResFilter] = useState<'all' | 'senior' | 'junior'>('all');

  const [resTab, setResTab] = useState<'requests' | 'schedule'>('requests');

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

  const isAllView = role === 'chief' && selectedResId === '__all__';
  const activeResId = role === 'resident' ? (currentResId ?? '') : (isAllView ? '' : selectedResId);
  const activeRes = residents.find((r) => r.id === activeResId);

  // For residents who appear across multiple rotation records (same person_id),
  // aggregate requests from ALL their records and route toggles to the right one by date.
  const personResIds: string[] = (() => {
    if (role === 'resident' && currentResidentFull?.person_id) {
      return residents.filter((r) => r.person_id === currentResidentFull.person_id).map((r) => r.id);
    }
    return activeResId ? [activeResId] : [];
  })();

  // Resolve which resident record owns a given date (for toggle routing).
  function resIdForDate(dateStr: string): string {
    if (personResIds.length <= 1) return personResIds[0] ?? activeResId;
    const matching = residents.find((r) =>
      personResIds.includes(r.id) &&
      dateStr >= (r.rotation_start ?? block?.start_date ?? '0000-01-01') &&
      dateStr <= (r.rotation_end ?? block?.end_date ?? '9999-12-31'),
    );
    return matching?.id ?? personResIds[0] ?? activeResId;
  }

  const { vacDays, weekends, holidayReqs, reqOwner } = personResIds.length
    ? getResRequests(allRequests, personResIds)
    : { vacDays: new Set<string>(), weekends: new Set<string>(), holidayReqs: new Set<string>(), reqOwner: new Map<string, string>() };

  const vacUsed = [...vacDays].filter((d) => {
    const dd = parseDate(d); return dd >= bStart && dd <= bEnd && !HOLIDAYS.has(d);
  }).length;

  // Build all-residents request map for chief "all" view
  const allResMap: Record<string, Resident[]> = {};
  if (isAllView) {
    residents.forEach((res) => {
      const { vacDays: v, weekends: w, holidayReqs: h } = getResRequests(allRequests, [res.id]);
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

  const allDaysList: { d: string; t: 'vac' | 'wk' | 'hol'; resId: string }[] = [
    ...[...vacDays].map((d) => ({ d, t: 'vac' as const, resId: reqOwner.get(`${d}:vacation`) ?? activeResId })),
    ...[...weekends].map((d) => ({ d, t: 'wk' as const, resId: reqOwner.get(`${d}:weekend`) ?? activeResId })),
    ...[...holidayReqs].map((d) => ({ d, t: 'hol' as const, resId: reqOwner.get(`${d}:holiday`) ?? activeResId })),
  ].sort((a, b) => a.d.localeCompare(b.d));

  const sortedResidents = [...residents].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  return (
    <div>
      {/* Resident tab switcher when schedule is published */}
      {isResidentWithPublishedSchedule && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button className={`btn bsm${resTab === 'schedule' ? ' bg' : ' bgh'}`} onClick={() => setResTab('schedule')}>
            📅 My Schedule
          </button>
          <button className={`btn bsm${resTab === 'requests' ? ' bg' : ' bgh'}`} onClick={() => setResTab('requests')}>
            ✏️ My Requests
          </button>
        </div>
      )}

      {/* Schedule tab */}
      {isResidentWithPublishedSchedule && resTab === 'schedule' && schedule && (
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
          currentResId={currentResId}
        />
      )}

      {/* Requests calendar — always for chief, or for resident on "My Requests" tab (or before publish) */}
      {(!isResidentWithPublishedSchedule || resTab === 'requests') && (
        <>
      <div className="page-title" id="reqPageTitle">
        {role === 'resident' && activeRes
          ? `Your Requests — ${activeRes.name}`
          : 'Vacation & Time-Off Requests'}
      </div>
      <div className="page-sub">
        Select days you prefer not to be on call (vacation / unavailable) and weekend-off requests.
        These block those days from the generated schedule. Requests are saved immediately to the server.
      </div>

      {/* Chief resident selector */}
      {role === 'chief' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap' }}>
          <div className="fl" style={{ flex: '0 0 260px' }}>
            <label className="flb">Viewing requests for</label>
            <select value={selectedResId} onChange={(e) => { setSelectedResId(e.target.value); setResFilter('all'); }}>
              <option value="__all__">— All Residents —</option>
              {sortedResidents.map((r) => (
                <option key={r.id} value={r.id}>
                  PGY-{r.pgy} — {r.name}{r.status === 'research' ? ' [Research]' : ''}
                </option>
              ))}
            </select>
          </div>
          {isAllView && (
            <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
              {(['all', 'senior', 'junior'] as const).map((f) => (
                <button
                  key={f}
                  className={`btn bsm${resFilter === f ? ' bg' : ' bgh'}`}
                  onClick={() => setResFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'senior' ? 'Senior (PGY4/5)' : 'Junior (PGY2/3)'}
                </button>
              ))}
            </div>
          )}
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
                  const allForDay = allResMap[key] ?? [];
                  const rList = allForDay.filter((r) =>
                    resFilter === 'senior' ? r.pgy >= 4 :
                    resFilter === 'junior' ? r.pgy <= 3 : true
                  );
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
                              background: r.color, color: '#000', borderRadius: 3,
                              fontSize: 10, fontWeight: 700, padding: '1px 3px', lineHeight: 1.3, flexShrink: 0,
                            }}>
                              {initials(r.name)}
                            </div>
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
                const type = isHol ? 'holiday' : isWk ? 'weekend' : 'vacation';
                // For toggling: use the owner of the existing request (delete) or the
                // rotation-window-appropriate record (add).
                const toggleResId = (isVac || isWkReq || isHolReq)
                  ? (reqOwner.get(`${key}:${type}`) ?? resIdForDate(key))
                  : resIdForDate(key);
                return (
                  <div
                    key={key}
                    className={cls}
                    style={isToday ? { fontWeight: 700, color: 'var(--text)' } : {}}
                    onClick={clickable ? () => toggleDay(key, type, toggleResId) : undefined}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
              {[
                { cls: 'rcvac', label: 'Day off / unavailable' },
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
          {/* Requests summary */}
          <div className="card">
            <div className="ch"><div className="ct">My Requests</div></div>
            <div className="cb" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Days off requested</span>
                <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12 }}>{vacUsed}</span>
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
                ) : allDaysList.map(({ d, t, resId }) => (
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
                        onClick={() => toggleDay(d, t === 'vac' ? 'vacation' : t === 'hol' ? 'holiday' : 'weekend', resId)}
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
                  const { vacDays: v, weekends: w, holidayReqs: h } = getResRequests(allRequests, [res.id]);
                  const vac = [...v].filter((d) => {
                    const dd = parseDate(d); return dd >= bStart && dd <= bEnd && !HOLIDAYS.has(d);
                  }).length;
                  return (
                    <div key={res.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0',
                      borderBottom: '1px solid rgba(0,0,0,.05)',
                    }}>
                      {avatar(res)}
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 500 }}>{res.name}</span>
                      <span className="bdg bm">PGY-{res.pgy}</span>
                      {res.status === 'research' && <span className="bdg bpk" style={{ fontSize: 9 }}>Res</span>}
                      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: 'var(--blue)' }}>{vac}d</span>
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
        </>
      )}
    </div>
  );
}
