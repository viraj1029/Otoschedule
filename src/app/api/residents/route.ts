import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { v4 as uuidv4 } from 'uuid';
import { initDb } from '@/lib/init-db';

const DEFAULT_BLOCK_ID = 'block_main';

const COLORS = [
  '#f59e0b', '#60a5fa', '#34d399', '#f87171', '#a78bfa',
  '#fb923c', '#2dd4bf', '#f472b6', '#a3e635', '#e879f9',
  '#38bdf8', '#4ade80',
];

// Flat resident view: persons data joined with block-specific assignment.
// COALESCE falls back to the residents columns for legacy rows without person_id.
async function fetchResidents() {
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
    WHERE r.block_id = ${DEFAULT_BLOCK_ID}
    ORDER BY COALESCE(p.pgy, r.pgy) DESC, COALESCE(p.name, r.name) ASC
  `;
  return rows;
}

export async function GET() {
  await initDb();
  const session = await getSession();
  const rows = await fetchResidents();

  // Unauthenticated: only enough for the login dropdown (no PINs)
  if (!session.role) {
    return NextResponse.json(rows.map((r) => ({
      id: r.id, name: r.name, pgy: r.pgy, color: r.color,
      hospital: r.hospital, status: r.status, person_id: r.person_id,
    })));
  }

  if (session.role === 'resident') {
    const myId = session.residentId;
    return NextResponse.json(rows.map((r) => ({ ...r, pin: r.id === myId ? r.pin : undefined })));
  }

  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  const { name, pgy, hospital, status, rotation_start, rotation_end, personId: existingPersonId } = await req.json();

  // Ensure the block row exists
  const { rows: blockRows } = await sql`SELECT id FROM blocks WHERE id = ${DEFAULT_BLOCK_ID}`;
  if (!blockRows[0]) {
    await sql`
      INSERT INTO blocks (id, name, start_date, end_date, chief_password)
      VALUES (${DEFAULT_BLOCK_ID}, 'CUH/PMH Block', '2026-07-01', '2026-09-30', 'chief2026')
      ON CONFLICT (id) DO NOTHING
    `;
  }

  let personId: string;
  let pin: string;
  let color: string;
  let resName: string;
  let resPgy: number;

  if (existingPersonId) {
    // Reuse an existing person — just create a new block assignment.
    const { rows: pRows } = await sql`SELECT * FROM persons WHERE id = ${existingPersonId}`;
    if (!pRows[0]) return NextResponse.json({ error: 'Person not found' }, { status: 404 });

    // Guard: prevent adding the same person to the same block twice
    const { rows: already } = await sql`
      SELECT id FROM residents WHERE person_id = ${existingPersonId} AND block_id = ${DEFAULT_BLOCK_ID}
    `;
    if (already[0]) return NextResponse.json({ error: 'Person already added to this block' }, { status: 409 });

    personId = existingPersonId;
    pin      = pRows[0].pin;
    color    = pRows[0].color;
    resName  = pRows[0].name;
    resPgy   = pRows[0].pgy as number;
  } else {
    // Brand-new person: create the person record first.
    personId = 'per_' + uuidv4().slice(0, 8);
    pin      = String(Math.floor(1000 + Math.random() * 9000));
    resName  = name;
    resPgy   = typeof pgy === 'number' ? pgy : parseInt(pgy);

    const { rows: allRes } = await sql`SELECT id FROM residents WHERE block_id = ${DEFAULT_BLOCK_ID}`;
    color = COLORS[allRes.length % COLORS.length];

    await sql`
      INSERT INTO persons (id, name, pgy, pin, color)
      VALUES (${personId}, ${resName}, ${resPgy}, ${pin}, ${color})
    `;
  }

  const id = 'res_' + uuidv4().slice(0, 8);
  const { rows: allRes } = await sql`SELECT id FROM residents WHERE block_id = ${DEFAULT_BLOCK_ID}`;
  const rStart = rotation_start || null;
  const rEnd   = rotation_end   || null;

  await sql`
    INSERT INTO residents
      (id, person_id, block_id, name, pgy, hospital, status, pin, color, sort_order, rotation_start, rotation_end)
    VALUES
      (${id}, ${personId}, ${DEFAULT_BLOCK_ID}, ${resName}, ${resPgy}, ${hospital}, ${status}, ${pin}, ${color}, ${allRes.length}, ${rStart}, ${rEnd})
  `;

  return NextResponse.json({ id, pin, name: resName });
}
