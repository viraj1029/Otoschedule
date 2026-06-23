/**
 * Pure scheduling algorithm — runs client-side in the browser.
 * Ported from the vanilla JS generateAndSave() in index.html.
 */
import type {
  Resident,
  Request,
  ScheduleData,
  SeniorWeek,
  JuniorDay,
  JuniorDayType,
  ResBkpWeek,
  ResBkpDay,
  CMCDay,
  CMCScheduleData,
  VAWeek,
  VAScheduleData,
} from '@/types';

// ─── US Federal Holidays (static set matching the original) ──────────────────
export const HOLIDAYS = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-10-12',
  '2026-11-11',
  '2026-11-26',
  '2026-12-25',
]);

export const HOLIDAY_NAMES: Record<string, string> = {
  '2026-01-01': "New Year's Day",
  '2026-01-19': 'MLK Day',
  '2026-02-16': "Presidents' Day",
  '2026-05-25': 'Memorial Day',
  '2026-06-19': 'Juneteenth',
  '2026-07-03': 'Independence Day',
  '2026-09-07': 'Labor Day',
  '2026-10-12': 'Columbus Day',
  '2026-11-11': 'Veterans Day',
  '2026-11-26': 'Thanksgiving',
  '2026-12-25': 'Christmas',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

export function dk(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function parseDate(s: string): Date {
  return new Date(s + 'T12:00:00');
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function fmtDate(s: string): string {
  return parseDate(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function fmtShort(s: string): string {
  return parseDate(s).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

export function shiftHours(key: string): number {
  if (HOLIDAYS.has(key)) return 24;
  const dow = parseDate(key).getDay();
  return dow === 0 || dow === 6 ? 24 : 12;
}

// Single source of truth for "does this call count as a weekend shift?" for the
// purposes of JUNIOR call-hour equity. Friday is treated as a weekend call because
// the Friday junior is paired with the following Sunday — its 12h count toward the
// weekend-hours bucket (and weekend-potential denominator) so the two stay in sync.
// NOTE: this is intentionally scoped to junior call-hour accounting. It does NOT
// change shift length (Friday stays 12h), the calendar-weekend `isWeekend` flag used
// for CUH-rounder coverage, or any senior-week weekend-day counting.
export function isWeekendCall(key: string): boolean {
  const dow = parseDate(key).getDay();
  return dow === 5 || dow === 6 || dow === 0 || HOLIDAYS.has(key);
}

// Single source of truth for "is this resident on rotation on dateKey?", based solely on
// their rotation segments (the modern rotations[] model). This replaces the old, bug-prone
// reads of the legacy rotation_start/rotation_end fields, which could hold stale dates from
// a different block and produce wrong windows.
//   • hospitals — restrict to these hospitals (e.g. ['CUH','PMH']); omit to count any segment.
//   • If the resident has matching segments, they're on rotation iff a segment covers the day.
//   • If they have segments but none match the hospital filter, they're off.
//   • If they have no segments at all, they're treated as on (callers clip to the block range).
export function isOnRotation(
  r: { rotations?: { hospital: string; start_date: string; end_date: string }[] },
  dateKey: string,
  hospitals?: string[],
): boolean {
  const all = r.rotations ?? [];
  const segs = hospitals ? all.filter((s) => hospitals.includes(s.hospital)) : all;
  if (segs.length) return segs.some((s) => dateKey >= s.start_date && dateKey <= s.end_date);
  return all.length === 0;
}

// ─── Trauma weeks ─────────────────────────────────────────────────────────────

function buildTraumaSet(): Set<string> {
  // Each entry is the Monday that starts a trauma week; Sun is +6 days.
  const mondays = [
    '2026-07-13',
    '2026-08-03',
    '2026-08-24',
    '2026-09-14',
    '2026-10-05',
    '2026-10-26',
    '2026-11-23',
    '2026-12-07',
    '2026-12-28',
  ];
  const s = new Set<string>();
  for (const mon of mondays) {
    let d = parseDate(mon);
    for (let i = 0; i < 7; i++) { s.add(dk(d)); d = addDays(d, 1); }
  }
  return s;
}
export const TRAUMA_WEEKS = buildTraumaSet();

// ─── Main generator ───────────────────────────────────────────────────────────

export type ScheduleMode = 'merged' | 'senior' | 'junior';

// Returns true if the resident has a CUH, PMH, or Research rotation segment overlapping [periodStart, periodEnd].
// Research residents (PGY4+) count as CUH/PMH eligible because they do backup weeks there.
// Falls back to checking r.hospital / r.status if no segments are defined.
function hasMainHospitalRotation(r: Resident, periodStart: Date, periodEnd: Date): boolean {
  if (r.rotations && r.rotations.length > 0) {
    return r.rotations.some((seg) =>
      (seg.hospital === 'CUH' || seg.hospital === 'PMH' ||
       (seg.hospital === 'Research' && r.pgy >= 4)) &&
      parseDate(seg.start_date) <= periodEnd &&
      parseDate(seg.end_date)   >= periodStart,
    );
  }
  return r.hospital === 'CUH' || r.hospital === 'PMH' || r.status === 'research';
}

// Returns true if the resident is on a Research rotation overlapping [periodStart, periodEnd].
function hasResearchRotation(r: Resident, periodStart: Date, periodEnd: Date): boolean {
  if (r.rotations && r.rotations.length > 0) {
    return r.rotations.some((seg) =>
      seg.hospital === 'Research' &&
      parseDate(seg.start_date) <= periodEnd &&
      parseDate(seg.end_date)   >= periodStart,
    );
  }
  return r.status === 'research'; // legacy fallback
}

export function generateSchedule(
  residents: Resident[],
  requests: Request[],
  blockName: string,
  bStartStr: string,
  bEndStr: string,
  blockPublished: boolean,
  mode: ScheduleMode = 'merged',
  carryIn: Record<string, { hours: number; availDays: number; wkndHours?: number; traumaHours?: number }> = {},
): ScheduleData {
  const bStart = parseDate(bStartStr);
  const bEnd   = parseDate(bEndStr);

  // Filter to residents who have a CUH/PMH rotation overlapping this schedule period
  const eligibleResidents = residents.filter((r) => hasMainHospitalRotation(r, bStart, bEnd));

  const resR = eligibleResidents.filter((r) => r.pgy >= 4 && hasResearchRotation(r, bStart, bEnd));
  const resRIds = new Set(resR.map((r) => r.id));
  const srs = eligibleResidents
    .filter((r) => r.pgy >= 4 && r.status === 'active' && !resRIds.has(r.id))
    .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
  const jrs = eligibleResidents
    .filter((r) => r.pgy >= 2 && r.pgy <= 3 && r.status === 'active')
    .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  const needSr = mode === 'merged' || mode === 'senior';
  const needJr = mode === 'merged' || mode === 'junior';

  if (needSr && !srs.length) throw new Error('Need at least 1 active senior (PGY 4+) in a CUH/PMH rotation for this period');
  if (needJr && !jrs.length) throw new Error('Need at least 1 active junior (PGY 1–3) in a CUH/PMH rotation for this period');

  // Build off-map: residentId → Set<dateKey> (requests + off-rotation dates)
  const offMap: Record<string, Set<string>> = {};
  const rotDays: Record<string, number> = {}; // effective rotation days within block
  eligibleResidents.forEach((r) => {
    const vac = new Set(requests.filter((req) => req.resident_id === r.id && (req.type === 'vacation' || req.type === 'vacation_official')).map((req) => req.date));
    const wk  = new Set(requests.filter((req) => req.resident_id === r.id && req.type === 'weekend').map((req) => req.date));
    const hol = new Set(requests.filter((req) => req.resident_id === r.id && req.type === 'holiday').map((req) => req.date));
    offMap[r.id] = new Set([...vac, ...wk, ...hol]);

    // Block dates outside the resident's CUH/PMH/Research rotation window.
    // Only CUH, PMH, and Research (for PGY4+) segments count as "on rotation" here —
    // VA and CMC segments do NOT make a resident available for this schedule.
    const cuhPmhSegs = r.rotations && r.rotations.length > 0
      ? r.rotations.filter((seg) =>
          seg.hospital === 'CUH' || seg.hospital === 'PMH' ||
          (seg.hospital === 'Research' && r.pgy >= 4))
      : null;

    // Dates covered by CMC or VA segments are never available for CUH/PMH call,
    // regardless of legacy fields. Build this set once for the safety-net check below.
    const otherHospSegs = (r.rotations ?? []).filter((seg) => seg.hospital === 'CMC' || seg.hospital === 'VA');

    let cnt = 0;
    let dd = new Date(bStart);
    while (dd <= bEnd) {
      const dstr = dk(dd);
      let onRotation: boolean;
      if (cuhPmhSegs && cuhPmhSegs.length > 0) {
        onRotation = cuhPmhSegs.some((seg) => {
          const s = parseDate(seg.start_date);
          const e = parseDate(seg.end_date);
          return dd >= s && dd <= e;
        });
      } else if (r.rotations && r.rotations.length > 0) {
        // Has rotation segments but none are CUH/PMH/Research — mark all days as off.
        onRotation = false;
      } else {
        // No rotation segments at all → assume on rotation for the whole block.
        onRotation = true;
      }
      // Safety net: always block dates where the resident is on CMC/VA rotation,
      // even if a mis-entered CUH/PMH segment says otherwise.
      if (onRotation && otherHospSegs.some((seg) => dstr >= seg.start_date && dstr <= seg.end_date)) {
        onRotation = false;
      }
      if (!onRotation) offMap[r.id].add(dstr);
      else cnt++;
      dd = addDays(dd, 1);
    }
    rotDays[r.id] = Math.max(1, cnt);
  });

  // ── Research resident call week (senior modes only) ─────────────────────────
  // Research residents are full seniors for ONE Mon–Sun week (5 weekdays + Sat/Sun).
  // They own that week as primary call; active seniors skip it entirely.
  // Ideal: conflict-free Mon–Sun; fallback: longest run anchored to Monday.
  const resBkpWeeks: ResBkpWeek[] = [];
  const resBkpDays: ResBkpDay[] = []; // kept for ScheduleData compat

  if (needSr && resR.length) {
    for (const rr of resR) {
      let assigned = false;
      let c = new Date(bStart);
      while (c.getDay() !== 1) c = addDays(c, 1);
      while (c <= bEnd && !assigned) {
        const wS = new Date(c);
        const wE = addDays(c, 6); // Mon–Sun (7 days)
        const wEC = wE > bEnd ? new Date(bEnd) : new Date(wE);
        let ok = true;
        let d2 = new Date(wS);
        while (d2 <= wEC) { if (offMap[rr.id].has(dk(d2))) { ok = false; break; } d2 = addDays(d2, 1); }
        if (ok) {
          resBkpWeeks.push({ wS: dk(wS), wE: dk(wEC), res: rr, isBackup: false });
          assigned = true;
        }
        c = addDays(wE, 1);
      }

      if (!assigned) {
        const runs: { wS: string; wE: string; len: number }[] = [];
        let runStart: Date | null = null;
        let d = new Date(bStart);
        while (d <= bEnd) {
          if (!offMap[rr.id].has(dk(d))) {
            if (!runStart) runStart = new Date(d);
          } else if (runStart) {
            const runEnd = addDays(d, -1);
            runs.push({ wS: dk(runStart), wE: dk(runEnd), len: Math.round((runEnd.getTime() - runStart.getTime()) / 86400000) + 1 });
            runStart = null;
          }
          d = addDays(d, 1);
        }
        if (runStart) runs.push({ wS: dk(runStart), wE: dk(bEnd), len: Math.round((bEnd.getTime() - runStart.getTime()) / 86400000) + 1 });

        runs.sort((a, b) => b.len - a.len);
        if (runs.length) {
          let { wS: rS, wE: rE, len } = runs[0];
          if (len >= 7) {
            let mon = parseDate(rS);
            const runEnd = parseDate(rE);
            while (mon <= runEnd && mon.getDay() !== 1) mon = addDays(mon, 1);
            if (mon <= runEnd) {
              const sun = addDays(mon, 6);
              rS = dk(mon); rE = dk(sun > runEnd ? runEnd : sun);
            } else {
              rE = dk(addDays(parseDate(rS), 6) > parseDate(rE) ? parseDate(rE) : addDays(parseDate(rS), 6));
            }
          }
          resBkpWeeks.push({ wS: rS, wE: rE, res: rr, isBackup: false });
        }
      }
    }
  }

  // Build set of dates already covered by research residents (active seniors skip these)
  const resWeekDatesSet = new Set<string>();
  resBkpWeeks.forEach((w) => {
    let d = parseDate(w.wS); const end = parseDate(w.wE);
    while (d <= end) { resWeekDatesSet.add(dk(d)); d = addDays(d, 1); }
  });

  const resBkpWeekDatesSet = resWeekDatesSet; // alias kept for ScheduleData compat
  const resBkpDayKeysSet = new Set<string>();

  // ── Senior weeks ─────────────────────────────────────────────────────────────
  const seniorWeeks: SeniorWeek[] = [];
  const srC: Record<string, number> = {};
  srs.forEach((r) => (srC[r.id] = 0));
  if (needSr) {
  // Track days per senior; targets are weighted by each resident's rotation length
  const srDays: Record<string, number> = {};
  const srWkndDays: Record<string, number> = {};
  srs.forEach((r) => { srDays[r.id] = 0; srWkndDays[r.id] = 0; });

  let totalBlockDays = 0;
  let totalBlockWkndDays = 0;
  { let td = new Date(bStart); while (td <= bEnd) { totalBlockDays++; if (td.getDay() === 0 || td.getDay() === 6) totalBlockWkndDays++; td = addDays(td, 1); } }
  const totalSrRotDays = srs.reduce((s, r) => s + rotDays[r.id], 0) || 1;
  const srTargetDays: Record<string, number> = {};
  const srTargetWkndDays: Record<string, number> = {};
  srs.forEach((r) => {
    srTargetDays[r.id] = totalBlockDays * rotDays[r.id] / totalSrRotDays;
    srTargetWkndDays[r.id] = Math.max(1, totalBlockWkndDays * rotDays[r.id] / totalSrRotDays);
  });

  function countPeriodWknd(from: Date, to: Date): number {
    let n = 0; let d = new Date(from);
    while (d <= to) { if (d.getDay() === 0 || d.getDay() === 6) n++; d = addDays(d, 1); }
    return n;
  }

  let lastSrId: string | null = null;

  function countPeriodDays(from: Date, to: Date): number {
    let n = 0; let d = new Date(from); while (d <= to) { n++; d = addDays(d, 1); } return n;
  }

  function noConflict(r: Resident, from: Date, to: Date): boolean {
    let d2 = new Date(from);
    while (d2 <= to) { if (offMap[r.id].has(dk(d2))) return false; d2 = addDays(d2, 1); }
    return true;
  }

  // Sort by days-vs-target ratio; tiebreak by weekend-day ratio, then higher PGY
  function srSort(a: Resident, b: Resident) {
    const ar = srDays[a.id] / srTargetDays[a.id];
    const br = srDays[b.id] / srTargetDays[b.id];
    if (Math.abs(ar - br) > 0.05) return ar - br;
    const awr = srWkndDays[a.id] / srTargetWkndDays[a.id];
    const bwr = srWkndDays[b.id] / srTargetWkndDays[b.id];
    if (Math.abs(awr - bwr) > 0.05) return awr - bwr;
    return b.pgy - a.pgy;
  }

  function pickSr(from: Date, to: Date, excludeId: string | null): Resident | null {
    return [...srs].filter((r) => r.id !== excludeId && noConflict(r, from, to)).sort(srSort)[0] ?? null;
  }

  function assignPeriod(wS: Date, wEC: Date) {
    const pLen = countPeriodDays(wS, wEC);

    let best = pickSr(wS, wEC, lastSrId) ?? pickSr(wS, wEC, null);
    if (!best) best = [...srs].sort(srSort)[0]; // fallback: ignore conflicts

    // Split whenever best would exceed their fair share (any overshoot triggers a split attempt).
    // idealP1: how many days best should ideally get (at least 1).
    // Find the valid split point (last day of first half ≠ Saturday) closest to idealP1.
    if (pLen > 1 && srDays[best.id] + pLen > srTargetDays[best.id]) {
      const idealP1 = Math.max(1, Math.round(srTargetDays[best.id] - srDays[best.id]));
      if (idealP1 < pLen) {
        let chosenSplit = -1;
        let bestDist = Infinity;
        let d = new Date(wS);
        for (let i = 0; i < pLen - 1; i++) {
          // Valid: last day of first half must NOT be Saturday (keeps Sat+Sun together)
          if (d.getDay() !== 6) {
            const dist = Math.abs((i + 1) - idealP1);
            if (dist < bestDist) { bestDist = dist; chosenSplit = i; }
          }
          d = addDays(d, 1);
        }

        if (chosenSplit >= 0) {
          let p1End = new Date(wS);
          for (let i = 0; i < chosenSplit; i++) p1End = addDays(p1End, 1);
          const p2Start = addDays(p1End, 1);

          srDays[best.id] += chosenSplit + 1;
          srWkndDays[best.id] += countPeriodWknd(wS, p1End);
          srC[best.id]++;
          lastSrId = best.id;
          seniorWeeks.push({ wS: dk(wS), wE: dk(p1End), res: best, isBackup: false, override: false });
          assignPeriod(p2Start, wEC);
          return;
        }
      }
    }

    srDays[best.id] += pLen;
    srWkndDays[best.id] += countPeriodWknd(wS, wEC);
    srC[best.id]++;
    lastSrId = best.id;
    seniorWeeks.push({ wS: dk(wS), wE: dk(wEC), res: best, isBackup: false, override: false });
  }

  // Cover any partial days before the first Monday
  let cur = new Date(bStart);
  if (cur.getDay() !== 1) {
    const partialEnd = new Date(cur);
    while (partialEnd.getDay() !== 0) partialEnd.setDate(partialEnd.getDate() + 1);
    const pEC = partialEnd > bEnd ? new Date(bEnd) : new Date(partialEnd);
    if (!resWeekDatesSet.has(dk(cur))) assignPeriod(cur, pEC);
    cur = addDays(partialEnd, 1);
  }

  // Full Monday-to-Sunday weeks — skip weeks owned by a research resident
  while (cur <= bEnd) {
    const wS = new Date(cur);
    const wE = addDays(cur, 6);
    const wEC = wE > bEnd ? new Date(bEnd) : new Date(wE);
    if (!resWeekDatesSet.has(dk(wS))) assignPeriod(wS, wEC);
    cur = addDays(wE, 1);
  }

  // ── Post-processing rebalance ────────────────────────────────────────────────
  // After the greedy pass some residents may still have >2 day gap due to
  // vacation conflicts. Iteratively find the most-over and most-under resident,
  // then split one of the over-resident's periods and give the tail to the
  // under-resident (if they have no conflict there, and the split doesn't land
  // on a Saturday boundary). Repeats until the gap is ≤ 2 or no valid split
  // can be found.
  console.log('[sched] pre-rebalance:', JSON.stringify(Object.fromEntries(srs.map(r => [r.name, srDays[r.id]]))));
  for (let iter = 0; iter < 60; iter++) {
    const ranked = [...srs].sort((a, b) => srDays[b.id] - srDays[a.id]);
    const over = ranked[0];
    const under = ranked[ranked.length - 1];
    console.log(`[sched] iter ${iter}: over=${over.name}(${srDays[over.id]}) under=${under.name}(${srDays[under.id]})`);
    if (srDays[over.id] / srTargetDays[over.id] - srDays[under.id] / srTargetDays[under.id] <= 0.05) { console.log('[sched] balanced'); break; }

    const gap = srDays[over.id] - srDays[under.id];
    const targetTransfer = Math.floor(gap / 2);

    let bestInfo: { idx: number; splitDay: number; p2Len: number } | null = null;
    let bestDiff = Infinity;

    seniorWeeks.forEach((w, idx) => {
      if (w.res.id !== over.id || w.isBackup) return;
      const wS2 = parseDate(w.wS);
      const wEC2 = parseDate(w.wE);
      const pLen2 = countPeriodDays(wS2, wEC2);
      if (pLen2 <= 1) return;

      let d2 = new Date(wS2);
      for (let i = 0; i < pLen2 - 1; i++) {
        if (d2.getDay() !== 6) { // valid: don't land between Sat and Sun
          const p2Start = addDays(d2, 1);
          const p2Len = pLen2 - (i + 1);
          // Only consider transfers that don't flip who is over-assigned
          if (p2Len <= gap && noConflict(under, p2Start, wEC2)) {
            const diff = Math.abs(p2Len - targetTransfer);
            if (diff < bestDiff) { bestDiff = diff; bestInfo = { idx, splitDay: i, p2Len }; }
          }
        }
        d2 = addDays(d2, 1);
      }
    });

    if (!bestInfo) break;

    const { idx, splitDay, p2Len: transferLen } = bestInfo;
    const week = seniorWeeks[idx];
    const wS2 = parseDate(week.wS);
    let p1End = new Date(wS2);
    for (let i = 0; i < splitDay; i++) p1End = addDays(p1End, 1);
    const p2Start = addDays(p1End, 1);

    const transferWknd = countPeriodWknd(p2Start, parseDate(week.wE));
    seniorWeeks[idx] = { ...week, wE: dk(p1End) };
    seniorWeeks.splice(idx + 1, 0, { wS: dk(p2Start), wE: week.wE, res: under, isBackup: false, override: false });
    srDays[over.id] -= transferLen;
    srDays[under.id] += transferLen;
    srWkndDays[over.id] -= transferWknd;
    srWkndDays[under.id] += transferWknd;
    srC[under.id]++;
  }

  resBkpWeeks.forEach((w) => seniorWeeks.push({ ...w, override: false }));
  seniorWeeks.sort((a, b) => a.wS.localeCompare(b.wS));
  } // end needSr

  // ── Junior days ──────────────────────────────────────────────────────────────
  const juniorDays: JuniorDay[] = [];
  const jrC: Record<string, number> = {};
  const jrH: Record<string, number> = {};
  const jrHwknd: Record<string, number> = {};   // weekend + holiday hours
  const jrHwkday: Record<string, number> = {};  // weekday hours
  const jrDwknd: Record<string, number> = {};   // weekend + holiday shift count
  const jrDwkday: Record<string, number> = {};  // weekday shift count
  const lastCallKey: Record<string, string> = {};    // last assigned date per resident
  const lastWeekendKey: Record<string, string> = {}; // last weekend/holiday call date per resident
  const lastTraumaKey: Record<string, string> = {};  // last trauma shift date per resident

  const jrTH: Record<string, number> = {};    // trauma hours total
  const jrTHwknd: Record<string, number> = {}; // trauma weekend hours
  const jrTHwkday: Record<string, number> = {}; // trauma weekday hours
  const jrTD: Record<string, number> = {};    // trauma call days

  // Hoisted so jrAvailDays can be included in the return value.
  const rotWkndDays: Record<string, number> = {};
  const rotWkdayDays: Record<string, number> = {};
  const rotAvailDays: Record<string, number> = {};
  const rotPotentialHours: Record<string, number> = {};
  const rotPotentialTraumaHours: Record<string, number> = {};
  // Weekend days the resident is actually available (all request types excluded, including weekend requests).
  // Kept for display/compat — counts calendar weekend + holiday days (Friday excluded).
  const rotWkndAvailDays: Record<string, number> = {};
  // Potential weekend-call HOURS the resident is available for (Fri=12, Sat/Sun/holiday=24).
  // This is the denominator for the weekend equity ratio — it includes Friday so the numerator
  // (jrHwknd, which now counts Friday's 12h) and denominator speak the same units.
  const rotWkndPotentialHours: Record<string, number> = {};

  if (needJr) {
  jrs.forEach((r) => { jrC[r.id] = 0; jrH[r.id] = 0; jrHwknd[r.id] = 0; jrHwkday[r.id] = 0; jrDwknd[r.id] = 0; jrDwkday[r.id] = 0; jrTH[r.id] = 0; jrTHwknd[r.id] = 0; jrTHwkday[r.id] = 0; jrTD[r.id] = 0; });
  const processed = new Set<string>();

  // Compute equity-aligned availability: only subtract official vacation days (not weekend/holiday
  // opt-out requests). Weekend/holiday opt-outs shrink rotAvailDays, making the resident's
  // hours/availDays ratio look artificially high, causing the sort to under-assign them.
  // equityOffMap = offMap entries that are either official vacation OR off-rotation (no request).
  const allReqDates:      Record<string, Set<string>> = {};
  const officialVacDates: Record<string, Set<string>> = {};
  const equityOffMap:     Record<string, Set<string>> = {};
  jrs.forEach((r) => {
    allReqDates[r.id]      = new Set(requests.filter((req) => req.resident_id === r.id).map((req) => req.date));
    officialVacDates[r.id] = new Set(requests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date));
    equityOffMap[r.id]     = new Set([...offMap[r.id]].filter((key) =>
      officialVacDates[r.id].has(key) || !allReqDates[r.id].has(key),
    ));
  });

  jrs.forEach((r) => {
    let wknd = 0, wkday = 0, traumaHrs = 0, wkndPotHrs = 0;
    // Use full block range; equityOffMap already excludes off-rotation dates
    let dd = new Date(bStart);
    while (dd <= bEnd) {
      const key = dk(dd);
      const dow = dd.getDay();
      const isWknd = dow === 0 || dow === 6 || HOLIDAYS.has(key);
      if (!equityOffMap[r.id].has(key)) {
        if (isWknd) wknd++; else wkday++;
        if (TRAUMA_WEEKS.has(key)) traumaHrs += isWknd ? 24 : 12;
        // Weekend-call potential (Fri 12 + Sat/Sun/holiday 24) on the SAME equity basis as
        // rotPotentialHours: informal vacation & weekend/holiday opt-outs are NOT subtracted,
        // so they can't shrink the denominator and cause weekend under-assignment.
        if (isWeekendCall(key)) wkndPotHrs += shiftHours(key);
      }
      dd = addDays(dd, 1);
    }
    rotWkndDays[r.id] = Math.max(1, wknd);
    rotWkdayDays[r.id] = Math.max(1, wkday);
    rotAvailDays[r.id] = Math.max(1, wknd + wkday);
    rotPotentialHours[r.id] = Math.max(1, wknd * 24 + wkday * 12);
    rotPotentialTraumaHours[r.id] = Math.max(1, traumaHrs);
    rotWkndPotentialHours[r.id] = Math.max(1, wkndPotHrs);
  });

  // Pick junior: enforce rest gap (2 days preferred, 1 day minimum), balance weekend/weekday separately
  // Precompute each resident's effective rotation window for fast eligibility checks.
  // Use the span of all CUH/PMH segments so residents with multi-segment rotations (e.g. CUH→PMH)
  // remain eligible for the full period. With no CUH/PMH segments, eligible for the whole block.
  const rotEffStart: Record<string, Date> = {};
  const rotEffEnd: Record<string, Date> = {};
  jrs.forEach((r) => {
    const cuhPmhSegs = r.rotations && r.rotations.length > 0
      ? r.rotations.filter((seg) => seg.hospital === 'CUH' || seg.hospital === 'PMH')
      : null;
    if (cuhPmhSegs && cuhPmhSegs.length > 0) {
      const segStart = cuhPmhSegs.reduce((m, s) => { const d = parseDate(s.start_date); return d < m ? d : m; }, parseDate(cuhPmhSegs[0].start_date));
      const segEnd   = cuhPmhSegs.reduce((m, s) => { const d = parseDate(s.end_date);   return d > m ? d : m; }, parseDate(cuhPmhSegs[0].end_date));
      rotEffStart[r.id] = segStart < bStart ? bStart : segStart;
      rotEffEnd[r.id]   = segEnd   > bEnd   ? bEnd   : segEnd;
    } else {
      // No CUH/PMH segments → eligible for the whole block.
      rotEffStart[r.id] = bStart;
      rotEffEnd[r.id]   = bEnd;
    }
  });

  // Second pass: available weekend days for display/compat only (counts calendar weekend +
  // holiday, Friday excluded). Uses the full offMap since this is a literal "days you could
  // actually be put on weekend call" figure. The weekend EQUITY denominator
  // (rotWkndPotentialHours) is computed above on the equity basis, not here.
  jrs.forEach((r) => {
    let wkndAvail = 0;
    let dd = new Date(bStart);
    while (dd <= bEnd) {
      const key = dk(dd);
      const dow = dd.getDay();
      const avail = !offMap[r.id].has(key) && dd >= rotEffStart[r.id] && dd <= rotEffEnd[r.id];
      if (avail && (dow === 0 || dow === 6 || HOLIDAYS.has(key))) wkndAvail++;
      dd = addDays(dd, 1);
    }
    rotWkndAvailDays[r.id] = Math.max(1, wkndAvail);
  });

  function pickJr(key: string, ex: string | null = null, isWeekendSlot = false, skipGap = false, isTraumaDay = false): Resident {
    const d = parseDate(key);

    function sortFn(a: Resident, b: Resident) {
      const aC = carryIn[a.person_id ?? ''] ?? { hours: 0, availDays: 0, wkndHours: 0, traumaHours: 0 };
      const bC = carryIn[b.person_id ?? ''] ?? { hours: 0, availDays: 0, wkndHours: 0, traumaHours: 0 };

      // For shifts that are both weekend AND trauma: use a blended score (weekend ratio + trauma ratio)
      // so neither axis dominates. This prevents a resident with low weekend hours but high trauma hours
      // from repeatedly winning trauma-weekend slots just because of the weekend sort.
      if (isWeekendSlot && isTraumaDay) {
        const aWr = ((aC.wkndHours ?? 0) + jrHwknd[a.id]) / rotWkndPotentialHours[a.id];
        const bWr = ((bC.wkndHours ?? 0) + jrHwknd[b.id]) / rotWkndPotentialHours[b.id];
        const aTr = ((aC.traumaHours ?? 0) + jrTH[a.id]) / rotPotentialTraumaHours[a.id];
        const bTr = ((bC.traumaHours ?? 0) + jrTH[b.id]) / rotPotentialTraumaHours[b.id];
        const aBlend = aWr + aTr;
        const bBlend = bWr + bTr;
        if (Math.abs(aBlend - bBlend) > 0.001) return aBlend - bBlend;
      } else if (isWeekendSlot) {
        // Weekend-only: primary sort is weekend utilization ratio vs available weekend-call hours.
        const aWr = ((aC.wkndHours ?? 0) + jrHwknd[a.id]) / rotWkndPotentialHours[a.id];
        const bWr = ((bC.wkndHours ?? 0) + jrHwknd[b.id]) / rotWkndPotentialHours[b.id];
        if (Math.abs(aWr - bWr) > 0.001) return aWr - bWr;
      } else if (isTraumaDay) {
        // Trauma-only (weekday): primary sort is trauma utilization ratio.
        const aTr = ((aC.traumaHours ?? 0) + jrTH[a.id]) / rotPotentialTraumaHours[a.id];
        const bTr = ((bC.traumaHours ?? 0) + jrTH[b.id]) / rotPotentialTraumaHours[b.id];
        if (Math.abs(aTr - bTr) > 0.001) return aTr - bTr;
      }

      // Total utilization ratio as fallback (carry-in availDays × 18 approximates prior potential hours).
      const ar = (aC.hours + jrH[a.id]) / (aC.availDays * 18 + rotPotentialHours[a.id]);
      const br = (bC.hours + jrH[b.id]) / (bC.availDays * 18 + rotPotentialHours[b.id]);
      if (Math.abs(ar - br) > 0.001) return ar - br;

      // Final tiebreaker: date-seeded hash using full resident ID for even distribution.
      let h = 2166136261;
      for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
      let hA = h, hB = h;
      for (let i = 0; i < a.id.length; i++) hA = (Math.imul(hA ^ a.id.charCodeAt(i), 16777619) >>> 0);
      for (let i = 0; i < b.id.length; i++) hB = (Math.imul(hB ^ b.id.charCodeAt(i), 16777619) >>> 0);
      return hA - hB;
    }

    function daysSince(r: Resident): number {
      if (!lastCallKey[r.id]) return 999;
      return Math.round((d.getTime() - parseDate(lastCallKey[r.id]).getTime()) / 86400000);
    }

    function daysSinceLastWeekend(r: Resident): number {
      if (!lastWeekendKey[r.id]) return 999;
      return Math.round((d.getTime() - parseDate(lastWeekendKey[r.id]).getTime()) / 86400000);
    }

    function daysSinceLastTrauma(r: Resident): number {
      if (!lastTraumaKey[r.id]) return 999;
      return Math.round((d.getTime() - parseDate(lastTraumaKey[r.id]).getTime()) / 86400000);
    }

    // Progressive gap relaxation: prefer ≥3 days, fallback to ≥2. No back-to-back allowed.
    const minGaps = skipGap ? [2] : [3, 2];
    for (const minGap of minGaps) {
      const eligible = jrs.filter((r) =>
        r.id !== ex &&
        !offMap[r.id].has(key) &&
        d >= rotEffStart[r.id] && d <= rotEffEnd[r.id] &&
        daysSince(r) >= minGap,
      );
      if (!eligible.length) continue;
      if (isWeekendSlot) {
        // Progressive weekend spacing: strongly prefer skipping a full weekend (≥14 days),
        // fall back to no-consecutive-weekend (≥8 days), then any eligible.
        for (const minWknd of [14, 8]) {
          const noConsec = eligible.filter((r) => daysSinceLastWeekend(r) >= minWknd);
          if (noConsec.length) {
            // For trauma-weekend days also enforce trauma spacing within the weekend-spaced pool.
            if (isTraumaDay) {
              for (const minTrauma of [22, 14, 8]) {
                const noRecentTrauma = noConsec.filter((r) => daysSinceLastTrauma(r) >= minTrauma);
                if (noRecentTrauma.length) return noRecentTrauma.sort(sortFn)[0];
              }
            }
            return noConsec.sort(sortFn)[0];
          }
        }
      }
      // For trauma-only (weekday) days, enforce trauma spacing independently.
      if (isTraumaDay) {
        for (const minTrauma of [22, 14, 8]) {
          const noRecentTrauma = eligible.filter((r) => daysSinceLastTrauma(r) >= minTrauma);
          if (noRecentTrauma.length) return noRecentTrauma.sort(sortFn)[0];
        }
      }
      return eligible.sort(sortFn)[0];
    }
    // Fallback: gap relaxed but still prefer ≥1 day (no back-to-back) if at all possible.
    const inWindow = jrs.filter((r) =>
      r.id !== ex &&
      !offMap[r.id].has(key) &&
      d >= rotEffStart[r.id] && d <= rotEffEnd[r.id],
    );
    const withGap = inWindow.filter((r) => daysSince(r) >= 2);
    const withMinGap = inWindow.filter((r) => daysSince(r) >= 1);
    const pool = withGap.length ? withGap : withMinGap.length ? withMinGap : inWindow.length ? inWindow : jrs;
    return pool.sort(sortFn)[0];
  }

  function addJD(key: string, res: Resident, type: JuniorDayType, paired = false, cuhR: Resident | null = null) {
    const hrs = shiftHours(key);
    const d = parseDate(key);
    // isWkndCall drives equity buckets (Fri/Sat/Sun/holiday). isWk is the calendar-weekend
    // flag kept on the JuniorDay for CUH-rounder coverage (Sat/Sun only, Friday excluded).
    const isWkndCall = isWeekendCall(key);
    const isWk = d.getDay() === 0 || d.getDay() === 6;
    const isTrauma = TRAUMA_WEEKS.has(key);
    jrC[res.id]++;
    jrH[res.id] += hrs;
    if (isWkndCall) { jrHwknd[res.id] += hrs; jrDwknd[res.id]++; lastWeekendKey[res.id] = key; }
    else            { jrHwkday[res.id] += hrs; jrDwkday[res.id]++; }
    if (isTrauma) {
      jrTH[res.id] += hrs;
      jrTD[res.id]++;
      if (isWkndCall) jrTHwknd[res.id] += hrs;
      else jrTHwkday[res.id] += hrs;
      lastTraumaKey[res.id] = key;
    }
    lastCallKey[res.id] = key;
    juniorDays.push({ dateKey: key, res, shiftHrs: hrs, type, paired, cuhRounder: cuhR, isWeekend: isWk, isTrauma, override: false });
    processed.add(key);
  }

  // Enumerate all dates in block
  const allDates: string[] = [];
  let day = new Date(bStart);
  while (day <= bEnd) { allDates.push(dk(day)); day = addDays(day, 1); }

  for (const key of allDates) {
    if (processed.has(key)) continue;
    const d = parseDate(key);
    const dow = d.getDay();

    if (dow === 5) {
      // Friday — pair with Sunday; treat as weekend slot since resident gets a Sunday too
      const sunDate = addDays(d, 2);
      const sunKey = dk(sunDate);
      const inBlock = sunDate <= bEnd;
      const friRes = pickJr(key, null, true, false, TRAUMA_WEEKS.has(key)); // weekend sort: picks resident with fewest wknd hrs
      addJD(key, friRes, 'fri-pair', true);   // Friday itself is a weekday shift (12h)
      if (inBlock && !processed.has(sunKey)) {
        const hrs = shiftHours(sunKey);
        const isSunTrauma = TRAUMA_WEEKS.has(sunKey);
        jrC[friRes.id]++;
        jrH[friRes.id] += hrs;
        jrHwknd[friRes.id] += hrs; // Sunday is a weekend day
        jrDwknd[friRes.id]++;
        if (isSunTrauma) {
          jrTH[friRes.id] += hrs;
          jrTD[friRes.id]++;
          jrTHwknd[friRes.id] += hrs;
          lastTraumaKey[friRes.id] = sunKey;
        }
        lastCallKey[friRes.id] = sunKey;
        lastWeekendKey[friRes.id] = sunKey; // gap tracking: last weekend = Sunday
        const cuhR = friRes.hospital === 'PMH'
          ? jrs.filter((r) => r.hospital === 'CUH' && r.id !== friRes.id && !offMap[r.id].has(sunKey))
              .sort((a, b) => b.pgy - a.pgy)[0] ?? null
          : null;
        juniorDays.push({ dateKey: sunKey, res: friRes, shiftHrs: hrs, type: 'sun-pair', paired: true, cuhRounder: cuhR, isWeekend: true, isTrauma: isSunTrauma, override: false });
        processed.add(sunKey);
      }
    } else if (dow === 6) {
      // Saturday — weekend slot
      const satRes = pickJr(key, null, true, false, TRAUMA_WEEKS.has(key));
      const cuhR = satRes.hospital === 'PMH'
        ? jrs.filter((r) => r.hospital === 'CUH' && r.id !== satRes.id && !offMap[r.id].has(key))
            .sort((a, b) => b.pgy - a.pgy)[0] ?? null
        : null;
      addJD(key, satRes, 'saturday', false, cuhR);
    } else {
      // Weekday or holiday-weekday
      const isHolWknd = HOLIDAYS.has(key) && (dow === 0 || dow === 6);
      addJD(key, pickJr(key, null, HOLIDAYS.has(key), false, TRAUMA_WEEKS.has(key)), dow === 0 ? 'sunday' : 'weekday');
      void isHolWknd; // holidays on weekdays are treated as weekend slots via addJD
    }
  }

  // Fill in missing CUH rounders for weekend/holiday PMH residents
  juniorDays.forEach((jd) => {
    if (!jd.isWeekend && !HOLIDAYS.has(jd.dateKey)) return;
    if (jd.res.hospital === 'PMH' && !jd.cuhRounder) {
      jd.cuhRounder = jrs
        .filter((r) => r.hospital === 'CUH' && r.id !== jd.res.id && !offMap[r.id].has(jd.dateKey))
        .sort((a, b) => b.pgy - a.pgy)[0] ?? null;
    }
  });

  juniorDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  // ── Post-hoc rebalancing ────────────────────────────────────────────────────
  // After the greedy pass, iteratively reassign shifts from the most over-assigned
  // resident to the most under-assigned until the gap is ≤5% or no valid move exists.
  // Respects: offMap (all request types), rotation window, ≥1 day gap.
  // Fri-Sun pairs are always moved together.

  function canReceive(key: string, res: Resident): boolean {
    if (offMap[res.id].has(key)) return false;
    const d = parseDate(key);
    if (d < rotEffStart[res.id] || d > rotEffEnd[res.id]) return false;
    // Require ≥2 day gap from every existing shift (no back-to-back days).
    for (const jj of juniorDays) {
      if (jj.res.id !== res.id) continue;
      const diff = Math.abs((d.getTime() - parseDate(jj.dateKey).getTime()) / 86400000);
      if (diff < 2) return false;
    }
    // Limit consecutive weekends: if this is a weekend-call day, count nearby weekends within ±14 days.
    // The count keys off the calendar isWeekend flag (Sat/Sun marker) so a Fri–Sun pair counts as
    // one weekend, not two — but the trigger uses the weekend-call definition so receiving a Friday
    // is guarded too.
    if (isWeekendCall(key)) {
      let nearbyWknds = 0;
      for (const jj of juniorDays) {
        if (jj.res.id !== res.id || !jj.isWeekend) continue;
        const diff = Math.abs((d.getTime() - parseDate(jj.dateKey).getTime()) / 86400000);
        if (diff <= 14) nearbyWknds++;
      }
      if (nearbyWknds >= 2) return false;
    }
    return true;
  }

  function reassignJD(jd: JuniorDay, from: Resident, to: Resident) {
    jd.res = to;
    // Bucket by weekend-call classification (Fri/Sat/Sun/holiday), matching how addJD tallied it —
    // not the calendar isWeekend flag, which excludes Friday and holiday-weekdays.
    const isWkndCall = isWeekendCall(jd.dateKey);
    jrC[from.id]--; jrC[to.id]++;
    jrH[from.id] -= jd.shiftHrs; jrH[to.id] += jd.shiftHrs;
    if (isWkndCall) { jrHwknd[from.id] -= jd.shiftHrs; jrHwknd[to.id] += jd.shiftHrs; }
    else            { jrHwkday[from.id] -= jd.shiftHrs; jrHwkday[to.id] += jd.shiftHrs; }
    if (jd.isTrauma) {
      jrTH[from.id] -= jd.shiftHrs; jrTH[to.id] += jd.shiftHrs;
      if (isWkndCall) { jrTHwknd[from.id] -= jd.shiftHrs; jrTHwknd[to.id] += jd.shiftHrs; }
      else            { jrTHwkday[from.id] -= jd.shiftHrs; jrTHwkday[to.id] += jd.shiftHrs; }
    }
  }

  // ── Generic within-block equity rebalancer ──────────────────────────────────
  // Equalize one ratio metric (e.g. weekend hours / weekend potential) across the
  // junior pool. Unlike a naive "move from the single most-over to the single
  // most-under" loop — which stops the instant that one pair is blocked by the
  // spacing rules in canReceive — this searches EVERY over→under pair each
  // iteration and makes the first legal, gap-shrinking move it finds. A move is
  // only kept if it actually reduces that pair's ratio gap (otherwise reverted),
  // which prevents overshoot/oscillation and guarantees monotonic convergence.
  //
  //   ratioOf      — current utilization ratio for a resident (live jr* state)
  //   isCandidate  — which of the over-resident's shifts may be moved
  // Fri–Sun pairs always move together so a weekend is never split across people.
  function rebalance(
    ratioOf: (r: Resident) => number,
    isCandidate: (jd: JuniorDay) => boolean,
    tol = 0.05,
  ) {
    for (let iter = 0; iter < 400; iter++) {
      const sorted = [...jrs].sort((a, b) => ratioOf(a) - ratioOf(b));
      if (ratioOf(sorted[sorted.length - 1]) - ratioOf(sorted[0]) <= tol) break;

      let moved = false;
      // Largest-gap pairs first: most-over with most-under, then inward.
      for (let oi = sorted.length - 1; oi >= 1 && !moved; oi--) {
        const over = sorted[oi];
        for (let ui = 0; ui < oi && !moved; ui++) {
          const under = sorted[ui];
          const gapBefore = ratioOf(over) - ratioOf(under);
          if (gapBefore <= tol) continue;

          const candidates = juniorDays.filter((jd) => jd.res.id === over.id && isCandidate(jd) && !jd.override);
          for (const jd of candidates) {
            let sunJd: JuniorDay | undefined;
            if (jd.type === 'sun-pair') continue; // moved with its Friday partner
            if (jd.type === 'fri-pair') {
              const sunKey = dk(addDays(parseDate(jd.dateKey), 2));
              sunJd = juniorDays.find((jj) => jj.dateKey === sunKey && jj.res.id === over.id);
              if (!sunJd || !canReceive(jd.dateKey, under) || !canReceive(sunKey, under)) continue;
            } else {
              if (!canReceive(jd.dateKey, under)) continue;
            }

            // Tentatively move, keep only if it shrinks this pair's gap.
            reassignJD(jd, over, under);
            if (sunJd) reassignJD(sunJd, over, under);
            if (Math.abs(ratioOf(over) - ratioOf(under)) < gapBefore - 1e-9) {
              moved = true;
              break;
            }
            reassignJD(jd, under, over); // revert — overshoot, no improvement
            if (sunJd) reassignJD(sunJd, under, over);
          }
        }
      }
      if (!moved) break;
    }
  }

  // Validate a resident's ENTIRE shift set against the spacing rules (same rules as
  // canReceive, but checked globally): no two call days within 2 days, and no more than
  // two weekend-call days inside any 14-day window. Used to vet trauma swaps, which move
  // shifts in both directions at once and so can't be checked with canReceive alone.
  function spacingOk(resId: string): boolean {
    const mine = juniorDays.filter((j) => j.res.id === resId);
    const times = mine.map((j) => parseDate(j.dateKey).getTime()).sort((a, b) => a - b);
    for (let i = 1; i < times.length; i++) {
      if ((times[i] - times[i - 1]) / 86400000 < 2) return false;
    }
    const wkndTimes = mine.filter((j) => j.isWeekend).map((j) => parseDate(j.dateKey).getTime());
    for (const t of wkndTimes) {
      let n = 0;
      for (const u of wkndTimes) if (Math.abs((t - u) / 86400000) <= 14) n++;
      if (n > 2) return false;
    }
    return true;
  }

  // The movable "unit" for a weekend shift: a standalone Saturday/holiday (one JuniorDay,
  // 24h) or a Fri+Sun pair (two JuniorDays, 12+24 = 36h) that always travel together.
  // Returns null for shifts that can't be cleanly swapped (e.g. an orphaned sun-pair).
  function weekendUnit(jd: JuniorDay): JuniorDay[] | null {
    if (jd.type === 'saturday' || jd.type === 'sunday') return [jd];
    if (jd.type === 'fri-pair') {
      const sunKey = dk(addDays(parseDate(jd.dateKey), 2));
      const sun = juniorDays.find((j) => j.dateKey === sunKey && j.res.id === jd.res.id);
      return sun ? [jd, sun] : null;
    }
    return null; // sun-pair (handled via its Friday) or weekday-holiday — skip
  }
  const unitHours = (u: JuniorDay[]) => u.reduce((s, j) => s + j.shiftHrs, 0);
  const moveUnit = (u: JuniorDay[], from: Resident, to: Resident) => u.forEach((j) => reassignJD(j, from, to));

  // Trauma-weekend rebalancer via compensating swaps. Trauma hours are dominated by trauma
  // WEEKENDS, the one cell shared by the weekend and trauma axes — so they can't be moved by
  // a plain reassignment without skewing weekend hours. Instead we SWAP an over-trauma
  // resident's trauma weekend for an under-trauma resident's equal-length NON-trauma weekend.
  // Equal length ⇒ each keeps the same weekend hours (and same total hours); only trauma
  // hours move. Weekend and total equity are therefore preserved exactly.
  function traumaSwap(tol = 0.05) {
    const ratioOf = (r: Resident) => jrTH[r.id] / rotPotentialTraumaHours[r.id];
    for (let iter = 0; iter < 400; iter++) {
      const sorted = [...jrs].sort((a, b) => ratioOf(a) - ratioOf(b));
      if (ratioOf(sorted[sorted.length - 1]) - ratioOf(sorted[0]) <= tol) break;

      let moved = false;
      for (let oi = sorted.length - 1; oi >= 1 && !moved; oi--) {
        const over = sorted[oi];
        for (let ui = 0; ui < oi && !moved; ui++) {
          const under = sorted[ui];
          const gapBefore = ratioOf(over) - ratioOf(under);
          if (gapBefore <= tol) continue;

          const overUnits = juniorDays
            .filter((j) => j.res.id === over.id && j.isTrauma && isWeekendCall(j.dateKey) && !j.override)
            .map(weekendUnit).filter((u): u is JuniorDay[] => u !== null);
          const underUnits = juniorDays
            .filter((j) => j.res.id === under.id && !j.isTrauma && isWeekendCall(j.dateKey) && !j.override)
            .map(weekendUnit).filter((u): u is JuniorDay[] => u !== null);

          for (const ou of overUnits) {
            for (const uu of underUnits) {
              if (unitHours(ou) !== unitHours(uu)) continue; // equal length ⇒ weekend hours preserved
              // Tentatively swap both units, then validate spacing + trauma improvement.
              moveUnit(ou, over, under);
              moveUnit(uu, under, over);
              const ok = spacingOk(over.id) && spacingOk(under.id) &&
                         Math.abs(ratioOf(over) - ratioOf(under)) < gapBefore - 1e-9;
              if (ok) { moved = true; break; }
              moveUnit(ou, under, over); // revert
              moveUnit(uu, over, under);
            }
            if (moved) break;
          }
        }
      }
      if (!moved) break;
    }
  }

  // Four passes over the four disjoint shift buckets — {weekday,weekend} × {non-trauma,trauma} —
  // ordered so each pass only preserves the equity established before it:
  //
  //                weekday        weekend(Fri/Sat/Sun/hol)
  //   non-trauma   A (total)      C (weekend)
  //   trauma       B (trauma)     D (trauma weekend)
  //
  //   1. Weekend    — moves C only             → evens weekend hours.
  //   2. TraumaSwap — swaps D ↔ equal-length C → evens trauma WEEKEND load while keeping every
  //                   resident's weekend hours (and totals) unchanged, so step 1 is preserved.
  //   3. Trauma     — moves B only             → fine-tunes trauma in 12h steps (weekday-only, so
  //                   weekend stays put); only total hours shift, fixed by step 4.
  //   4. Total      — moves A only             → evens total hours, touching neither weekend nor trauma.
  rebalance(
    (r) => jrHwknd[r.id] / rotWkndPotentialHours[r.id],
    (jd) => isWeekendCall(jd.dateKey) && !jd.isTrauma,
  );
  traumaSwap();
  rebalance(
    (r) => jrTH[r.id] / rotPotentialTraumaHours[r.id],
    (jd) => jd.isTrauma && !isWeekendCall(jd.dateKey),
  );
  rebalance(
    (r) => jrH[r.id] / rotPotentialHours[r.id],
    (jd) => !isWeekendCall(jd.dateKey) && !jd.isTrauma,
    0.035, // tighter target for total hours (user wants within ~4%); safe — moves only
           // weekday non-trauma shifts, so it can't disturb weekend or trauma balance.
  );

  } // end needJr

  return {
    bStart: bStartStr,
    bEnd: bEndStr,
    blockName,
    seniorWeeks,
    juniorDays,
    resBkpWeeks,
    resBkpDays,
    resBkpWeekDates: [...resBkpWeekDatesSet],
    resBkpDayKeys: [...resBkpDayKeysSet],
    srC,
    jrC,
    jrH,
    jrHwknd,
    published: blockPublished,
    jrTH,
    jrTHwknd,
    jrTHwkday,
    jrTD,
    jrAvailDays: rotAvailDays,
    jrWkndAvailDays: rotWkndAvailDays,
    jrWkndPotentialHours: rotWkndPotentialHours,
    jrPotentialHours: rotPotentialHours,
    jrPotentialTraumaHours: rotPotentialTraumaHours,
  };
}

// ─── CMC Schedule ─────────────────────────────────────────────────────────────

export function generateCMCSchedule(
  residents: Resident[],
  requests: Request[],
  blockName: string,
  bStartStr: string,
  bEndStr: string,
): CMCScheduleData {
  const pool = residents
    .filter((r) => r.status === 'active')
    .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
  if (!pool.length) throw new Error('No active residents in CMC pool for this period');

  const bStart = parseDate(bStartStr);
  const bEnd   = parseDate(bEndStr);

  // Build off map: vacation requests for each resident
  const offMap: Record<string, Set<string>> = {};
  pool.forEach((r) => {
    const vac = new Set(
      requests
        .filter((req) => req.resident_id === r.id && (req.type === 'vacation' || req.type === 'vacation_official'))
        .map((req) => req.date),
    );
    // Also mark dates outside the resident's CMC rotation segments as off
    const cmcSegs = r.rotations?.filter((s) => s.hospital === 'CMC') ?? [];
    if (cmcSegs.length > 0) {
      let d = new Date(bStart);
      while (d <= bEnd) {
        const dstr = dk(d);
        if (!cmcSegs.some((seg) => dstr >= seg.start_date && dstr <= seg.end_date)) vac.add(dstr);
        d = addDays(d, 1);
      }
    }
    offMap[r.id] = vac;
  });

  // Equity-aligned availability: only subtract official vacation + off-rotation (not informal vacation).
  // Used for sort denominators so informal vacation days don't cause under-assignment.
  const cmcEquityOffMap: Record<string, Set<string>> = {};
  pool.forEach((r) => {
    const s = new Set(
      requests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date),
    );
    const cmcSegs = r.rotations?.filter((seg) => seg.hospital === 'CMC') ?? [];
    if (cmcSegs.length > 0) {
      let d = new Date(bStart);
      while (d <= bEnd) {
        const dstr = dk(d);
        if (!cmcSegs.some((seg) => dstr >= seg.start_date && dstr <= seg.end_date)) s.add(dstr);
        d = addDays(d, 1);
      }
    }
    cmcEquityOffMap[r.id] = s;
  });

  const cmcDays: CMCDay[] = [];
  const counts:         Record<string, number> = {};
  const hours:          Record<string, number> = {};
  const traumaHours:    Record<string, number> = {};
  const wkndHours:      Record<string, number> = {}; // power-weekend hours only (weekend equity numerator)
  const wdCount:        Record<string, number> = {}; // weekday shifts only
  const pwCount:        Record<string, number> = {}; // power weekends only
  const lastWkdayDate:  Record<string, string>  = {}; // last weekday shift date per resident
  pool.forEach((r) => { counts[r.id] = 0; hours[r.id] = 0; traumaHours[r.id] = 0; wkndHours[r.id] = 0; wdCount[r.id] = 0; pwCount[r.id] = 0; lastWkdayDate[r.id] = '1900-01-01'; });

  // Available weekdays (Mon–Thu) per resident — uses equityOffMap so informal vacation doesn't skew sort
  const wdAvail: Record<string, number> = {};
  pool.forEach((r) => {
    let cnt = 0;
    let ad = new Date(bStart);
    while (ad <= bEnd) {
      const dow = ad.getDay();
      if (dow >= 1 && dow <= 4 && !cmcEquityOffMap[r.id].has(dk(ad))) cnt++;
      ad = addDays(ad, 1);
    }
    wdAvail[r.id] = Math.max(cnt, 1);
  });

  // Available power weekends (Fri+Sat+Sun) per resident — uses equityOffMap
  const pwAvail: Record<string, number> = {};
  pool.forEach((r) => {
    let cnt = 0;
    let fd2 = new Date(bStart);
    while (fd2 <= bEnd) {
      if (fd2.getDay() === 5) {
        const friKey = dk(fd2), satKey = dk(addDays(fd2, 1)), sunKey = dk(addDays(fd2, 2));
        if (!(cmcEquityOffMap[r.id].has(friKey) && cmcEquityOffMap[r.id].has(satKey) && cmcEquityOffMap[r.id].has(sunKey))) cnt++;
      }
      fd2 = addDays(fd2, 1);
    }
    pwAvail[r.id] = Math.max(cnt, 1);
  });

  // Potential weekend-call HOURS per resident — power-weekend hours (Fri 12 + Sat 24 + Sun 24),
  // clipped to the block and excluding fully-off weekends. Denominator for the weekend equity ratio,
  // mirroring CUH/PMH's rotWkndPotentialHours so numerator (wkndHours) and denominator share units.
  const wkndPotentialHours: Record<string, number> = {};
  pool.forEach((r) => {
    let h = 0;
    let fd2 = new Date(bStart);
    while (fd2 <= bEnd) {
      if (fd2.getDay() === 5) {
        const friKey = dk(fd2), satKey = dk(addDays(fd2, 1)), sunKey = dk(addDays(fd2, 2));
        const fullyOff = cmcEquityOffMap[r.id].has(friKey) && cmcEquityOffMap[r.id].has(satKey) && cmcEquityOffMap[r.id].has(sunKey);
        if (!fullyOff) {
          for (const [key, hrs] of [[friKey, 12], [satKey, 24], [sunKey, 24]] as [string, number][]) {
            const pd = parseDate(key);
            if (pd >= bStart && pd <= bEnd) h += hrs;
          }
        }
      }
      fd2 = addDays(fd2, 1);
    }
    wkndPotentialHours[r.id] = Math.max(h, 1);
  });

  // Potential trauma HOURS per resident — trauma-week hours the resident is available for
  // (Sat/Sun 24h, all other days 12h). Denominator for the trauma equity ratio, mirroring
  // CUH/PMH's rotPotentialTraumaHours (replaces the prior day-count denominator).
  const traumaPotentialHours: Record<string, number> = {};
  pool.forEach((r) => {
    let h = 0;
    let td = new Date(bStart);
    while (td <= bEnd) {
      const key = dk(td);
      if (TRAUMA_WEEKS.has(key) && !cmcEquityOffMap[r.id].has(key)) {
        const dow = td.getDay();
        // PGY4 residents don't take trauma power weekends; exclude Fri/Sat/Sun from their potential.
        if (r.pgy >= 4 && (dow === 5 || dow === 6 || dow === 0)) { td = addDays(td, 1); continue; }
        h += (dow === 0 || dow === 6) ? 24 : 12;
      }
      td = addDays(td, 1);
    }
    traumaPotentialHours[r.id] = Math.max(h, 1);
  });

  // Weekday pick: weekday equity (wdCount/wdAvail) primary; on trauma days the trauma equity
  // ratio (trauma hours / trauma potential hours) takes precedence, matching CUH/PMH.
  function pickWeekday(candidates: Resident[], isTraumaDay: boolean): Resident {
    return [...candidates].sort((a, b) => {
      if (isTraumaDay) {
        const aProp = traumaHours[a.id] / traumaPotentialHours[a.id];
        const bProp = traumaHours[b.id] / traumaPotentialHours[b.id];
        if (Math.abs(aProp - bProp) > 1e-9) return aProp - bProp;
      }
      const ratioA = wdCount[a.id] / wdAvail[a.id];
      const ratioB = wdCount[b.id] / wdAvail[b.id];
      if (Math.abs(ratioA - ratioB) > 1e-9) return ratioA - ratioB;
      // Tiebreak: prefer whoever has gone longest since their last weekday shift
      return lastWkdayDate[a.id].localeCompare(lastWkdayDate[b.id]);
    })[0];
  }

  // Power weekend pick: weekend equity ratio primary, pwCount/pwAvail tiebreak.
  // On trauma weekends, trauma ratio is the primary sort key so the person with the
  // fewest trauma hours always gets the next trauma weekend; weekend ratio is secondary.
  function pickPowerWeekend(candidates: Resident[], isTraumaWeekend: boolean): Resident {
    return [...candidates].sort((a, b) => {
      const aW = wkndHours[a.id] / wkndPotentialHours[a.id];
      const bW = wkndHours[b.id] / wkndPotentialHours[b.id];
      if (isTraumaWeekend) {
        const aT = traumaHours[a.id] / traumaPotentialHours[a.id];
        const bT = traumaHours[b.id] / traumaPotentialHours[b.id];
        if (Math.abs(aT - bT) > 1e-9) return aT - bT;   // trauma ratio primary
        if (Math.abs(aW - bW) > 1e-9) return aW - bW;   // weekend ratio secondary
      } else if (Math.abs(aW - bW) > 1e-9) {
        return aW - bW;
      }
      return pwCount[a.id] / pwAvail[a.id] - pwCount[b.id] / pwAvail[b.id];
    })[0];
  }

  // ── Step 1: Assign power weekends (Fri+Sat+Sun) ──────────────────────────────
  const fridays: Date[] = [];
  let fd = new Date(bStart);
  while (fd <= bEnd) {
    if (fd.getDay() === 5) fridays.push(new Date(fd));
    fd = addDays(fd, 1);
  }

  const pwByFri = new Map<string, Resident>();
  let lastPwId: string | null = null;

  for (const fri of fridays) {
    const friKey = dk(fri);
    const satKey = dk(addDays(fri, 1));
    const sunKey = dk(addDays(fri, 2));
    const isPwTrauma = TRAUMA_WEEKS.has(friKey) || TRAUMA_WEEKS.has(satKey) || TRAUMA_WEEKS.has(sunKey);

    const notFullyOff = (r: Resident) =>
      !(offMap[r.id].has(friKey) && offMap[r.id].has(satKey) && offMap[r.id].has(sunKey));
    const notPgy4 = (r: Resident) => !isPwTrauma || r.pgy < 4;

    // Fallback chain: PGY4 excluded from trauma weekends at every level until no other option.
    let candidates = pool.filter((r) => notPgy4(r) && r.id !== lastPwId && notFullyOff(r));
    if (!candidates.length) candidates = pool.filter((r) => notPgy4(r) && r.id !== lastPwId);
    if (!candidates.length) candidates = pool.filter((r) => notPgy4(r) && notFullyOff(r));
    if (!candidates.length) candidates = pool.filter((r) => notPgy4(r));
    // Only allow PGY4 on a trauma weekend if truly no other option exists.
    if (!candidates.length) candidates = pool.filter((r) => r.id !== lastPwId && notFullyOff(r));
    if (!candidates.length) candidates = pool.filter((r) => r.id !== lastPwId);
    if (!candidates.length) candidates = [...pool];

    // Lookahead: for non-trauma weekends within 2 weeks of an upcoming trauma weekend,
    // prefer PGY4 to keep both PGY2/PGY3 free for the trauma assignment (the lastPwId
    // constraint would otherwise block one of them). If PGY4 is also blocked, give this
    // slot to the PGY2/PGY3 with the HIGHEST trauma ratio so the least-loaded one is
    // preserved for the trauma weekend.
    if (!isPwTrauma) {
      const isPwTraumaFn = (f: Date) =>
        TRAUMA_WEEKS.has(dk(f)) || TRAUMA_WEEKS.has(dk(addDays(f, 1))) || TRAUMA_WEEKS.has(dk(addDays(f, 2)));
      if (isPwTraumaFn(addDays(fri, 7)) || isPwTraumaFn(addDays(fri, 14))) {
        const pgy4Only = candidates.filter((r) => r.pgy >= 4);
        if (pgy4Only.length) {
          candidates = pgy4Only;
        } else {
          // Give this non-trauma slot to the most trauma-loaded PGY2/PGY3.
          const mostLoaded = [...candidates].sort(
            (a, b) =>
              traumaHours[b.id] / traumaPotentialHours[b.id] -
              traumaHours[a.id] / traumaPotentialHours[a.id],
          )[0];
          if (mostLoaded) candidates = [mostLoaded];
        }
      }
    }

    const pick = pickPowerWeekend(candidates, isPwTrauma);
    pwByFri.set(friKey, pick);
    lastPwId = pick.id;
    pwCount[pick.id]++;

    for (const [key, shiftHrs] of [[friKey, 12], [satKey, 24], [sunKey, 24]] as [string, number][]) {
      const pd = parseDate(key);
      if (pd >= bStart && pd <= bEnd) {
        cmcDays.push({ dateKey: key, res: pick, shiftHrs, isPowerWeekend: true, override: false });
        counts[pick.id]++;
        hours[pick.id] += shiftHrs;
        wkndHours[pick.id] += shiftHrs;
        if (TRAUMA_WEEKS.has(key)) traumaHours[pick.id] += shiftHrs;
      }
    }
  }

  // ── Step 2: Assign Mon–Thu weekdays ──────────────────────────────────────────
  // Hard constraint: no consecutive weekdays (different person every day Mon–Thu).
  let lastWkdayId: string | null = null;

  let d = new Date(bStart);
  while (d <= bEnd) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 4) {
      const dateKey = dk(d);
      const isTraumaDay = TRAUMA_WEEKS.has(dateKey);
      // Hard constraints:
      //   1. No consecutive weekdays (exclude yesterday's person)
      //   2. Thu → exclude the upcoming power weekend person
      //   3. Mon → exclude the person who just did the power weekend
      const pwExcludeId =
        dow === 4 ? (pwByFri.get(dk(addDays(d, 1)))?.id ?? null) :
        dow === 1 ? (pwByFri.get(dk(addDays(d, -3)))?.id ?? null) :
        null;

      let avail = pool.filter(
        (r) => !offMap[r.id].has(dateKey) && r.id !== lastWkdayId && r.id !== pwExcludeId,
      );
      // Relax no-consecutive if needed, but always keep PW exclusion
      if (!avail.length) {
        avail = pool.filter((r) => !offMap[r.id].has(dateKey) && r.id !== pwExcludeId);
      }
      if (!avail.length) avail = pool.filter((r) => !offMap[r.id].has(dateKey));
      if (!avail.length) avail = [...pool];

      const pick = pickWeekday(avail, isTraumaDay);
      cmcDays.push({ dateKey, res: pick, shiftHrs: 12, isPowerWeekend: false, override: false });
      counts[pick.id]++;
      hours[pick.id] += 12;
      wdCount[pick.id]++;
      lastWkdayDate[pick.id] = dateKey;
      if (isTraumaDay) traumaHours[pick.id] += 12;
      lastWkdayId = pick.id;
    } else {
      if (dow === 5) lastWkdayId = null;
    }
    d = addDays(d, 1);
  }

  // ── Post-hoc rebalancing ────────────────────────────────────────────────────
  // Three passes mirror the CUHPMH approach:
  //   1. Weekend equity — moves power weekends to even wkndHours / wkndPotentialHours.
  //   2. Trauma swap    — swaps trauma ↔ non-trauma power weekends (equal total hours)
  //                       to redistribute trauma without disturbing weekend equity.
  //   3. Weekday equity — moves weekday shifts to even wdCount / wdAvail.

  // Total CMC hours for a power weekend (may be <60h near block boundaries where
  // Sat or Sun falls outside the block range).
  function pwTotalHrs(friKey: string): number {
    const fri = parseDate(friKey);
    let h = 0;
    for (const [d, hrs] of [[fri, 12], [addDays(fri, 1), 24], [addDays(fri, 2), 24]] as [Date, number][]) {
      if (d >= bStart && d <= bEnd) h += hrs;
    }
    return h;
  }

  // Reassign an entire power weekend (Fri+Sat+Sun) atomically from `from` to `to`.
  function cmcReassignPW(friKey: string, from: Resident, to: Resident) {
    const fri = parseDate(friKey);
    const satKey = dk(addDays(fri, 1));
    const sunKey = dk(addDays(fri, 2));
    for (const day of cmcDays) {
      if (!day.isPowerWeekend || day.res.id !== from.id) continue;
      if (day.dateKey !== friKey && day.dateKey !== satKey && day.dateKey !== sunKey) continue;
      day.res = to;
      counts[from.id]--; counts[to.id]++;
      hours[from.id] -= day.shiftHrs; hours[to.id] += day.shiftHrs;
      wkndHours[from.id] -= day.shiftHrs; wkndHours[to.id] += day.shiftHrs;
      if (TRAUMA_WEEKS.has(day.dateKey)) {
        traumaHours[from.id] -= day.shiftHrs; traumaHours[to.id] += day.shiftHrs;
      }
    }
    pwCount[from.id]--; pwCount[to.id]++;
    pwByFri.set(friKey, to);
  }

  // Validate that all of a resident's power-weekend assignments satisfy:
  //   - No back-to-back weekends (adjacent Fridays ≤7 days apart).
  //   - No Thursday weekday call the day before any of their power weekends.
  //   - No Monday weekday call the day after any of their power weekends.
  // Used by cmcTraumaSwap to vet both sides of a swap simultaneously.
  function cmcPwSpacingOk(res: Resident): boolean {
    const myFridays = [...pwByFri.entries()]
      .filter(([, r]) => r.id === res.id)
      .map(([key]) => key)
      .sort();
    for (let i = 1; i < myFridays.length; i++) {
      const a = parseDate(myFridays[i - 1]).getTime();
      const b = parseDate(myFridays[i]).getTime();
      if ((b - a) / 86400000 <= 7) return false;
    }
    for (const friKey of myFridays) {
      const fri = parseDate(friKey);
      const thuKey = dk(addDays(fri, -1));
      const monKey = dk(addDays(fri,  3));
      if (cmcDays.some((d) => d.dateKey === thuKey && !d.isPowerWeekend && d.res.id === res.id)) return false;
      if (cmcDays.some((d) => d.dateKey === monKey && !d.isPowerWeekend && d.res.id === res.id)) return false;
    }
    return true;
  }

  // A resident can receive a power weekend only if:
  //   - Not fully off all three days.
  //   - Would not create back-to-back power weekends (adjacent Fri ±7d).
  //   - The Thursday before and Monday after are not already their weekday shifts.
  //   - PGY4 residents cannot receive trauma power weekends.
  function cmcCanReceivePW(friKey: string, res: Resident): boolean {
    const fri = parseDate(friKey);
    const satKey = dk(addDays(fri, 1));
    const sunKey = dk(addDays(fri, 2));
    if (offMap[res.id].has(friKey) && offMap[res.id].has(satKey) && offMap[res.id].has(sunKey)) return false;
    if (pwByFri.get(dk(addDays(fri, -7)))?.id === res.id) return false;
    if (pwByFri.get(dk(addDays(fri,  7)))?.id === res.id) return false;
    const thuKey = dk(addDays(fri, -1));
    const monKey = dk(addDays(fri,  3));
    if (cmcDays.some((d) => d.dateKey === thuKey && !d.isPowerWeekend && d.res.id === res.id)) return false;
    if (cmcDays.some((d) => d.dateKey === monKey && !d.isPowerWeekend && d.res.id === res.id)) return false;
    if (res.pgy >= 4 && (TRAUMA_WEEKS.has(friKey) || TRAUMA_WEEKS.has(satKey) || TRAUMA_WEEKS.has(sunKey))) return false;
    return true;
  }

  // Move entire power weekends from over- to under-assigned residents until the
  // weekend-ratio gap (wkndHours / wkndPotentialHours) is ≤ tol.
  function cmcRebalanceWeekend(tol = 0.04) {
    const ratioOf = (r: Resident) => wkndHours[r.id] / wkndPotentialHours[r.id];
    for (let iter = 0; iter < 400; iter++) {
      const sorted = [...pool].sort((a, b) => ratioOf(a) - ratioOf(b));
      if (ratioOf(sorted[sorted.length - 1]) - ratioOf(sorted[0]) <= tol) break;
      let moved = false;
      for (let oi = sorted.length - 1; oi >= 1 && !moved; oi--) {
        const over = sorted[oi];
        for (let ui = 0; ui < oi && !moved; ui++) {
          const under = sorted[ui];
          const gapBefore = ratioOf(over) - ratioOf(under);
          if (gapBefore <= tol) continue;
          const overFridays = [...pwByFri.entries()]
            .filter(([, r]) => r.id === over.id)
            .map(([key]) => key);
          for (const friKey of overFridays) {
            const fri2 = parseDate(friKey);
            const hasOverride = cmcDays.some(
              (day) =>
                day.isPowerWeekend &&
                day.res.id === over.id &&
                day.override &&
                (day.dateKey === friKey ||
                  day.dateKey === dk(addDays(fri2, 1)) ||
                  day.dateKey === dk(addDays(fri2, 2))),
            );
            if (hasOverride) continue;
            if (!cmcCanReceivePW(friKey, under)) continue;
            cmcReassignPW(friKey, over, under);
            if (Math.abs(ratioOf(over) - ratioOf(under)) < gapBefore - 1e-9) {
              moved = true;
              break;
            }
            cmcReassignPW(friKey, under, over); // revert — overshoot
          }
        }
      }
      if (!moved) break;
    }
  }

  // Redistribute trauma hours via compensating swaps: trade a trauma power weekend
  // from the most over-loaded resident for an equal-total-hours non-trauma power
  // weekend from the most under-loaded resident. Equal hours ⇒ each resident's
  // wkndHours and total hours are unchanged; only traumaHours shifts.
  // Mirrors CUHPMH's traumaSwap() pass.
  function cmcTraumaSwap(tol = 0.04) {
    // PGY4 residents don't take trauma weekends — exclude them from trauma equity.
    const traumaPool = pool.filter((r) => r.pgy < 4);
    const ratioOf = (r: Resident) => traumaHours[r.id] / traumaPotentialHours[r.id];

    const isPwTraumaFn = (friKey: string) => {
      const fri = parseDate(friKey);
      return TRAUMA_WEEKS.has(friKey) || TRAUMA_WEEKS.has(dk(addDays(fri, 1))) || TRAUMA_WEEKS.has(dk(addDays(fri, 2)));
    };

    const hasPwOverride = (friKey: string, resId: string) => {
      const fri = parseDate(friKey);
      return cmcDays.some(
        (d) =>
          d.isPowerWeekend && d.res.id === resId && d.override &&
          (d.dateKey === friKey || d.dateKey === dk(addDays(fri, 1)) || d.dateKey === dk(addDays(fri, 2))),
      );
    };

    for (let iter = 0; iter < 400; iter++) {
      const sorted = [...traumaPool].sort((a, b) => ratioOf(a) - ratioOf(b));
      if (ratioOf(sorted[sorted.length - 1]) - ratioOf(sorted[0]) <= tol) break;

      let moved = false;
      for (let oi = sorted.length - 1; oi >= 1 && !moved; oi--) {
        const over = sorted[oi];
        for (let ui = 0; ui < oi && !moved; ui++) {
          const under = sorted[ui];
          const gapBefore = ratioOf(over) - ratioOf(under);
          if (gapBefore <= tol) continue;

          const overTrauma = [...pwByFri.entries()]
            .filter(([k, r]) => r.id === over.id && isPwTraumaFn(k) && !hasPwOverride(k, over.id))
            .map(([k]) => k);

          const underNonTrauma = [...pwByFri.entries()]
            .filter(([k, r]) => r.id === under.id && !isPwTraumaFn(k) && !hasPwOverride(k, under.id))
            .map(([k]) => k);

          for (const ouKey of overTrauma) {
            for (const uuKey of underNonTrauma) {
              // Equal total hours ⇒ weekend equity is preserved after the swap.
              if (pwTotalHrs(ouKey) !== pwTotalHrs(uuKey)) continue;

              cmcReassignPW(ouKey, over, under);
              cmcReassignPW(uuKey, under, over);

              const ok =
                cmcPwSpacingOk(over) &&
                cmcPwSpacingOk(under) &&
                Math.abs(ratioOf(over) - ratioOf(under)) < gapBefore - 1e-9;

              if (ok) { moved = true; break; }
              cmcReassignPW(ouKey, under, over);  // revert
              cmcReassignPW(uuKey, over, under);
            }
            if (moved) break;
          }
        }
      }
      if (!moved) break;
    }
  }


  // Reassign a single weekday shift atomically.
  function cmcReassignWD(dateKey: string, from: Resident, to: Resident) {
    const day = cmcDays.find((d) => d.dateKey === dateKey && !d.isPowerWeekend && d.res.id === from.id);
    if (!day) return;
    day.res = to;
    counts[from.id]--; counts[to.id]++;
    hours[from.id] -= 12; hours[to.id] += 12;
    wdCount[from.id]--; wdCount[to.id]++;
    if (TRAUMA_WEEKS.has(dateKey)) {
      traumaHours[from.id] -= 12; traumaHours[to.id] += 12;
    }
  }

  // A resident can receive a weekday shift only if they are not off, would not
  // create consecutive weekday shifts, and the Thu→Fri / Mon←Sun power-weekend
  // adjacency constraints are respected.
  function cmcCanReceiveWD(dateKey: string, res: Resident): boolean {
    if (offMap[res.id].has(dateKey)) return false;
    const dd = parseDate(dateKey);
    const dow = dd.getDay();
    const prevKey = dk(addDays(dd, -1));
    const nextKey = dk(addDays(dd,  1));
    if (cmcDays.some((day) => day.dateKey === prevKey && !day.isPowerWeekend && day.res.id === res.id)) return false;
    if (cmcDays.some((day) => day.dateKey === nextKey && !day.isPowerWeekend && day.res.id === res.id)) return false;
    if (dow === 4 && pwByFri.get(dk(addDays(dd, 1)))?.id  === res.id) return false;
    if (dow === 1 && pwByFri.get(dk(addDays(dd, -3)))?.id === res.id) return false;
    return true;
  }

  // Move individual weekday shifts from over- to under-assigned residents until
  // the weekday-count ratio (wdCount / wdAvail) gap is ≤ tol.
  function cmcRebalanceWeekday(tol = 0.04) {
    const ratioOf = (r: Resident) => wdCount[r.id] / wdAvail[r.id];
    for (let iter = 0; iter < 400; iter++) {
      const sorted = [...pool].sort((a, b) => ratioOf(a) - ratioOf(b));
      if (ratioOf(sorted[sorted.length - 1]) - ratioOf(sorted[0]) <= tol) break;
      let moved = false;
      for (let oi = sorted.length - 1; oi >= 1 && !moved; oi--) {
        const over = sorted[oi];
        for (let ui = 0; ui < oi && !moved; ui++) {
          const under = sorted[ui];
          const gapBefore = ratioOf(over) - ratioOf(under);
          if (gapBefore <= tol) continue;
          const candidates = cmcDays.filter(
            (day) =>
              day.res.id === over.id &&
              !day.isPowerWeekend &&
              !day.override &&
              !(over.pgy >= 4 && TRAUMA_WEEKS.has(day.dateKey)), // protect PGY4 trauma weekdays
          );
          for (const day of candidates) {
            if (!cmcCanReceiveWD(day.dateKey, under)) continue;
            cmcReassignWD(day.dateKey, over, under);
            if (Math.abs(ratioOf(over) - ratioOf(under)) < gapBefore - 1e-9) {
              moved = true;
              break;
            }
            cmcReassignWD(day.dateKey, under, over); // revert — overshoot
          }
        }
      }
      if (!moved) break;
    }
  }

  cmcRebalanceWeekend();
  cmcTraumaSwap();
  cmcRebalanceWeekday();

  cmcDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    type: 'cmc',
    bStart: bStartStr,
    bEnd: bEndStr,
    blockName,
    days: cmcDays,
    counts,
    hours,
    published: false,
  };
}

// ─── VA Schedule ──────────────────────────────────────────────────────────────

export function generateVASchedule(
  residents: Resident[],
  requests: Request[],
  blockName: string,
  bStartStr: string,
  bEndStr: string,
): VAScheduleData {
  const pool = residents
    .filter((r) => r.status === 'active')
    .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
  if (pool.length < 1) throw new Error('No active residents in VA pool for this period');

  const bStart = parseDate(bStartStr);
  const bEnd   = parseDate(bEndStr);

  // Build off map: vacation requests for each resident
  const offMap: Record<string, Set<string>> = {};
  pool.forEach((r) => {
    const vac = new Set(
      requests
        .filter((req) => req.resident_id === r.id && (req.type === 'vacation' || req.type === 'vacation_official'))
        .map((req) => req.date),
    );
    // Mark dates outside VA rotation segments as off
    const vaSegs = r.rotations?.filter((s) => s.hospital === 'VA') ?? [];
    if (vaSegs.length > 0) {
      let d2 = new Date(bStart);
      while (d2 <= bEnd) {
        const dstr = dk(d2);
        if (!vaSegs.some((seg) => dstr >= seg.start_date && dstr <= seg.end_date)) vac.add(dstr);
        d2 = addDays(d2, 1);
      }
    }
    offMap[r.id] = vac;
  });

  // Equity-aligned availability: only subtract official vacation + off-rotation (not informal vacation).
  // Used for sort denominators so informal vacation days don't cause under-assignment.
  const vaEquityOffMap: Record<string, Set<string>> = {};
  pool.forEach((r) => {
    const s = new Set(
      requests.filter((req) => req.resident_id === r.id && req.type === 'vacation_official').map((req) => req.date),
    );
    const vaSegs = r.rotations?.filter((seg) => seg.hospital === 'VA') ?? [];
    if (vaSegs.length > 0) {
      let d2 = new Date(bStart);
      while (d2 <= bEnd) {
        const dstr = dk(d2);
        if (!vaSegs.some((seg) => dstr >= seg.start_date && dstr <= seg.end_date)) s.add(dstr);
        d2 = addDays(d2, 1);
      }
    }
    vaEquityOffMap[r.id] = s;
  });

  // Eligibility check: uses full offMap (includes informal vacation — can't assign on those days)
  function availableDaysInRange(r: Resident, wS: Date, wE: Date): number {
    let cnt = 0, d = new Date(wS);
    while (d <= wE) { if (!offMap[r.id].has(dk(d))) cnt++; d = addDays(d, 1); }
    return cnt;
  }

  // Equity denominator: uses equityOffMap (official vacation + off-rotation only)
  function equityAvailableDaysInRange(r: Resident, wS: Date, wE: Date): number {
    let cnt = 0, d = new Date(wS);
    while (d <= wE) { if (!vaEquityOffMap[r.id].has(dk(d))) cnt++; d = addDays(d, 1); }
    return cnt;
  }

  // Build weeks: find the Monday on or before bStart, then step by 7
  let weekMon = new Date(bStart);
  while (weekMon.getDay() !== 1) weekMon = addDays(weekMon, -1);

  const vaWeeks: VAWeek[] = [];
  const counts:       Record<string, number> = {};
  const days:         Record<string, number> = {};
  const hours:        Record<string, number> = {};
  const lastWeekDate: Record<string, string>  = {}; // last week start date per resident
  pool.forEach((r) => { counts[r.id] = 0; days[r.id] = 0; hours[r.id] = 0; lastWeekDate[r.id] = '1900-01-01'; });

  let lastId: string | null = null;

  while (weekMon <= bEnd) {
    const wSDate = weekMon < bStart ? new Date(bStart) : new Date(weekMon);
    const wEDate = (() => { const e = addDays(weekMon, 6); return e > bEnd ? new Date(bEnd) : e; })();

    if (wSDate > bEnd) break;

    // Pick: sort by local proportion (days worked / days available so far from bStart to now)
    // Tiebreak by longest gap since last week assigned, then lastId anti-repeat
    const sorted = [...pool].sort((a, b) => {
      const aDaysAvail = wSDate > bStart ? equityAvailableDaysInRange(a, bStart, addDays(wSDate, -1)) : 0;
      const bDaysAvail = wSDate > bStart ? equityAvailableDaysInRange(b, bStart, addDays(wSDate, -1)) : 0;
      const aProp = aDaysAvail > 0 ? days[a.id] / aDaysAvail : 0;
      const bProp = bDaysAvail > 0 ? days[b.id] / bDaysAvail : 0;
      if (Math.abs(aProp - bProp) > 1e-9) return aProp - bProp;
      // Tiebreak: prefer whoever went longest without a week (earlier lastWeekDate = higher priority)
      const cmp = lastWeekDate[a.id].localeCompare(lastWeekDate[b.id]);
      if (cmp !== 0) return cmp;
      if (a.id !== lastId && b.id === lastId) return -1;
      if (b.id !== lastId && a.id === lastId) return 1;
      return 0;
    });

    // Find a candidate who has at least 1 available day this week
    let pick = sorted.find((r) => availableDaysInRange(r, wSDate, wEDate) > 0);
    if (!pick) pick = sorted[0]; // everyone on vacation, assign anyway

    vaWeeks.push({ wS: dk(wSDate), wE: dk(wEDate), res: pick, override: false });
    counts[pick.id]++;
    lastWeekDate[pick.id] = dk(wSDate);

    // Tally days and hours
    let d2 = new Date(wSDate);
    while (d2 <= wEDate) {
      days[pick.id]++;
      const dow = d2.getDay();
      const isWknd = dow === 0 || dow === 6;
      hours[pick.id] += (isWknd || HOLIDAYS.has(dk(d2))) ? 24 : 12;
      d2 = addDays(d2, 1);
    }

    lastId = pick.id;
    weekMon = addDays(weekMon, 7);
  }

  return {
    type: 'va',
    bStart: bStartStr,
    bEnd: bEndStr,
    blockName,
    weeks: vaWeeks,
    dayOverrides: {},
    counts,
    days,
    hours,
    published: false,
  };
}
