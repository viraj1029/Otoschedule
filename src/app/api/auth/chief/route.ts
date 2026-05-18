import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const { password } = await req.json();

  const { rows } = await sql`SELECT chief_password FROM blocks WHERE id = ${DEFAULT_BLOCK_ID}`;
  const correctPw = rows[0]?.chief_password ?? 'chief2026';

  if (password !== correctPw) {
    return NextResponse.json({ error: 'Incorrect password' }, { status: 401 });
  }

  const session = await getSession();
  session.role = 'chief';
  session.residentId = undefined;
  session.blockId = DEFAULT_BLOCK_ID;
  await session.save();

  return NextResponse.json({ ok: true, role: 'chief' });
}
