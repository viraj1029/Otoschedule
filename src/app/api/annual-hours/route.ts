import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';

// Annual CUH/PMH call hour targets for the 2026–2027 academic year.
// Derived from total pool hours (5,748 h) distributed proportionally
// to each resident's time in the pool (PGY3 = 8 months, PGY2 = 32 weeks).
const PGY3_ANNUAL_TARGET = 756;
const PGY2_ANNUAL_TARGET = 696;

function academicYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const m = d.getMonth() + 1;
  return m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.role || !session.residentId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await initDb();

  // Get the resident's PGY level and person_id
  const { rows: resRows } = await sql`
    SELECT r.person_id, COALESCE(p.pgy, r.pgy) AS pgy
    FROM residents r
    LEFT JOIN persons p ON r.person_id = p.id
    WHERE r.id = ${session.residentId}
  `;
  const resident = resRows[0];
  if (!resident) {
    return NextResponse.json({ error: 'Resident not found' }, { status: 404 });
  }

  const pgy: number = resident.pgy;
  if (pgy !== 2 && pgy !== 3) {
    // Only PGY2 and PGY3 have annual call pool targets
    return NextResponse.json({ tracked: false });
  }

  const targetHours = pgy === 3 ? PGY3_ANNUAL_TARGET : PGY2_ANNUAL_TARGET;

  // Determine the academic year range.
  // The client passes ?acYearStart=YYYY-07-01 derived from the block's start date,
  // which avoids the server's "now" landing in the wrong year (e.g. June 2026
  // would resolve to the 2025-2026 year instead of 2026-2027).
  const params = new URL(req.url).searchParams;
  const acYearStartParam = params.get('acYearStart');
  const fallbackDate = acYearStartParam ?? new Date().toISOString().slice(0, 10);
  const acYear = academicYear(fallbackDate);
  const acYearStart = `${acYear}-07-01`;
  const acYearEnd   = `${acYear + 1}-06-30`;

  // Fetch all published CUH/PMH schedules in the current academic year
  const { rows: schedRows } = await sql`
    SELECT data
    FROM schedules
    WHERE published      = TRUE
      AND COALESCE(schedule_type, 'cuh_pmh') = 'cuh_pmh'
      AND start_date    >= ${acYearStart}
      AND end_date      <= ${acYearEnd}
    ORDER BY start_date
  `;

  const personId: string | null = resident.person_id ?? null;
  const residentId: string = session.residentId;

  let totalHours = 0;

  for (const row of schedRows) {
    let stored: {
      jrH?: Record<string, number>;
      juniorDays?: Array<{ res: { id: string; person_id?: string } }>;
    };
    try { stored = JSON.parse(row.data); } catch { continue; }

    const jrH = stored.jrH ?? {};

    // Build resident_id → person_id map from this schedule's data
    const resToPerson: Record<string, string> = {};
    for (const jd of stored.juniorDays ?? []) {
      if (jd.res?.person_id && !resToPerson[jd.res.id]) {
        resToPerson[jd.res.id] = jd.res.person_id;
      }
    }

    // Sum hours for any resident record that belongs to this person
    for (const [resId, hrs] of Object.entries(jrH)) {
      const mappedPersonId = resToPerson[resId];
      if (
        (personId && mappedPersonId === personId) ||
        resId === residentId
      ) {
        totalHours += hrs;
      }
    }
  }

  return NextResponse.json({
    tracked: true,
    pgy,
    hoursWorked: totalHours,
    targetHours,
  });
}
