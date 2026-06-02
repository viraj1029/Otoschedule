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

export async function GET() {
  await initDb();
  const session = await getSession();

  const { rows } = await sql`
    SELECT * FROM residents WHERE block_id = ${DEFAULT_BLOCK_ID}
    ORDER BY pgy DESC, name ASC
  `;

  // Unauthenticated: return only enough for the login dropdown (no PINs)
  if (!session.role) {
    return NextResponse.json(rows.map((r) => ({ id: r.id, name: r.name, pgy: r.pgy, color: r.color, hospital: r.hospital, status: r.status })));
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

  const { name, pgy, hospital, status } = await req.json();

  const id = 'res_' + uuidv4().slice(0, 8);
  const pin = String(Math.floor(1000 + Math.random() * 9000));

  // Count existing residents to pick color
  const { rows: existing } = await sql`
    SELECT id FROM residents WHERE block_id = ${DEFAULT_BLOCK_ID}
  `;
  const color = COLORS[existing.length % COLORS.length];

  // Ensure block exists
  const { rows: blockRows } = await sql`SELECT id FROM blocks WHERE id = ${DEFAULT_BLOCK_ID}`;
  if (!blockRows[0]) {
    await sql`
      INSERT INTO blocks (id, name, start_date, end_date, chief_password)
      VALUES (${DEFAULT_BLOCK_ID}, 'CUH/PMH Block', '2026-07-01', '2026-09-30', 'chief2026')
      ON CONFLICT (id) DO NOTHING
    `;
  }

  await sql`
    INSERT INTO residents (id, block_id, name, pgy, hospital, status, pin, color, sort_order)
    VALUES (${id}, ${DEFAULT_BLOCK_ID}, ${name}, ${pgy}, ${hospital}, ${status}, ${pin}, ${color}, ${existing.length})
  `;

  return NextResponse.json({ id, pin, name });
}
