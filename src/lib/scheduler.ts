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
    .filter((r) => r.pgy <= 3 && r.status === 'active')
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
        // Legacy fallback: use rotation_start/rotation_end fields
        const rotStart = r.rotation_start ? parseDate(r.rotation_start) : bStart;
        const rotEnd   = r.rotation_end   ? parseDate(r.rotation_end)   : bEnd;
        onRotation = dd >= rotStart && dd <= rotEnd;
      }
      // Safety net: always block dates where the resident is on CMC/VA rotation,
      // even if the legacy fallback or a mis-entered CUH/PMH segment says otherwise.
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
    let wknd = 0, wkday = 0, traumaHrs = 0;
    // Use full block range; equityOffMap already excludes off-rotation dates
    let dd = new Date(bStart);
    while (dd <= bEnd) {
      const key = dk(dd);
      const dow = dd.getDay();
      const isWknd = dow === 0 || dow === 6 || HOLIDAYS.has(key);
      if (!equityOffMap[r.id].has(key)) {
        if (isWknd) wknd++; else wkday++;
        if (TRAUMA_WEEKS.has(key)) traumaHrs += isWknd ? 24 : 12;
      }
      dd = addDays(dd, 1);
    }
    rotWkndDays[r.id] = Math.max(1, wknd);
    rotWkdayDays[r.id] = Math.max(1, wkday);
    rotAvailDays[r.id] = Math.max(1, wknd + wkday);
    rotPotentialHours[r.id] = Math.max(1, wknd * 24 + wkday * 12);
    rotPotentialTraumaHours[r.id] = Math.max(1, traumaHrs);
  });

  // Pick junior: enforce rest gap (2 days preferred, 1 day minimum), balance weekend/weekday separately
  // Precompute each resident's effective rotation window for fast eligibility checks.
  // Use the span of all CUH/PMH segments so residents with multi-segment rotations (e.g. CUH→PMH)
  // remain eligible for the full period. Fall back to legacy rotation_start/end only when no segments.
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
      const rS = r.rotation_start ? parseDate(r.rotation_start) : bStart;
      const rE = r.rotation_end   ? parseDate(r.rotation_end)   : bEnd;
      rotEffStart[r.id] = rS < bStart ? bStart : rS;
      rotEffEnd[r.id]   = rE > bEnd   ? bEnd   : rE;
    }
  });

  // Second pass: compute available weekend days + potential weekend-call hours now that
  // rotEffStart/rotEffEnd are set. Days counts calendar weekend + holiday (for display/compat);
  // potential hours uses the weekend-call definition (Fri included) and real shift length.
  jrs.forEach((r) => {
    let wkndAvail = 0;
    let wkndPotHrs = 0;
    let dd = new Date(bStart);
    while (dd <= bEnd) {
      const key = dk(dd);
      const dow = dd.getDay();
      const avail = !offMap[r.id].has(key) && dd >= rotEffStart[r.id] && dd <= rotEffEnd[r.id];
      if (avail) {
        if (dow === 0 || dow === 6 || HOLIDAYS.has(key)) wkndAvail++;
        if (isWeekendCall(key)) wkndPotHrs += shiftHours(key);
      }
      dd = addDays(dd, 1);
    }
    rotWkndAvailDays[r.id] = Math.max(1, wkndAvail);
    rotWkndPotentialHours[r.id] = Math.max(1, wkndPotHrs);
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

  // Trauma rebalancer — carry-in aware so it equalizes cumulative (cross-block) trauma equity,
  // matching the greedy picker. Without the carry-in term it would re-flatten each block to
  // within-block fairness and undo the year-long catch-up. With no carry-in it reduces to jrTH alone.
  const carryTH = (r: Resident) => (carryIn[r.person_id ?? '']?.traumaHours ?? 0) + jrTH[r.id];
  for (let iter = 0; iter < 60; iter++) {
    const sorted = [...jrs].sort((a, b) =>
      (carryTH(a) / rotPotentialTraumaHours[a.id]) - (carryTH(b) / rotPotentialTraumaHours[b.id]),
    );
    const under = sorted[0];
    const over  = sorted[sorted.length - 1];
    if ((carryTH(over) / rotPotentialTraumaHours[over.id]) - (carryTH(under) / rotPotentialTraumaHours[under.id]) <= 0.05) break;

    const candidates = juniorDays.filter((jd) => jd.res.id === over.id && jd.isTrauma && !jd.override);
    let moved = false;
    for (const jd of candidates) {
      if (jd.type === 'fri-pair') {
        const sunKey = dk(addDays(parseDate(jd.dateKey), 2));
        const sunJd  = juniorDays.find((jj) => jj.dateKey === sunKey && jj.res.id === over.id);
        if (!sunJd || !canReceive(jd.dateKey, under) || !canReceive(sunKey, under)) continue;
        reassignJD(jd, over, under);
        reassignJD(sunJd, over, under);
      } else if (jd.type === 'sun-pair') {
        continue; // handled with its Friday pair above
      } else {
        if (!canReceive(jd.dateKey, under)) continue;
        reassignJD(jd, over, under);
      }
      moved = true;
      break;
    }
    if (!moved) break;
  }

  // Weekend rebalancer — carry-in aware (see trauma rebalancer note). Equalizes cumulative
  // weekend equity across blocks instead of re-flattening each block in isolation.
  const carryWk = (r: Resident) => (carryIn[r.person_id ?? '']?.wkndHours ?? 0) + jrHwknd[r.id];
  for (let iter = 0; iter < 60; iter++) {
    const sorted = [...jrs].sort((a, b) =>
      (carryWk(a) / rotWkndPotentialHours[a.id]) - (carryWk(b) / rotWkndPotentialHours[b.id]),
    );
    const under = sorted[0];
    const over  = sorted[sorted.length - 1];
    if ((carryWk(over) / rotWkndPotentialHours[over.id]) - (carryWk(under) / rotWkndPotentialHours[under.id]) <= 0.05) break;

    // Candidates are weekend-call shifts (Fri/Sat/Sun/holiday) the over-resident holds.
    const candidates = juniorDays.filter((jd) => jd.res.id === over.id && isWeekendCall(jd.dateKey) && !jd.override);
    let moved = false;
    for (const jd of candidates) {
      if (jd.type === 'fri-pair') {
        const sunKey = dk(addDays(parseDate(jd.dateKey), 2));
        const sunJd  = juniorDays.find((jj) => jj.dateKey === sunKey && jj.res.id === over.id);
        if (!sunJd || !canReceive(jd.dateKey, under) || !canReceive(sunKey, under)) continue;
        reassignJD(jd, over, under);
        reassignJD(sunJd, over, under);
      } else if (jd.type === 'sun-pair') {
        continue; // handled with its Friday pair above
      } else {
        if (!canReceive(jd.dateKey, under)) continue;
        reassignJD(jd, over, under);
      }
      moved = true;
      break;
    }
    if (!moved) break;
  }

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
  const wdCount:        Record<string, number> = {}; // weekday shifts only
  const pwCount:        Record<string, number> = {}; // power weekends only
  const lastWkdayDate:  Record<string, string>  = {}; // last weekday shift date per resident
  pool.forEach((r) => { counts[r.id] = 0; hours[r.id] = 0; traumaHours[r.id] = 0; wdCount[r.id] = 0; pwCount[r.id] = 0; lastWkdayDate[r.id] = '1900-01-01'; });

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

  // Available trauma days per resident — uses equityOffMap
  const traumaAvail: Record<string, number> = {};
  pool.forEach((r) => {
    let cnt = 0;
    let td = new Date(bStart);
    while (td <= bEnd) {
      if (TRAUMA_WEEKS.has(dk(td)) && !cmcEquityOffMap[r.id].has(dk(td))) cnt++;
      td = addDays(td, 1);
    }
    traumaAvail[r.id] = Math.max(cnt, 1);
  });

  // Weekday pick: sort by wdCount/wdAvail; tiebreak by longest gap since last weekday shift
  function pickWeekday(candidates: Resident[], isTraumaDay: boolean): Resident {
    return [...candidates].sort((a, b) => {
      if (isTraumaDay) {
        const aProp = traumaHours[a.id] / traumaAvail[a.id];
        const bProp = traumaHours[b.id] / traumaAvail[b.id];
        if (Math.abs(aProp - bProp) > 1e-9) return aProp - bProp;
      }
      const ratioA = wdCount[a.id] / wdAvail[a.id];
      const ratioB = wdCount[b.id] / wdAvail[b.id];
      if (Math.abs(ratioA - ratioB) > 1e-9) return ratioA - ratioB;
      // Tiebreak: prefer whoever has gone longest since their last weekday shift
      return lastWkdayDate[a.id].localeCompare(lastWkdayDate[b.id]);
    })[0];
  }

  // Power weekend pick: sort by pwCount/pwAvail (trauma proportion primary on trauma weekends)
  function pickPowerWeekend(candidates: Resident[], isTraumaWeekend: boolean): Resident {
    return [...candidates].sort((a, b) => {
      if (isTraumaWeekend) {
        const aProp = traumaHours[a.id] / traumaAvail[a.id];
        const bProp = traumaHours[b.id] / traumaAvail[b.id];
        if (Math.abs(aProp - bProp) > 1e-9) return aProp - bProp;
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

    let candidates = pool.filter(
      (r) => r.id !== lastPwId && !(offMap[r.id].has(friKey) && offMap[r.id].has(satKey) && offMap[r.id].has(sunKey)),
    );
    if (!candidates.length) candidates = pool.filter((r) => r.id !== lastPwId);
    if (!candidates.length) candidates = [...pool];

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
    counts,
    days,
    hours,
    published: false,
  };
}
