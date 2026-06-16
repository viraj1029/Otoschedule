'use client';

import { useState, useEffect } from 'react';
import type { Block, Resident, Request, Role, ScheduleData, AnyScheduleData, Hospital } from '@/types';
import { HOLIDAYS, parseDate, fmtShort, isOnRotation } from '@/lib/scheduler';
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
  schedule?: AnyScheduleData | null;
  schedules?: import('@/types').Schedule[];
  onScheduleSelected?: (id: string) => void;
}

function getResRequests(allRequests: Request[], resIds: string[]) {
  const set = new Set(resIds);
  const mine = allRequests.filter((r) => set.has(r.resident_id));
  const vacDays = new Set(mine.filter((r) => r.type === 'vacation').map((r) => r.date));
  const vacOfficial = new Set(mine.filter((r) => r.type === 'vacation_official').map((r) => r.date));
  const weekends = new Set(mine.filter((r) => r.type === 'weekend').map((r) => r.date));
  const holidayReqs = new Set(mine.filter((r) => r.type === 'holiday').map((r) => r.date));
  const reqOwner = new Map<string, string>();
  mine.forEach((r) => reqOwner.set(`${r.date}:${r.type}`, r.resident_id));
  return { vacDays, vacOfficial, weekends, holidayReqs, reqOwner };
}

