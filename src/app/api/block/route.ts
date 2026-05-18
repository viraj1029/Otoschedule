import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function GET() {
  const { rows } = await sql`SELECT * FROM blocks WHERE id = ${DEFAULT_BLOCK_ID}`;
  if (!rows[0]) return NextResponse.json(null);

  // Never expose chief_password to the frontend
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { chief_password, ...safe } = rows[0];
  return NextResponse.json(safe);
}

export async function PUT(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  const { name, start_date, end_date, chief_password } = await req.json();

  // Read current password so we can keep it if not changing
  const { rows } = await sql`SELECT chief_password FROM blocks WHERE id = ${DEFAULT_BLOCK_ID}`;
  const currentPw = rows[0]?.chief_password ?? 'chief2026';
  const pw = chief_password || currentPw;

  await sql`
    INSERT INTO blocks (id, name, start_date, end_date, chief_password)
    VALUES (
      ${DEFAULT_BLOCK_ID},
      ${name ?? 'CUH/PMH Block'},
      ${start_date ?? '2026-07-01'},
      ${end_date ?? '2026-09-30'},
      ${pw}
    )
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      start_date = EXCLUDED.start_date,
      end_date = EXCLUDED.end_date,
      chief_password = EXCLUDED.chief_password
  `;

  return NextResponse.json({ ok: true });
}
