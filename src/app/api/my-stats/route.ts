import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { HOLIDAYS, isWeekendCall } from '@/lib/scheduler';

// ── Types mirroring the schedule data stored in DB ───────────────────────────
interface JrDay {
  dateKey: string;
  res: { id: string };
  cuhRounder?: { id: string } | null;
  shiftHrs: number;
  isTrauma?: boolean;
}
interface SrWeek {
  wS: string; wE: string;
  res: { id: string };
}
interface VAWeek {
  wS: string; wE: string;
  res: { id: string };
}
interface CMCDay {
  dateKey: string;
  res: { id: string };
  shiftHrs: number;
  isPowerWeekend?: boolean;
}

function parseDate(s: string) {
  return new Date(s + 'T12:00:00');
}
function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function dk(d: Date) {
  return d.toISOString().slice(0, 10);
}

// ── Per-period stat shapes ────────────────────────────────────────────────────
export interface PeriodJrStats {
  totalHrs: number; wkdayCount: number; wkdayHrs: number;
  wkndCount: number; wkndHrs: number; holCount: number; holHrs: number;
  cuhRdrCount: number; traumaCount: number; traumaHrs: number;
}
export interface PeriodSrStats {
  totalCount: number; wkdayCount: number; wkndCount: number; holCount: number;
}
export interface PeriodCMCStats {
  totalHrs: number; wkdayCount: number; wkdayHrs: number;
  wkndCount: number; wkndHrs: number; holCount: number; holHrs: number;
  pwCount: number;
}
export interface PeriodVAStats {
  weekCount: number; totalHrs: number;
  wkdayCount: number; wkdayHrs: number;
  wkndCount: number; wkndHrs: number;
  holCount: number; holHrs: number;
}

export interface SchedulePeriod {
  scheduleId: string; name: string; startDate: string; endDate: string;
  isJunior?: boolean;
  cuhPmhJr?: PeriodJrStats;
  cuhPmhSr?: PeriodSrStats;
  cmc?: PeriodCMCStats;
  va?: PeriodVAStats;
}

export interface MyStatsResponse {
  residentId: string;
  academicYearStart: string;
  isJunior: boolean;
  periods: SchedulePeriod[];
  ytd: {
    cuhPmhJr?: PeriodJrStats;
    cuhPmhSr?: PeriodSrStats;
    cmc?: PeriodCMCStats;
    va?: PeriodVAStats;
  };
}

function addJr(a: PeriodJrStats, b: PeriodJrStats): PeriodJrStats {
  return {
    totalHrs: a.totalHrs + b.totalHrs,
    wkdayCount: a.wkdayCount + b.wkdayCount, wkdayHrs: a.wkdayHrs + b.wkdayHrs,
    wkndCount: a.wkndCount + b.wkndCount, wkndHrs: a.wkndHrs + b.wkndHrs,
    holCount: a.holCount + b.holCount, holHrs: a.holHrs + b.holHrs,
    cuhRdrCount: a.cuhRdrCount + b.cuhRdrCount,
    traumaCount: a.traumaCount + b.traumaCount, traumaHrs: a.traumaHrs + b.traumaHrs,
  };
}
function addSr(a: PeriodSrStats, b: PeriodSrStats): PeriodSrStats {
  return {
    totalCount: a.totalCount + b.totalCount, wkdayCount: a.wkdayCount + b.wkdayCount,
    wkndCount: a.wkndCount + b.wkndCount, holCount: a.holCount + b.holCount,
  };
}
function addCMC(a: PeriodCMCStats, b: PeriodCMCStats): PeriodCMCStats {
  return {
    totalHrs: a.totalHrs + b.totalHrs,
    wkdayCount: a.wkdayCount + b.wkdayCount, wkdayHrs: a.wkdayHrs + b.wkdayHrs,
    wkndCount: a.wkndCount + b.wkndCount, wkndHrs: a.wkndHrs + b.wkndHrs,
    holCount: a.holCount + b.holCount, holHrs: a.holHrs + b.holHrs,
    pwCount: a.pwCount + b.pwCount,
  };
}
function addVA(a: PeriodVAStats, b: PeriodVAStats): PeriodVAStats {
  return {
    weekCount: a.weekCount + b.weekCount, totalHrs: a.totalHrs + b.totalHrs,
    wkdayCount: a.wkdayCount + b.wkdayCount, wkdayHrs: a.wkdayHrs + b.wkdayHrs,
    wkndCount: a.wkndCount + b.wkndCount, wkndHrs: a.wkndHrs + b.wkndHrs,
    holCount: a.holCount + b.holCount, holHrs: a.holHrs + b.holHrs,
  };
}

