import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const { residentId, pin } = await req.json();

  // Fetch the block assignment + the global person account in one JOIN.
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
      r.sort_order
    FROM residents r
    LEFT JOIN persons p ON r.person_id = p.id
    WHERE r.id = ${residentId}
  `;
  const resident = rows[0];

  if (!resident || resident.pin !== pin) {
    return NextResponse.json({ error: 'Incorrect PIN' }, { status: 401 });
  }

  const session = await getSession();
  session.role       = 'resident';
  session.residentId = residentId;
  session.personId   = resident.person_id as string | undefined;
  session.blockId    = DEFAULT_BLOCK_ID;
  await session.save();

  return NextResponse.json({ ok: true, role: 'resident', resident });
}
