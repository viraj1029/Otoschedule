import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function GET() {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const isResident = session.role === 'resident';
  const { rows } = isResident
    ? await sql`
        SELECT id, block_id, name, start_date, end_date, published, generated_at, schedule_type
        FROM schedules
        WHERE block_id = ${DEFAULT_BLOCK_ID} AND published = TRUE
        ORDER BY generated_at DESC
      `
    : await sql`
        SELECT id, block_id, name, start_date, end_date, published, generated_at, schedule_type
        FROM schedules
        WHERE block_id = ${DEFAULT_BLOCK_ID}
        ORDER BY generated_at DESC
      `;

  return NextResponse.json(rows);
}
