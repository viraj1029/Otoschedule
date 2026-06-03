import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }
  const { dateKey, cuhResId, pmhResId } = await req.json();

  const { rows } = await sql`SELECT data FROM schedules WHERE block_id = ${DEFAULT_BLOCK_ID} ORDER BY generated_at DESC LIMIT 1`;
  if (!rows[0]) return NextResponse.json({ error: 'No schedule' }, { status: 404 });

  const schedule = JSON.parse(rows[0].data);
  if (!schedule.roundingOverrides) schedule.roundingOverrides = {};
  schedule.roundingOverrides[dateKey] = { cuhResId, pmhResId };

  const id = 'sched_' + DEFAULT_BLOCK_ID;
  await sql`
    INSERT INTO schedules (id, block_id, data)
    VALUES (${id}, ${DEFAULT_BLOCK_ID}, ${JSON.stringify(schedule)})
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, generated_at = NOW()
  `;
  return NextResponse.json({ ok: true });
}
