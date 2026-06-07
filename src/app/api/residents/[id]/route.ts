import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }
  const { id } = await params;
  const { name, pgy, hospital, status, rotation_start, rotation_end } = await req.json();

  const pgyVal  = typeof pgy      === 'number' ? pgy      : null;
  const hospVal = typeof hospital === 'string' ? hospital : null;
  const statVal = typeof status   === 'string' ? status   : null;
  const rStart  = rotation_start || null;
  const rEnd    = rotation_end   || null;

  // Resolve person_id for this assignment
  const { rows: resRows } = await sql`
    SELECT person_id FROM residents WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}
  `;
  const personId = resRows[0]?.person_id as string | undefined;

  // Person-level fields (name, pgy) — update persons table AND keep the
  // denormalized copy in residents in sync so embedded schedule JSON stays valid.
  if (typeof name === 'string' && name.trim()) {
    const trimmed = name.trim();
    if (personId) await sql`UPDATE persons    SET name = ${trimmed} WHERE id = ${personId}`;
    await sql`UPDATE residents SET name = ${trimmed} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  }
  if (pgyVal !== null) {
    if (personId) await sql`UPDATE persons    SET pgy = ${pgyVal} WHERE id = ${personId}`;
    await sql`UPDATE residents SET pgy = ${pgyVal} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  }

  // Block-specific fields — only update this assignment row
  if (hospVal !== null) await sql`UPDATE residents SET hospital       = ${hospVal} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  if (statVal !== null) await sql`UPDATE residents SET status         = ${statVal} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  await sql`UPDATE residents SET rotation_start = ${rStart} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  await sql`UPDATE residents SET rotation_end   = ${rEnd}   WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;

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
  // Remove the block assignment only — the persons record is kept so the account
  // can be reused in future blocks.
  await sql`DELETE FROM residents WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;

  return NextResponse.json({ ok: true });
}
