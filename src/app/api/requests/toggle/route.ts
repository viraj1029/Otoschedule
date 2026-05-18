import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await req.json();
  const { date, type } = body;

  let residentId: string;
  if (session.role === 'chief') {
    residentId = body.residentId;
  } else {
    residentId = session.residentId!;
  }
  if (!residentId) {
    return NextResponse.json({ error: 'residentId required' }, { status: 400 });
  }

  // Check if request already exists
  const { rows: existing } = await sql`
    SELECT id FROM requests
    WHERE resident_id = ${residentId}
      AND block_id = ${DEFAULT_BLOCK_ID}
      AND date = ${date}
      AND type = ${type}
  `;

  if (existing[0]) {
    await sql`
      DELETE FROM requests
      WHERE resident_id = ${residentId}
        AND block_id = ${DEFAULT_BLOCK_ID}
        AND date = ${date}
        AND type = ${type}
    `;
    return NextResponse.json({ action: 'removed', date, type });
  }

  // Adding — check vacation cap
  if (type === 'vacation') {
    const { rows: countRows } = await sql`
      SELECT COUNT(*) as cnt FROM requests
      WHERE resident_id = ${residentId}
        AND block_id = ${DEFAULT_BLOCK_ID}
        AND type = 'vacation'
    `;
    const count = Number(countRows[0]?.cnt ?? 0);
    if (count >= 5) {
      return NextResponse.json({ error: 'Vacation cap reached (5 days max)' }, { status: 400 });
    }
  }

  const id = uuidv4();
  await sql`
    INSERT INTO requests (id, resident_id, block_id, date, type)
    VALUES (${id}, ${residentId}, ${DEFAULT_BLOCK_ID}, ${date}, ${type})
    ON CONFLICT (resident_id, date, type) DO NOTHING
  `;

  return NextResponse.json({ action: 'added', date, type });
}
