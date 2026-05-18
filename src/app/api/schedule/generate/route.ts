import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  const { scheduleData } = await req.json();
  const id = 'sched_' + DEFAULT_BLOCK_ID;
  const data = JSON.stringify(scheduleData);

  await sql`
    INSERT INTO schedules (id, block_id, data)
    VALUES (${id}, ${DEFAULT_BLOCK_ID}, ${data})
    ON CONFLICT (id) DO UPDATE SET
      data = EXCLUDED.data,
      generated_at = NOW()
  `;

  return NextResponse.json({ ok: true });
}
