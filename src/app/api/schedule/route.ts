import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function GET() {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { rows } = await sql`
    SELECT * FROM schedules WHERE block_id = ${DEFAULT_BLOCK_ID}
    ORDER BY generated_at DESC LIMIT 1
  `;

  if (!rows[0]) return NextResponse.json(null);

  const schedule = JSON.parse(rows[0].data);
  return NextResponse.json(schedule);
}
