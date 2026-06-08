import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { v4 as uuidv4 } from 'uuid';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { rows } = await sql`
    SELECT id, resident_id, hospital, start_date, end_date
    FROM rotations WHERE resident_id = ${id}
    ORDER BY start_date ASC
  `;
  return NextResponse.json(rows);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }
  const { id } = await params;
  const { hospital, start_date, end_date } = await req.json();
  if (!hospital || !start_date || !end_date) {
    return NextResponse.json({ error: 'hospital, start_date, end_date required' }, { status: 400 });
  }
  const rotId = 'rot_' + uuidv4().replace(/-/g, '').slice(0, 10);
  await sql`
    INSERT INTO rotations (id, resident_id, hospital, start_date, end_date)
    VALUES (${rotId}, ${id}, ${hospital}, ${start_date}, ${end_date})
  `;
  return NextResponse.json({ id: rotId });
}
