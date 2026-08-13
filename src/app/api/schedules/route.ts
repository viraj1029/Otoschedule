import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const isResident = session.role === 'resident';
  const { rows } = isResident
    ? await sql`
        SELECT id, block_id, name, start_date, end_date, published, generated_at, schedule_type,
               (data::jsonb ->> 'mergedFrom') IS NOT NULL AS is_merged
        FROM schedules
        WHERE published = TRUE
        ORDER BY start_date ASC, generated_at DESC
      `
    : await sql`
        SELECT id, block_id, name, start_date, end_date, published, generated_at, schedule_type,
               (data::jsonb ->> 'mergedFrom') IS NOT NULL AS is_merged
        FROM schedules
        ORDER BY start_date ASC, generated_at DESC
      `;

  return NextResponse.json(rows);
}