function VacationsView({ residents, allRequests, bStart }: {
  residents: Resident[];
  allRequests: Request[];
  bStart: Date;
}) {
  const acYear = bStart.getMonth() >= 6 ? bStart.getFullYear() : bStart.getFullYear() - 1;
  const quarters = [
    { label: `Jul – Sep ${acYear}`, start: `${acYear}-07-01`, end: `${acYear}-09-30` },
    { label: `Oct – Dec ${acYear}`, start: `${acYear}-10-01`, end: `${acYear}-12-31` },
    { label: `Jan – Mar ${acYear + 1}`, start: `${acYear + 1}-01-01`, end: `${acYear + 1}-03-31` },
    { label: `Apr – Jun ${acYear + 1}`, start: `${acYear + 1}-04-01`, end: `${acYear + 1}-06-30` },
  ];

  // One record per person (after migration, duplicates are merged)
  const personMap = new Map<string, Resident>();
  for (const r of residents) {
    const key = r.person_id ?? r.id;
    if (!personMap.has(key)) personMap.set(key, r);
  }

  // For a date, find the hospital from the resident's rotation segments
  function hospitalForDate(rep: Resident, dateStr: string): Hospital {
    if (rep.rotations && rep.rotations.length > 0) {
      const seg = rep.rotations.find((s) => dateStr >= s.start_date && dateStr <= s.end_date);
      return (seg?.hospital ?? rep.hospital) as Hospital;
    }
    return rep.hospital;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {quarters.map((q) => {
        // For each person, collect official vacation dates in this quarter grouped by hospital
        const byHospital = new Map<Hospital, { res: Resident; dates: string[] }[]>();

        for (const [, rep] of personMap) {
          const officialDates = allRequests
            .filter((r) => r.resident_id === rep.id && r.type === 'vacation_official' && r.date >= q.start && r.date <= q.end)
            .map((r) => r.date)
            .sort();
          if (officialDates.length === 0) continue;

          // Group dates by which hospital covers that date
          const byHosp: Record<string, string[]> = {};
          for (const d of officialDates) {
            const h = hospitalForDate(rep, d);
            (byHosp[h] ??= []).push(d);
          }
          for (const [hosp, dates] of Object.entries(byHosp)) {
            if (!byHospital.has(hosp as Hospital)) byHospital.set(hosp as Hospital, []);
            byHospital.get(hosp as Hospital)!.push({ res: rep, dates });
          }
        }

        for (const list of byHospital.values()) list.sort((a, b) => a.res.name.localeCompare(b.res.name));

        const hasAny = byHospital.size > 0;
        const hospOrder: Hospital[] = ['CUH', 'PMH', 'CMC', 'VA'];
        return (
          <div key={q.label} className="card">
            <div className="ch"><div className="ct">{q.label}</div></div>
            <div className="cb">
              {!hasAny && (
                <div style={{ fontSize: 12, color: 'var(--muted)', fontStyle: 'italic' }}>No official vacation days scheduled</div>
              )}
              {hospOrder.map((hosp) => {
                const list = byHospital.get(hosp) ?? [];
                if (list.length === 0) return null;
                return (
                  <div key={hosp} style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>
                      {hosp}
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {list.map(({ res, dates }) => (
                        <div key={res.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                          <div style={{
                            width: 24, height: 24, borderRadius: '50%', background: res.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 9, fontWeight: 700, color: '#000', flexShrink: 0, marginTop: 1,
                          }}>
                            {res.name.trim().split(/\s+/).map((p: string) => p[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{res.name}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                              {groupDates(dates).map(({ start, end }) => (
                                <span key={start} className="bdg bo" style={{ fontSize: 10 }}>
                                  {fmtRange(start, end)}
                                </span>
                              ))}
                              <span style={{ fontSize: 10, color: 'var(--muted)', alignSelf: 'center' }}>({dates.length}d)</span>
                            </div>
                          </div>
                          <span className="bdg bm" style={{ fontSize: 9, flexShrink: 0 }}>PGY-{res.pgy}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function groupDates(dates: string[]): { start: string; end: string }[] {
  if (!dates.length) return [];
  const sorted = [...dates].sort();
  const groups: { start: string; end: string }[] = [];
  let s = sorted[0], e = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const prev = parseDate(sorted[i - 1]), cur = parseDate(sorted[i]);
    if ((cur.getTime() - prev.getTime()) / 86400000 === 1) { e = sorted[i]; }
    else { groups.push({ start: s, end: e }); s = sorted[i]; e = sorted[i]; }
  }
  groups.push({ start: s, end: e });
  return groups;
}

function fmtRange(start: string, end: string): string {
  const s = parseDate(start), e = parseDate(end);
  const sm = `${s.getMonth() + 1}/${s.getDate()}`;
  const em = `${e.getMonth() + 1}/${e.getDate()}`;
  return start === end ? sm : `${sm} – ${em}`;
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
  onRequestsChanged, onBack, onNext, showToast, schedule, schedules, onScheduleSelected,
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
  const [chiefTab, setChiefTab] = useState<'requests' | 'vacations'>('requests');

  const [showChangePinModal, setShowChangePinModal] = useState(false);
  const [pinCurrent, setPinCurrent] = useState('');
  const [pinNew, setPinNew] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [pinChanging, setPinChanging] = useState(false);

  async function doChangePin() {
    if (pinNew !== pinConfirm) { showToast('New PINs do not match', true); return; }
    if (!/^\d{4}$/.test(pinNew)) { showToast('New PIN must be exactly 4 digits', true); return; }
    setPinChanging(true);
    try {
      await api('/auth/change-pin', 'POST', { currentPin: pinCurrent, newPin: pinNew });
      showToast('PIN changed successfully');
      setShowChangePinModal(false);
      setPinCurrent(''); setPinNew(''); setPinConfirm('');
    } catch (e) {
      showToast((e as Error).message, true);
    } finally {
      setPinChanging(false);
    }
  }

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

  async function toggleDay(date: string, type: Request['type'], resId: string) {
    try {
      const result = await api<{ action: string }>(
        '/requests/toggle', 'POST', { date, type, residentId: resId },
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

  // 3-state weekday cycle: empty → prefer-off → official vacation → empty
  async function cycleWeekday(key: string, isOff: boolean, isOfficial: boolean) {
    const resId = resIdForDate(key);
    if (isOfficial) {
      const ownerResId = reqOwner.get(`${key}:vacation_official`) ?? resId;
      await toggleDay(key, 'vacation_official', ownerResId);
    } else if (isOff) {
      if (totalOfficialVacUsed < TOTAL_OFFICIAL_VAC_LIMIT) {
        const ownerResId = reqOwner.get(`${key}:vacation`) ?? resId;
        try {
          // Make both API calls first
          await api('/requests/toggle', 'POST', { date: key, type: 'vacation', residentId: ownerResId });
          await api('/requests/toggle', 'POST', { date: key, type: 'vacation_official', residentId: resId });
          // Then update state once atomically: remove vacation, add vacation_official
          onRequestsChanged([
            ...allRequests.filter((r) => !(r.resident_id === ownerResId && r.date === key && r.type === 'vacation')),
            { id: 'local_' + Date.now(), resident_id: resId, block_id: 'block_main', date: key, type: 'vacation_official' },
          ]);
        } catch (e) {
          showToast((e as Error).message, true);
        }
      } else {
        const ownerResId = reqOwner.get(`${key}:vacation`) ?? resId;
        await toggleDay(key, 'vacation', ownerResId);
        const q = quarterOf(key);
        showToast(`Cleared — official vacation limit of ${TOTAL_OFFICIAL_VAC_LIMIT} days already reached`, true);
      }
    } else {
      await toggleDay(key, 'vacation', resId);
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
      personResIds.includes(r.id) && isOnRotation(r, dateStr),
    );
    return matching?.id ?? personResIds[0] ?? activeResId;
  }

  const { vacDays, vacOfficial, weekends, holidayReqs, reqOwner } = personResIds.length
    ? getResRequests(allRequests, personResIds)
    : { vacDays: new Set<string>(), vacOfficial: new Set<string>(), weekends: new Set<string>(), holidayReqs: new Set<string>(), reqOwner: new Map<string, string>() };

  const vacUsed = [...vacDays].filter((d) => {
    const dd = parseDate(d); return dd >= bStart && dd <= bEnd && !HOLIDAYS.has(d);
  }).length;

  // 5 official vacation days per quarter (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun)
  const acYear = bStart.getMonth() >= 6 ? bStart.getFullYear() : bStart.getFullYear() - 1;
  const quarters = [
    { label: 'Jul–Sep', start: `${acYear}-07-01`,     end: `${acYear}-09-30` },
    { label: 'Oct–Dec', start: `${acYear}-10-01`,     end: `${acYear}-12-31` },
    { label: 'Jan–Mar', start: `${acYear + 1}-01-01`, end: `${acYear + 1}-03-31` },
    { label: 'Apr–Jun', start: `${acYear + 1}-04-01`, end: `${acYear + 1}-06-30` },
  ];

  function quarterOf(dateStr: string) {
    return quarters.find((q) => dateStr >= q.start && dateStr <= q.end);
  }

  const officialVacByQuarter: Record<string, number> = {};
  for (const q of quarters) officialVacByQuarter[q.label] = 0;
  for (const d of vacOfficial) {
    const dd = parseDate(d); const dow = dd.getDay();
    if (HOLIDAYS.has(d) || dow === 0 || dow === 6) continue;
    const q = quarterOf(d);
    if (q) officialVacByQuarter[q.label] = (officialVacByQuarter[q.label] ?? 0) + 1;
  }

  const TOTAL_OFFICIAL_VAC_LIMIT = 20;
  const totalOfficialVacUsed = Object.values(officialVacByQuarter).reduce((a, b) => a + b, 0);

  function officialVacUsedForDate(dateStr: string): number {
    const q = quarterOf(dateStr);
    return q ? (officialVacByQuarter[q.label] ?? 0) : 0;
  }

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

  const allDaysList: { d: string; t: 'vac' | 'voff' | 'wk' | 'hol'; resId: string }[] = [
    ...[...vacOfficial].map((d) => ({ d, t: 'voff' as const, resId: reqOwner.get(`${d}:vacation_official`) ?? activeResId })),
    ...[...vacDays].map((d) => ({ d, t: 'vac' as const, resId: reqOwner.get(`${d}:vacation`) ?? activeResId })),
    ...[...weekends].map((d) => ({ d, t: 'wk' as const, resId: reqOwner.get(`${d}:weekend`) ?? activeResId })),
    ...[...holidayReqs].map((d) => ({ d, t: 'hol' as const, resId: reqOwner.get(`${d}:holiday`) ?? activeResId })),
  ].sort((a, b) => a.d.localeCompare(b.d));

  const sortedResidents = [...residents].sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  return (
    <div>
      {/* Change PIN modal */}
      {showChangePinModal && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000,
        }}>
          <div style={{
            background: 'var(--bg, #1e1e2e)', border: '1px solid var(--border, #333)',
            borderRadius: 12, padding: 28, width: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 20 }}>Change Your PIN</div>
            <div className="fl" style={{ marginBottom: 14 }}>
              <label className="flb">Current PIN</label>
              <input type="password" maxLength={4} placeholder="4-digit PIN"
                value={pinCurrent} onChange={(e) => setPinCurrent(e.target.value)} />
            </div>
            <div className="fl" style={{ marginBottom: 14 }}>
              <label className="flb">New PIN</label>
              <input type="password" maxLength={4} placeholder="4-digit PIN"
                value={pinNew} onChange={(e) => setPinNew(e.target.value)} />
            </div>
            <div className="fl" style={{ marginBottom: 22 }}>
              <label className="flb">Confirm New PIN</label>
              <input type="password" maxLength={4} placeholder="4-digit PIN"
                value={pinConfirm} onChange={(e) => setPinConfirm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && doChangePin()} />
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <button className="btn bgh bsm" onClick={() => {
                setShowChangePinModal(false);
                setPinCurrent(''); setPinNew(''); setPinConfirm('');
              }}>Cancel</button>
              <button className="btn bg bsm" disabled={pinChanging} onClick={doChangePin}>
                {pinChanging ? 'Saving…' : 'Save PIN'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Resident tab switcher when schedule is published */}
      {isResidentWithPublishedSchedule && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className={`btn bsm${resTab === 'schedule' ? ' bg' : ' bgh'}`} onClick={() => setResTab('schedule')}>
            📅 My Schedule
          </button>
          <button className={`btn bsm${resTab === 'requests' ? ' bg' : ' bgh'}`} onClick={() => setResTab('requests')}>
            ✏️ My Requests
          </button>
          <button className="btn bgh bsm" style={{ marginLeft: 'auto' }} onClick={() => setShowChangePinModal(true)}>
            🔑 Change PIN
          </button>
        </div>
      )}
      {/* Change PIN button for residents without published schedule */}
      {role === 'resident' && !isResidentWithPublishedSchedule && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button className="btn bgh bsm" onClick={() => setShowChangePinModal(true)}>
            🔑 Change PIN
          </button>
        </div>
      )}

      {/* Schedule tab */}
      {isResidentWithPublishedSchedule && resTab === 'schedule' && schedule && (
        <ScheduleView
          schedule={schedule}
          schedules={schedules}
          residents={residents}
          allRequests={allRequests}
          block={block}
          role="resident"
          onScheduleChanged={() => {}}
          onBlockChanged={() => {}}
          onScheduleSelected={onScheduleSelected}
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

      {/* Chief sub-tab switcher */}
      {role === 'chief' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button className={`btn bsm${chiefTab === 'requests' ? ' bg' : ' bgh'}`} onClick={() => setChiefTab('requests')}>
            ✏️ Requests
          </button>
          <button className={`btn bsm${chiefTab === 'vacations' ? ' bg' : ' bgh'}`} onClick={() => setChiefTab('vacations')}>
            🏖️ Vacations
          </button>
        </div>
      )}

      {/* Chief resident selector */}
      {role === 'chief' && chiefTab === 'requests' && (
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 18, flexWrap: 'wrap' }}>
          <div className="fl" style={{ flex: '0 0 260px' }}>
            <label className="flb">Viewing requests for</label>
            <select value={selectedResId} onChange={(e) => { setSelectedResId(e.target.value); setResFilter('all'); }}>
              <option value="__all__">— All Residents —</option>
              {sortedResidents.map((r) => (
                <option key={r.id} value={r.id}>
                  PGY-{r.pgy} — {r.name}{(r.status === 'research' || r.rotations?.some((s) => s.hospital === 'Research')) ? ' [Research]' : ''}
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

      {/* Chief Vacations tab */}
      {role === 'chief' && chiefTab === 'vacations' && (
        <VacationsView residents={residents} allRequests={allRequests} bStart={bStart} />
      )}

      {(role !== 'chief' || chiefTab === 'requests') && (
      <div className="req-layout">
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
                const isVacOff = vacOfficial.has(key);
                const isWkReq = weekends.has(key);
                const isHolReq = holidayReqs.has(key);
                let cls = 'rc';
                if (!inBlock) cls += ' rcoff';
                else if (isHol && isHolReq) cls += ' rcholreq';
                else if (isHol) cls += ' rchol';
                else if (isVacOff) cls += ' rcvacoff';
                else if (isVac) cls += ' rcvac';
                else if (isWkReq) cls += ' rcwk';
                else if (isWk) cls += ' rcwe';
                const clickable = inBlock && activeResId;
                const type = isHol ? 'holiday' : isWk ? 'weekend' : 'vacation';
                const toggleResId = (isVac || isVacOff || isWkReq || isHolReq)
                  ? (reqOwner.get(`${key}:${type}`) ?? resIdForDate(key))
                  : resIdForDate(key);
                // Weekday cells use 3-state cycle when a specific resident is selected; weekends/holidays use simple toggle
                const handleClick = !clickable ? undefined :
                  (!isWk && !isHol && !isAllView)
                    ? () => cycleWeekday(key, isVac, isVacOff)
                    : () => toggleDay(key, type, toggleResId);
                return (
                  <div
                    key={key}
                    className={cls}
                    style={isToday ? { fontWeight: 700, color: 'var(--text)' } : {}}
                    onClick={handleClick}
                  >
                    {day}
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 12, fontSize: 11, color: 'var(--muted)' }}>
              {[
                { cls: 'rcvac', label: 'Prefer off / unavailable' },
                ...((role === 'resident' || (role === 'chief' && activeResId && !isAllView)) ? [{ cls: 'rcvacoff', label: 'Official vacation (20-day total limit)' }] : []),
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
            <div className="ch"><div className="ct">{role === 'chief' && activeResId && !isAllView ? `${residents.find(r => r.id === activeResId)?.name.split(' ')[0] ?? 'Resident'}'s Requests` : 'My Requests'}</div></div>
            <div className="cb" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {(role === 'resident' || (role === 'chief' && activeResId && !isAllView)) && (
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>Official vacation</span>
                    <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 12, color: totalOfficialVacUsed >= TOTAL_OFFICIAL_VAC_LIMIT ? 'var(--red)' : totalOfficialVacUsed > 0 ? 'var(--orange)' : 'var(--muted2)' }}>
                      {totalOfficialVacUsed} / {TOTAL_OFFICIAL_VAC_LIMIT}
                    </span>
                  </div>
                  {quarters.map((q) => {
                    const used = officialVacByQuarter[q.label] ?? 0;
                    return (
                      <div key={q.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                        <span style={{ fontSize: 11, color: 'var(--muted2)' }}>{q.label}</span>
                        <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 11, color: used > 0 ? 'var(--orange)' : 'var(--muted2)' }}>
                          {used}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--muted)' }}>Prefer off / unavailable</span>
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
                    <span className={`bdg ${t === 'voff' ? 'bo' : t === 'vac' ? 'bb' : t === 'hol' ? 'bo' : 'bp'}`} style={{ fontSize: 9 }}>
                      {t === 'voff' ? 'OFFCL' : t === 'vac' ? 'VAC' : t === 'hol' ? 'HOL' : 'WKD'}
                    </span>
                    <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", flex: 1 }}>
                      {fmtShort(d)} ({DOW[parseDate(d).getDay()]})
                    </span>
                    {activeResId && (
                      <button
                        className="bico"
                        style={{ width: 20, height: 20, fontSize: 10 }}
                        onClick={() => toggleDay(d, t === 'voff' ? 'vacation_official' : t === 'vac' ? 'vacation' : t === 'hol' ? 'holiday' : 'weekend', resId)}
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
                      {(res.status === 'research' || res.rotations?.some((s) => s.hospital === 'Research')) && <span className="bdg bpk" style={{ fontSize: 9 }}>Res</span>}
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
      )}

      {role === 'chief' && onBack && onNext && chiefTab === 'requests' && (
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
