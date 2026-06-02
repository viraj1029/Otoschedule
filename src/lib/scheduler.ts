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

  // Build off-map: residentId → Set<dateKey>
  const offMap: Record<string, Set<string>> = {};
  residents.forEach((r) => {
    const vac = new Set(
      requests
        .filter((req) => req.resident_id === r.id && req.type === 'vacation')
        .map((req) => req.date),
    );
    const wk = new Set(
      requests
        .filter((req) => req.resident_id === r.id && req.type === 'weekend')
        .map((req) => req.date),
    );
    const hol = new Set(
      requests
        .filter((req) => req.resident_id === r.id && req.type === 'holiday')
        .map((req) => req.date),
    );
    offMap[r.id] = new Set([...vac, ...wk, ...hol]);
  });

  // ── Research backup (senior modes only) ─────────────────────────────────────
  const resBkpWeeks: ResBkpWeek[] = [];
  const resBkpDays: ResBkpDay[] = [];

  if (needSr && resR.length) {
    const rr = resR[0];
    let c = new Date(bStart);
    while (c.getDay() !== 1) c = addDays(c, 1);
    let assigned = false;
    while (c <= bEnd && !assigned) {
      const wS = new Date(c);
      const wE = addDays(c, 6);
      const wEC = wE > bEnd ? new Date(bEnd) : new Date(wE);
      let hasOff = false;
      let d2 = new Date(wS);
      while (d2 <= wEC) {
        if (offMap[rr.id].has(dk(d2))) { hasOff = true; break; }
        d2 = addDays(d2, 1);
      }
      if (!hasOff) {
        resBkpWeeks.push({ wS: dk(wS), wE: dk(wEC), res: rr, isBackup: true });
        assigned = true;
      }
      c = addDays(wE, 1);
    }
    if (!assigned) {
      let fc = new Date(bStart);
      while (fc.getDay() !== 1) fc = addDays(fc, 1);
      const wE = addDays(fc, 6);
      resBkpWeeks.push({
        wS: dk(fc),
        wE: dk(wE > bEnd ? new Date(bEnd) : wE),
        res: rr,
        isBackup: true,
      });
    }

    // Backup weekend day
    let d = new Date(bStart);
    let bkpWk = false;
    while (d <= bEnd && !bkpWk) {
      const key = dk(d);
      const dow = d.getDay();
      if ((dow === 6 || dow === 0) && !offMap[rr.id].has(key)) {
        resBkpDays.push({ dateKey: key, res: rr, isBackup: true });
        bkpWk = true;
      }
      d = addDays(d, 1);
    }
  }

  const resBkpWeekDatesSet = new Set<string>();
  resBkpWeeks.forEach((w) => {
    let d = parseDate(w.wS);
    const end = parseDate(w.wE);
    while (d <= end) { resBkpWeekDatesSet.add(dk(d)); d = addDays(d, 1); }
  });
  const resBkpDayKeysSet = new Set(resBkpDays.map((d) => d.dateKey));

  // ── Senior weeks ─────────────────────────────────────────────────────────────
  const seniorWeeks: SeniorWeek[] = [];
  const srC: Record<string, number> = {};
  srs.forEach((r) => (srC[r.id] = 0));
  if (needSr) {
  let srI = 0;
  let lastSrId: string | null = null;

  function assignWeek(wS: Date, wEC: Date) {
    function hasConflict(r: Resident): boolean {
      let d2 = new Date(wS);
      while (d2 <= wEC) {
        if (offMap[r.id].has(dk(d2))) return true;
        d2 = addDays(d2, 1);
      }
      return false;
    }
    const cands = [...srs].sort((a, b) => {
      const aLast = a.id === lastSrId ? 1 : 0;
      const bLast = b.id === lastSrId ? 1 : 0;
      if (aLast !== bLast) return aLast - bLast;
      return srC[a.id] - srC[b.id];
    });
    let assigned: Resident | null = null;
    for (const c of cands) {
      if (c.id !== lastSrId && !hasConflict(c)) { assigned = c; break; }
    }
    if (!assigned) {
      for (const c of cands) {
        if (!hasConflict(c)) { assigned = c; break; }
      }
    }
    if (!assigned) {
      assigned = cands.find((c) => c.id !== lastSrId) ?? srs[srI % srs.length];
    }
    srC[assigned.id]++;
    srI++;
    lastSrId = assigned.id;
    seniorWeeks.push({ wS: dk(wS), wE: dk(wEC), res: assigned, isBackup: false, override: false });
  }

  // Cover any partial days before the first Monday
  let cur = new Date(bStart);
  if (cur.getDay() !== 1) {
    const partialEnd = new Date(cur);
    while (partialEnd.getDay() !== 0) partialEnd.setDate(partialEnd.getDate() + 1);
    const pEC = partialEnd > bEnd ? new Date(bEnd) : new Date(partialEnd);
    assignWeek(cur, pEC);
    cur = addDays(partialEnd, 1);
  }

  // Full Monday-to-Sunday weeks
  while (cur <= bEnd) {
    const wS = new Date(cur);
    const wE = addDays(cur, 6);
    const wEC = wE > bEnd ? new Date(bEnd) : new Date(wE);
    assignWeek(wS, wEC);
    cur = addDays(wE, 1);
  }

  resBkpWeeks.forEach((w) => seniorWeeks.push({ ...w, override: false }));
  seniorWeeks.sort((a, b) => a.wS.localeCompare(b.wS));
  } // end needSr

  // ── Junior days ──────────────────────────────────────────────────────────────
  const juniorDays: JuniorDay[] = [];
  const jrC: Record<string, number> = {};
  const jrH: Record<string, number> = {};
  if (needJr) {
  jrs.forEach((r) => { jrC[r.id] = 0; jrH[r.id] = 0; });
  const processed = new Set<string>();

  function pickJr(key: string, ex: string | null = null): Resident {
    const candidates = jrs
      .filter((r) => r.id !== ex && !offMap[r.id].has(key))
      .sort((a, b) => jrH[a.id] - jrH[b.id] || jrC[a.id] - jrC[b.id]);
    return candidates[0] ?? jrs.sort((a, b) => jrH[a.id] - jrH[b.id])[0];
  }

  function addJD(
    key: string,
    res: Resident,
    type: JuniorDayType,
    paired = false,
    cuhR: Resident | null = null,
  ) {
    const hrs = shiftHours(key);
    jrC[res.id]++;
    jrH[res.id] += hrs;
    const d = parseDate(key);
    const isWk = d.getDay() === 0 || d.getDay() === 6;
    juniorDays.push({
      dateKey: key,
      res,
      shiftHrs: hrs,
      type,
      paired,
      cuhRounder: cuhR,
      isWeekend: isWk,
      override: false,
    });
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
      // Friday — pair with Sunday
      const sunDate = addDays(d, 2);
      const sunKey = dk(sunDate);
      const inBlock = sunDate <= bEnd;
      const friRes = pickJr(key);
      addJD(key, friRes, 'fri-pair', true);
      if (inBlock && !processed.has(sunKey)) {
        const hrs = shiftHours(sunKey);
        jrC[friRes.id]++;
        jrH[friRes.id] += hrs;
        const cuhR =
          friRes.hospital === 'PMH'
            ? jrs.find(
                (r) =>
                  r.hospital === 'CUH' &&
                  r.id !== friRes.id &&
                  !offMap[r.id].has(sunKey),
              ) ?? null
            : null;
        juniorDays.push({
          dateKey: sunKey,
          res: friRes,
          shiftHrs: hrs,
          type: 'sun-pair',
          paired: true,
          cuhRounder: cuhR,
          isWeekend: true,
          override: false,
        });
        processed.add(sunKey);
      }
    } else if (dow === 6) {
      // Saturday
      const satRes = pickJr(key);
      const cuhR =
        satRes.hospital === 'PMH'
          ? jrs.find(
              (r) =>
                r.hospital === 'CUH' &&
                r.id !== satRes.id &&
                !offMap[r.id].has(key),
            ) ?? null
          : null;
      addJD(key, satRes, 'saturday', false, cuhR);
    } else {
      addJD(key, pickJr(key), dow === 0 ? 'sunday' : 'weekday');
    }
  }

  // Fill in missing CUH rounders for weekend/holiday PMH residents
  juniorDays.forEach((jd) => {
    if (!jd.isWeekend && !HOLIDAYS.has(jd.dateKey)) return;
    if (jd.res.hospital === 'PMH' && !jd.cuhRounder) {
      jd.cuhRounder =
        jrs.find(
          (r) =>
            r.hospital === 'CUH' &&
            r.id !== jd.res.id &&
            !offMap[r.id].has(jd.dateKey),
        ) ?? null;
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
  };
}
