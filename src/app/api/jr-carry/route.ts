import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';

// Fallback hours-per-available-day for schedules saved before the scheduler started
// storing jrPotentialHours. A block is mostly weekdays (12h) with a minority of
// weekend/holiday days (24h), so the true average sits near 15–16 h/day; 18 is the
// midpoint of 12 and 24 and is what the scheduler assumed inline before this. It is
// only reached when jrWkndAvailDays is also missing, which makes it rare.
const LEGACY_AVG_DAY_HOURS = 18;

// Best available reconstruction of a resident's potential call hours for one block.
// Exact when the scheduler stored it; otherwise rebuilt from the weekday/weekend day
// split, which is the same 12h/24h weighting the scheduler uses.
function potentialFor(
  resId: string,
  jrPot: Record<string, number>,
  jrAvailDays: Record<string, number>,
  jrWkndAvailDays: Record<string, number>,
): number {
  const exact = jrPot[resId];
  if (exact !== undefined) return exact;

  const avail = jrAvailDays[resId] ?? 0;
  const wknd  = jrWkndAvailDays[resId];
  if (wknd !== undefined) return wknd * 24 + Math.max(0, avail - wknd) * 12;
  return avail * LEGACY_AVG_DAY_HOURS;
}

function academicYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const m = d.getMonth() + 1; // 1-indexed
  return m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

// Combined schedules (built from other schedules via /api/schedules/merge) are
// skipped here — their sources already contribute, so counting them too would
// double the carry-in hours.
//
// Carry-in for a CUH/PMH junior schedule about to be generated.
// Defined as the cumulative junior hours from PUBLISHED (finalized) CUH/PMH
// schedules earlier in the same academic year — i.e. blocks whose date range
// ends before the new schedule's start (`before`). Blocks are non-overlapping
// consecutive ranges, so "ends before start" == "is a prior block".
//
// This is computed directly from the published schedules' stored data, so:
//   • drafts never contribute (only finalized blocks carry forward),
//   • the first block of the year has zero carry-in,
//   • regenerating or re-publishing a block can never double-count or self-pollute.
export async function GET(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  await initDb();

  const before = new URL(req.url).searchParams.get('before');
  if (!before) return NextResponse.json({}); // no target start date → no carry-in

  const acYear = academicYear(before);
  const acYearStart = `${acYear}-07-01`;

  // Latest published CUH/PMH schedule per prior block period (DISTINCT ON start_date,
  // newest generated wins — so re-publishing a block replaces, never adds).
  const { rows } = await sql`
    SELECT DISTINCT ON (start_date) start_date, data
    FROM schedules
    WHERE published = TRUE
      AND COALESCE(schedule_type, 'cuh_pmh') = 'cuh_pmh'
      AND (data::jsonb ->> 'mergedFrom') IS NULL
      AND end_date  <  ${before}
      AND start_date >= ${acYearStart}
    ORDER BY start_date, generated_at DESC
  `;

  const carryIn: Record<string, {
    hours: number; availDays: number; wkndHours: number; traumaHours: number;
    potentialHours: number; wkndPotentialHours: number; traumaPotentialHours: number;
  }> = {};

  for (const row of rows) {
    let stored: {
      jrH?: Record<string, number>;
      jrHwknd?: Record<string, number>;
      jrTH?: Record<string, number>;
      jrAvailDays?: Record<string, number>;
      jrWkndAvailDays?: Record<string, number>;
      jrPotentialHours?: Record<string, number>;
      jrWkndPotentialHours?: Record<string, number>;
      jrPotentialTraumaHours?: Record<string, number>;
      juniorDays?: Array<{ res: { id: string; person_id?: string } }>;
    };
    try { stored = JSON.parse(row.data); } catch { continue; }

    const jrH         = stored.jrH ?? {};
    const jrHwknd     = stored.jrHwknd ?? {};
    const jrTH        = stored.jrTH ?? {};
    const jrAvailDays = stored.jrAvailDays ?? {};
    const jrWkndAvail = stored.jrWkndAvailDays ?? {};
    // Exact per-resident potential-hours denominators. Older schedules predate these
    // fields; for those we fall back to availDays × AVG_DAY_HOURS below, which is the
    // same approximation the scheduler used to make inline.
    const jrPot       = stored.jrPotentialHours ?? {};
    const jrWkndPot   = stored.jrWkndPotentialHours ?? {};
    const jrTraumaPot = stored.jrPotentialTraumaHours ?? {};

    // resident_id → person_id. person_id is stable across blocks, so carry is keyed by it.
    const resToPerson: Record<string, string> = {};
    for (const jd of stored.juniorDays ?? []) {
      if (jd.res?.person_id && !resToPerson[jd.res.id]) resToPerson[jd.res.id] = jd.res.person_id;
    }

    for (const [resId, personId] of Object.entries(resToPerson)) {
      const c = (carryIn[personId] ??= {
        hours: 0, availDays: 0, wkndHours: 0, traumaHours: 0,
        potentialHours: 0, wkndPotentialHours: 0, traumaPotentialHours: 0,
      });

      // Total hours always carries. Prefer the exact potential; legacy schedules that
      // predate the field fall back to the day-count approximation.
      c.hours          += jrH[resId] ?? 0;
      c.availDays      += jrAvailDays[resId] ?? 0;
      c.potentialHours += potentialFor(resId, jrPot, jrAvailDays, jrWkndAvail);

      // Weekend and trauma carry only when BOTH the numerator and its matching
      // denominator are present. Adding hours without the potential they were earned
      // against would put a cumulative numerator over a single-block denominator and
      // inflate the ratio without bound. A legacy block is skipped for every resident
      // alike, so the resulting ratios stay comparable across the pool.
      if (jrWkndPot[resId] !== undefined) {
        c.wkndHours          += jrHwknd[resId] ?? 0;
        c.wkndPotentialHours += jrWkndPot[resId];
      }
      if (jrTraumaPot[resId] !== undefined) {
        c.traumaHours          += jrTH[resId] ?? 0;
        c.traumaPotentialHours += jrTraumaPot[resId];
      }
    }
  }

  return NextResponse.json(carryIn);
}
