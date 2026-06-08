import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  let rows;

  if (id) {
    // Fetch a specific schedule by ID
    ({ rows } = await sql`
      SELECT * FROM schedules WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}
    `);
  } else if (session.role === 'chief') {
    // Chief: return the most recently generated schedule
    ({ rows } = await sql`
      SELECT * FROM schedules WHERE block_id = ${DEFAULT_BLOCK_ID}
      ORDER BY generated_at DESC LIMIT 1
    `);
  } else {
    // Resident: return the most recently published schedule
    ({ rows } = await sql`
      SELECT * FROM schedules WHERE block_id = ${DEFAULT_BLOCK_ID} AND published = TRUE
      ORDER BY generated_at DESC LIMIT 1
    `);
  }

  if (!rows[0]) return NextResponse.json(null);

  const scheduleData = JSON.parse(rows[0].data);
  // Inject the DB-level published flag so it's always authoritative
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
  await sql`
    UPDATE schedules SET data = ${JSON.stringify(scheduleData)}
    WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}
  `;
  return NextResponse.json({ ok: true });
}
