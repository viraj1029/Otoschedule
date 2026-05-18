import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const { residentId, pin } = await req.json();

  const { rows } = await sql`SELECT * FROM residents WHERE id = ${residentId}`;
  const resident = rows[0];

  if (!resident || resident.pin !== pin) {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  const session = await getSession();
  session.role = 'resident';
  session.residentId = residentId;
  session.blockId = DEFAULT_BLOCK_ID;
  await session.save();

  return NextResponse.json({ ok: true, role: 'resident', resident });
}
