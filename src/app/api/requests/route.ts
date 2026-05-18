import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function GET() {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  if (session.role === 'chief') {
    const { rows } = await sql`SELECT * FROM requests WHERE block_id = ${DEFAULT_BLOCK_ID}`;
    return NextResponse.json(rows);
  }

  // Resident — only their own
  const { rows } = await sql`
    SELECT * FROM requests
    WHERE resident_id = ${session.residentId!} AND block_id = ${DEFAULT_BLOCK_ID}
  `;
  return NextResponse.json(rows);
}