const emptyJr = (): PeriodJrStats => ({
  totalHrs: 0, wkdayCount: 0, wkdayHrs: 0, wkndCount: 0, wkndHrs: 0,
  holCount: 0, holHrs: 0, cuhRdrCount: 0, traumaCount: 0, traumaHrs: 0,
});
const emptySr = (): PeriodSrStats => ({ totalCount: 0, wkdayCount: 0, wkndCount: 0, holCount: 0 });
const emptyCMC = (): PeriodCMCStats => ({
  totalHrs: 0, wkdayCount: 0, wkdayHrs: 0, wkndCount: 0, wkndHrs: 0,
  holCount: 0, holHrs: 0, pwCount: 0,
});
const emptyVA = (): PeriodVAStats => ({
  weekCount: 0, totalHrs: 0, wkdayCount: 0, wkdayHrs: 0, wkndCount: 0, wkndHrs: 0, holCount: 0, holHrs: 0,
});

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.role || !session.residentId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const residentId = session.residentId;

  // Resolve person_id and pgy
  const { rows: resRows } = await sql`
    SELECT r.id, r.pgy, r.person_id, COALESCE(p.pgy, r.pgy) AS effective_pgy
    FROM residents r LEFT JOIN persons p ON r.person_id = p.id
    WHERE r.id = ${residentId}
  `;
  if (!resRows[0]) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const personId: string | null = resRows[0].person_id ?? null;
  const effectivePgy: number = resRows[0].effective_pgy;
  const isJunior = effectivePgy <= 3;

  // All resident IDs for this person (handles multi-rotation records)
  const { rows: allResRows } = personId
    ? await sql`SELECT id FROM residents WHERE person_id = ${personId}`
    : await sql`SELECT id FROM residents WHERE id = ${residentId}`;
  const myResIds = new Set(allResRows.map((r) => r.id as string));

  // Academic year boundaries (July 1 → June 30)
  const params = new URL(req.url).searchParams;
  const acYearStartParam = params.get('acYearStart');
  const baseDate = acYearStartParam ?? new Date().toISOString().slice(0, 10);
  const baseD = new Date(baseDate + 'T12:00:00');
  const acYearNum = (baseD.getMonth() + 1) >= 7 ? baseD.getFullYear() : baseD.getFullYear() - 1;
  const acYearStart = `${acYearNum}-07-01`;
  const acYearEnd   = `${acYearNum + 1}-06-30`;

  // All published schedules this academic year. Combined schedules are excluded —
  // they repeat the assignments of the schedules they were built from, so counting
  // them here would double every period and the YTD totals.
  const { rows: schedRows } = await sql`
    SELECT id, name, start_date, end_date, schedule_type, data
    FROM schedules
    WHERE published = TRUE
      AND (data::jsonb ->> 'mergedFrom') IS NULL
      AND start_date >= ${acYearStart}
      AND end_date   <= ${acYearEnd}
    ORDER BY start_date ASC
  `;

  const periods: SchedulePeriod[] = [];
  let ytdJr: PeriodJrStats | undefined;
  let ytdSr: PeriodSrStats | undefined;
  let ytdCMC: PeriodCMCStats | undefined;
  let ytdVA: PeriodVAStats | undefined;

  for (const row of schedRows) {
    const stype = (row.schedule_type ?? 'cuh_pmh') as string;
    let data: Record<string, unknown>;
    try { data = JSON.parse(row.data); } catch { continue; }

    const period: SchedulePeriod = {
      scheduleId: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
    };

    if (stype === 'cuh_pmh') {
      const juniorDays = (data.juniorDays ?? []) as JrDay[];
      const seniorWeeks = (data.seniorWeeks ?? []) as SrWeek[];

      // Check if this resident has any assignments
      const hasJr = juniorDays.some((d) => myResIds.has(d.res.id) || (d.cuhRounder && myResIds.has(d.cuhRounder.id)));
      const hasSr = seniorWeeks.some((w) => myResIds.has(w.res.id));

      if (hasJr) {
        const myDays = juniorDays.filter((d) => myResIds.has(d.res.id));
        const myCuhRdr = juniorDays.filter((d) => d.cuhRounder && myResIds.has(d.cuhRounder.id) && !myResIds.has(d.res.id));
        const stats = emptyJr();
        for (const d of myDays) {
          stats.totalHrs += d.shiftHrs;
          if (HOLIDAYS.has(d.dateKey)) { stats.holCount++; stats.holHrs += d.shiftHrs; }
          else if (isWeekendCall(d.dateKey)) { stats.wkndCount++; stats.wkndHrs += d.shiftHrs; }
          else { stats.wkdayCount++; stats.wkdayHrs += d.shiftHrs; }
          if (d.isTrauma) { stats.traumaCount++; stats.traumaHrs += d.shiftHrs; }
        }
        stats.cuhRdrCount = myCuhRdr.length;
        period.cuhPmhJr = stats;
        ytdJr = ytdJr ? addJr(ytdJr, stats) : { ...stats };
      }

      if (hasSr) {
        const myWeeks = seniorWeeks.filter((w) => myResIds.has(w.res.id));
        const stats = emptySr();
        for (const w of myWeeks) {
          let d = parseDate(w.wS); const end = parseDate(w.wE);
          while (d <= end) {
            const key = dk(d);
            stats.totalCount++;
            if (HOLIDAYS.has(key)) stats.holCount++;
            else if (d.getDay() === 0 || d.getDay() === 6) stats.wkndCount++;
            else stats.wkdayCount++;
            d = addDays(d, 1);
          }
        }
        period.cuhPmhSr = stats;
        ytdSr = ytdSr ? addSr(ytdSr, stats) : { ...stats };
      }
    }

    if (stype === 'cmc') {
      const days = (data.days ?? []) as CMCDay[];
      const myDays = days.filter((d) => myResIds.has(d.res.id));
      if (myDays.length > 0) {
        const stats = emptyCMC();
        for (const d of myDays) {
          stats.totalHrs += d.shiftHrs;
          if (HOLIDAYS.has(d.dateKey)) { stats.holCount++; stats.holHrs += d.shiftHrs; }
          else if (isWeekendCall(d.dateKey)) { stats.wkndCount++; stats.wkndHrs += d.shiftHrs; }
          else { stats.wkdayCount++; stats.wkdayHrs += d.shiftHrs; }
          if (d.isPowerWeekend) stats.pwCount++;
        }
        period.cmc = stats;
        ytdCMC = ytdCMC ? addCMC(ytdCMC, stats) : { ...stats };
      }
    }

    if (stype === 'va') {
      const weeks = (data.weeks ?? []) as VAWeek[];
      const hours = (data.hours ?? {}) as Record<string, number>;
      const myWeeks = weeks.filter((w) => myResIds.has(w.res.id));
      if (myWeeks.length > 0) {
        const stats = emptyVA();
        for (const w of myWeeks) {
          stats.weekCount++;
          let d = parseDate(w.wS); const end = parseDate(w.wE);
          while (d <= end) {
            const key = dk(d);
            const hrs = (d.getDay() === 0 || d.getDay() === 6 || HOLIDAYS.has(key)) ? 24 : 12;
            stats.totalHrs += hrs;
            if (HOLIDAYS.has(key)) { stats.holCount++; stats.holHrs += hrs; }
            else if (d.getDay() === 0 || d.getDay() === 6) { stats.wkndCount++; stats.wkndHrs += hrs; }
            else { stats.wkdayCount++; stats.wkdayHrs += hrs; }
            d = addDays(d, 1);
          }
        }
        // Use stored hours map if available (it's authoritative)
        const myVaResId = myWeeks[0].res.id;
        if (hours[myVaResId] !== undefined) stats.totalHrs = hours[myVaResId];
        period.va = stats;
        ytdVA = ytdVA ? addVA(ytdVA, stats) : { ...stats };
      }
    }

    const hasSomething = period.cuhPmhJr || period.cuhPmhSr || period.cmc || period.va;
    if (hasSomething) periods.push(period);
  }

  const response: MyStatsResponse = {
    residentId,
    academicYearStart: acYearStart,
    isJunior,
    periods,
    ytd: {
      cuhPmhJr: ytdJr,
      cuhPmhSr: ytdSr,
      cmc: ytdCMC,
      va: ytdVA,
    },
  };

  return NextResponse.json(response);
}
