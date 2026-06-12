import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  let rows;

  if (id) {
    ({ rows } = await sql`SELECT * FROM schedules WHERE id = ${id}`);
  } else if (session.role === 'chief') {
    ({ rows } = await sql`
      SELECT * FROM schedules ORDER BY generated_at DESC LIMIT 1
    `);
  } else {
    ({ rows } = await sql`
      SELECT * FROM schedules WHERE published = TRUE ORDER BY generated_at DESC LIMIT 1
    `);
  }

  if (!rows[0]) return NextResponse.json(null);

  const scheduleData = JSON.parse(rows[0].data);
  scheduleData.published = rows[0].published;
  scheduleData._scheduleId = rows[0].id;
  return NextResponse.json(scheduleData);
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }
  const { id, scheduleData } = await req.json() as { id: string; scheduleData: unknown };
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  await sql`UPDATE schedules SET data = ${JSON.stringify(scheduleData)} WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
