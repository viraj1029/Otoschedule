import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }
  const { id } = await params;
  const { hospital, start_date, end_date } = await req.json();
  if (hospital)    await sql`UPDATE rotations SET hospital   = ${hospital}   WHERE id = ${id}`;
  if (start_date)  await sql`UPDATE rotations SET start_date = ${start_date} WHERE id = ${id}`;
  if (end_date)    await sql`UPDATE rotations SET end_date   = ${end_date}   WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }
  const { id } = await params;
  await sql`DELETE FROM rotations WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}
