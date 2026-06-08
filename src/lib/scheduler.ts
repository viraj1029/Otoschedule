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

// ─── Trauma weeks ─────────────────────────────────────────────────────────────

function buildTraumaSet(): Set<string> {
  const ranges = [
    ['2026-07-13', '2026-07-19'],
    ['2026-08-03', '2026-08-09'],
    ['2026-08-24', '2026-08-30'],
    ['2026-09-14', '2026-09-20'],
  ];
  const s = new Set<string>();
  for (const [start, end] of ranges) {
    let d = parseDate(start);
    const e = parseDate(end);
    while (d <= e) { s.add(dk(d)); d = addDays(d, 1); }
  }
  return s;
}
export const TRAUMA_WEEKS = buildTraumaSet();

// ─── Main generator ───────────────────────────────────────────────────────────

export type ScheduleMode = 'merged' | 'senior' | 'junior';

export function generateSchedule(
  residents: Resident[],
  requests: Request[],
  blockName: string,
  bStartStr: string,
  bEndStr: string,
  blockPublished: boolean,
  mode: ScheduleMode = 'merged',
  carryIn: Record<string, { hours: number; availDays: number }> = {},
): ScheduleData {
  const srs = residents
    .filter((r) => r.pgy >= 4 && r.status === 'active')
    .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
  const resR = residents.filter((r) => r.pgy >= 4 && r.status === 'research');
  const jrs = residents
    .filter((r) => r.pgy <= 3 && r.status === 'active')
    .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

  const needSr = mode === 'merged' || mode === 'senior';
  const needJr = mode === 'merged' || mode === 'junior';

  if (needSr && !srs.length) throw new Error('Need at least 1 active senior (PGY 4+) to generate a senior schedule');
  if (needJr && !jrs.length) throw new Error('Need at least 1 active junior (PGY 1–3) to generate a junior schedule');

  const bStart = parseDate(bStartStr);
  const bEnd = parseDate(bEndStr);

  // Build off-map: residentId → Set<dateKey> (requests + off-rotation dates)
  const offMap: Record<string, Set<string>> = {};
  const rotDays: Record<string, number> = {}; // effective rotation days within block
  residents.forEach((r) => {
    const vac = new Set(requests.filter((req) => req.resident_id === r.id && (req.type === 'vacation' || req.type === 'vacation_official')).map((req) => req.date));
    const wk  = new Set(requests.filter((req) => req.resident_id === r.id && req.type === 'weekend').map((req) => req.date));
    const hol = new Set(requests.filter((req) => req.resident_id === r.id && req.type === 'holiday').map((req) => req.date));
    offMap[r.id] = new Set([...vac, ...wk, ...hol]);

    // Block dates outside the resident's rotation window
    const rotStart = r.rotation_start ? parseDate(r.rotation_start) : bStart;
    const rotEnd   = r.rotation_end   ? parseDate(r.rotation_end)   : bEnd;
    const effStart = rotStart < bStart ? bStart : rotStart;
    const effEnd   = rotEnd   > bEnd   ? bEnd   : rotEnd;
    let cnt = 0;
    let dd = new Date(bStart);
    while (dd <= bEnd) {
      if (dd < effStart || dd > effEnd) offMap[r.id].add(dk(dd));
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

  const jrTH: Record<string, number> = {};    // trauma hours total
  const jrTHwknd: Record<string, number> = {}; // trauma weekend hours
  const jrTHwkday: Record<string, number> = {}; // trauma weekday hours
  const jrTD: Record<string, number> = {};    // trauma call days

  // Hoisted so jrAvailDays can be included in the return value.
  const rotWkndDays: Record<string, number> = {};
  const rotWkdayDays: Record<string, number> = {};
  const rotAvailDays: Record<string, number> = {};

  if (needJr) {
  jrs.forEach((r) => { jrC[r.id] = 0; jrH[r.id] = 0; jrHwknd[r.id] = 0; jrHwkday[r.id] = 0; jrDwknd[r.id] = 0; jrDwkday[r.id] = 0; jrTH[r.id] = 0; jrTHwknd[r.id] = 0; jrTHwkday[r.id] = 0; jrTD[r.id] = 0; });
  const processed = new Set<string>();

  // Compute available (non-off) rotation day counts for proportional equity sorting.
  // Using available days (not raw rotation window) ensures residents with more vacation
  // don't get assigned at higher density on their working days.
  jrs.forEach((r) => {
    let wknd = 0, wkday = 0;
    const rS = r.rotation_start ? parseDate(r.rotation_start) : bStart;
    const rE = r.rotation_end   ? parseDate(r.rotation_end)   : bEnd;
    const effS = rS < bStart ? bStart : rS;
    const effE = rE > bEnd   ? bEnd   : rE;
    let dd = new Date(effS);
    while (dd <= effE) {
      const key = dk(dd);
      if (!offMap[r.id].has(key)) {
        const dow = dd.getDay();
        if (dow === 0 || dow === 6 || HOLIDAYS.has(key)) wknd++; else wkday++;
      }
      dd = addDays(dd, 1);
    }
    rotWkndDays[r.id] = Math.max(1, wknd);
    rotWkdayDays[r.id] = Math.max(1, wkday);
    rotAvailDays[r.id] = Math.max(1, wknd + wkday);
  });

  // Pick junior: enforce rest gap (2 days preferred, 1 day minimum), balance weekend/weekday separately
  // Precompute each resident's effective rotation window for fast eligibility checks.
  const rotEffStart: Record<string, Date> = {};
  const rotEffEnd: Record<string, Date> = {};
  jrs.forEach((r) => {
    const rS = r.rotation_start ? parseDate(r.rotation_start) : bStart;
    const rE = r.rotation_end   ? parseDate(r.rotation_end)   : bEnd;
    rotEffStart[r.id] = rS < bStart ? bStart : rS;
    rotEffEnd[r.id]   = rE > bEnd   ? bEnd   : rE;
  });

  function pickJr(key: string, ex: string | null = null, isWeekendSlot = false, skipGap = false, isTraumaDay = false): Resident {
    const d = parseDate(key);

    function sortFn(a: Resident, b: Resident) {
      // Primary: cumulative hours-per-available-day across all blocks in the academic year.
      const aC = carryIn[a.person_id ?? ''] ?? { hours: 0, availDays: 0 };
      const bC = carryIn[b.person_id ?? ''] ?? { hours: 0, availDays: 0 };
      const ar = (aC.hours + jrH[a.id]) / (aC.availDays + rotAvailDays[a.id]);
      const br = (bC.hours + jrH[b.id]) / (bC.availDays + rotAvailDays[b.id]);
      if (Math.abs(ar - br) > 0.001) return ar - br;
      // Secondary for weekend slots: prefer fewer weekend hours per available weekend day.
      if (isWeekendSlot) {
        const awr = jrHwknd[a.id] / rotWkndDays[a.id];
        const bwr = jrHwknd[b.id] / rotWkndDays[b.id];
        if (Math.abs(awr - bwr) > 0.001) return awr - bwr;
      }
      if (isTraumaDay) return jrTH[a.id] - jrTH[b.id];
      // Final tiebreaker: date-seeded hash so no single resident dominates all ties.
      let h = 2166136261;
      for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
      const hA = (Math.imul(h ^ a.id.charCodeAt(0), 16777619) >>> 0);
      const hB = (Math.imul(h ^ b.id.charCodeAt(0), 16777619) >>> 0);
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

    // Progressive gap relaxation: prefer ≥3 days, fallback to ≥2, then ≥1.
    // Never relaxes to 0 — back-to-back shifts are handled only in the fallback below.
    const minGaps = skipGap ? [1] : [3, 2, 1];
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
          if (noConsec.length) return noConsec.sort(sortFn)[0];
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
    const withGap = inWindow.filter((r) => daysSince(r) >= 1);
    const pool = withGap.length ? withGap : inWindow.length ? inWindow : jrs;
    return pool.sort(sortFn)[0];
  }

  function addJD(key: string, res: Resident, type: JuniorDayType, paired = false, cuhR: Resident | null = null) {
    const hrs = shiftHours(key);
    const d = parseDate(key);
    const isWk = d.getDay() === 0 || d.getDay() === 6;
    const isWkndSlot = isWk || HOLIDAYS.has(key);
    const isTrauma = TRAUMA_WEEKS.has(key);
    jrC[res.id]++;
    jrH[res.id] += hrs;
    if (isWkndSlot) { jrHwknd[res.id] += hrs; jrDwknd[res.id]++; lastWeekendKey[res.id] = key; }
    else             { jrHwkday[res.id] += hrs; jrDwkday[res.id]++; }
    if (isTrauma) {
      jrTH[res.id] += hrs;
      jrTD[res.id]++;
      if (isWkndSlot) jrTHwknd[res.id] += hrs;
      else jrTHwkday[res.id] += hrs;
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
    published: blockPublished,
    jrTH,
    jrTHwknd,
    jrTHwkday,
    jrTD,
    jrAvailDays: rotAvailDays,
  };
}
