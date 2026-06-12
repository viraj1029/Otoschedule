import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';

function academicYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const m = d.getMonth() + 1; // 1-indexed
  return m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

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
      AND end_date  <  ${before}
      AND start_date >= ${acYearStart}
    ORDER BY start_date, generated_at DESC
  `;

  const carryIn: Record<string, { hours: number; availDays: number; wkndHours: number; traumaHours: number }> = {};

  for (const row of rows) {
    let stored: {
      jrH?: Record<string, number>;
      jrHwknd?: Record<string, number>;
      jrTH?: Record<string, number>;
      jrAvailDays?: Record<string, number>;
      juniorDays?: Array<{ res: { id: string; person_id?: string } }>;
    };
    try { stored = JSON.parse(row.data); } catch { continue; }

    const jrH         = stored.jrH ?? {};
    const jrHwknd     = stored.jrHwknd ?? {};
    const jrTH        = stored.jrTH ?? {};
    const jrAvailDays = stored.jrAvailDays ?? {};

    // resident_id → person_id. person_id is stable across blocks, so carry is keyed by it.
    const resToPerson: Record<string, string> = {};
    for (const jd of stored.juniorDays ?? []) {
      if (jd.res?.person_id && !resToPerson[jd.res.id]) resToPerson[jd.res.id] = jd.res.person_id;
    }

    for (const [resId, personId] of Object.entries(resToPerson)) {
      const c = (carryIn[personId] ??= { hours: 0, availDays: 0, wkndHours: 0, traumaHours: 0 });
      c.hours       += jrH[resId] ?? 0;
      c.availDays   += jrAvailDays[resId] ?? 0;
      c.wkndHours   += jrHwknd[resId] ?? 0;
      c.traumaHours += jrTH[resId] ?? 0;
    }
  }

  return NextResponse.json(carryIn);
}
