import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { randomUUID } from 'crypto';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  const { scheduleData, name, start_date, end_date } = await req.json();
  const id = 'sched_' + randomUUID().replace(/-/g, '').slice(0, 12);
  const data = JSON.stringify(scheduleData);
  const scheduleName = name || scheduleData.blockName || 'Schedule';
  const sStart = start_date || scheduleData.bStart;
  const sEnd = end_date || scheduleData.bEnd;

  await sql`
    INSERT INTO schedules (id, block_id, name, start_date, end_date, data, published)
    VALUES (${id}, ${DEFAULT_BLOCK_ID}, ${scheduleName}, ${sStart}, ${sEnd}, ${data}, FALSE)
  `;

  return NextResponse.json({ ok: true, id });
}
