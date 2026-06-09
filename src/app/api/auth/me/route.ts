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
    const { rows } = await sql`
      SELECT
        r.id,
        r.block_id,
        COALESCE(p.name,  r.name)  AS name,
        COALESCE(p.pgy,   r.pgy)   AS pgy,
        COALESCE(p.pin,   r.pin)   AS pin,
        COALESCE(p.color, r.color) AS color,
        r.person_id,
        r.hospital,
        r.status,
        r.sort_order,
        r.rotation_start,
        r.rotation_end
      FROM residents r
      LEFT JOIN persons p ON r.person_id = p.id
      WHERE r.id = ${session.residentId}
    `;
    data.resident = rows[0] ?? null;
  }

  return NextResponse.json(data);
}
