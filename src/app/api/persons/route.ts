import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';

// Chief-only: returns all known persons so the "Add Existing" picker can populate.
export async function GET() {
  await initDb();
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  const { rows } = await sql`
    SELECT id, name, pgy, color FROM persons ORDER BY pgy DESC, name ASC
  `;
  return NextResponse.json(rows);
}
