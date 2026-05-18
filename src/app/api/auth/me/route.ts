import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function GET() {
  const session = await getSession();

  if (!session.role) {
    return NextResponse.json({ role: null });
  }

  const data: Record<string, unknown> = { role: session.role };

  if (session.residentId) {
    const { rows } = await sql`SELECT * FROM residents WHERE id = ${session.residentId}`;
    data.resident = rows[0] ?? null;
  }

  return NextResponse.json(data);
}
