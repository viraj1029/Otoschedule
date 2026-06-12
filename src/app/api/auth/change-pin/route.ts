import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function POST(req: Request) {
  const session = await getSession();

  if (session.role !== 'resident' || !session.residentId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { currentPin, newPin } = await req.json();

  if (!/^\d{4}$/.test(newPin)) {
    return NextResponse.json({ error: 'New PIN must be exactly 4 digits' }, { status: 400 });
  }

  // Fetch current PIN (prefer persons table if person_id exists)
  const { rows } = await sql`
    SELECT r.pin AS res_pin, p.pin AS person_pin, r.person_id
    FROM residents r
    LEFT JOIN persons p ON r.person_id = p.id
    WHERE r.id = ${session.residentId}
  `;

  const row = rows[0];
  if (!row) return NextResponse.json({ error: 'Resident not found' }, { status: 404 });

  const storedPin = row.person_pin ?? row.res_pin;
  if (storedPin !== currentPin) {
    return NextResponse.json({ error: 'Current PIN is incorrect' }, { status: 401 });
  }

  // Update persons table if linked, otherwise update residents table
  if (row.person_id) {
    await sql`UPDATE persons SET pin = ${newPin} WHERE id = ${row.person_id}`;
  }
  // Always keep residents table in sync
  await sql`UPDATE residents SET pin = ${newPin} WHERE id = ${session.residentId}`;

  return NextResponse.json({ ok: true });
}
