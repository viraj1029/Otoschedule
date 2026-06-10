import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';

const DEFAULT_BLOCK_ID = 'block_main';

function academicYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const m = d.getMonth() + 1; // 1-indexed
  return m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

export async function GET() {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  await initDb();

  // Get current block dates
  const { rows: blockRows } = await sql`SELECT start_date FROM blocks WHERE id = ${DEFAULT_BLOCK_ID}`;
  if (!blockRows[0]) return NextResponse.json({});
  const currentBlockStart: string = blockRows[0].start_date;
  const acYear = academicYear(currentBlockStart);

  // Read the currently stored schedule
  const { rows: schedRows } = await sql`
    SELECT data FROM schedules WHERE block_id = ${DEFAULT_BLOCK_ID} ORDER BY generated_at DESC LIMIT 1
  `;

  if (schedRows[0]) {
    const stored = JSON.parse(schedRows[0].data);
    const storedBlockStart: string = stored.bStart;

    // If the stored schedule is from a different (earlier) block within the same academic year, archive it.
    if (storedBlockStart !== currentBlockStart && academicYear(storedBlockStart) === acYear) {
      const jrH: Record<string, number> = stored.jrH ?? {};
      const jrHwknd: Record<string, number> = stored.jrHwknd ?? {};
      const jrTH: Record<string, number> = stored.jrTH ?? {};
      const jrAvailDays: Record<string, number> = stored.jrAvailDays ?? {};
      const juniorDays: Array<{ res: { id: string; person_id?: string } }> = stored.juniorDays ?? [];

      // Build person_id → resident_id map from juniorDays
      const personToResId: Record<string, string> = {};
      for (const jd of juniorDays) {
        if (jd.res.person_id && !personToResId[jd.res.person_id]) {
          personToResId[jd.res.person_id] = jd.res.id;
        }
      }

      for (const [personId, resId] of Object.entries(personToResId)) {
        const hours = jrH[resId] ?? 0;
        const availDays = jrAvailDays[resId] ?? 0;
        const wkndHours = jrHwknd[resId] ?? 0;
        const traumaHours = jrTH[resId] ?? 0;
        if (hours === 0 && availDays === 0) continue;
        await sql`
          INSERT INTO jr_carry (person_id, block_start, academic_year, hours, avail_days, wknd_hours, trauma_hours)
          VALUES (${personId}, ${storedBlockStart}, ${acYear}, ${hours}, ${availDays}, ${wkndHours}, ${traumaHours})
          ON CONFLICT (person_id, block_start) DO UPDATE SET
            hours        = EXCLUDED.hours,
            avail_days   = EXCLUDED.avail_days,
            wknd_hours   = EXCLUDED.wknd_hours,
            trauma_hours = EXCLUDED.trauma_hours,
            archived_at  = NOW()
        `;
      }
    }
  }

  // Return cumulative carry-in for this academic year, excluding the current block
  const { rows: carryRows } = await sql`
    SELECT person_id,
           SUM(hours)        AS hours,
           SUM(avail_days)   AS avail_days,
           SUM(wknd_hours)   AS wknd_hours,
           SUM(trauma_hours) AS trauma_hours
    FROM jr_carry
    WHERE academic_year = ${acYear} AND block_start != ${currentBlockStart}
    GROUP BY person_id
  `;

  const carryIn: Record<string, { hours: number; availDays: number; wkndHours: number; traumaHours: number }> = {};
  for (const row of carryRows) {
    carryIn[row.person_id] = {
      hours:        parseFloat(row.hours),
      availDays:    parseInt(row.avail_days),
      wkndHours:    parseFloat(row.wknd_hours ?? '0'),
      traumaHours:  parseFloat(row.trauma_hours ?? '0'),
    };
  }

  return NextResponse.json(carryIn);
}
