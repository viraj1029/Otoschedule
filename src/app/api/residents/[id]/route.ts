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
  const body = await req.json();
  const pgyVal    = typeof pgy      === 'number' ? pgy      : null;
  const hospVal   = typeof hospital === 'string' ? hospital : null;
  const statVal   = typeof status   === 'string' ? status   : null;
  const rStart    = rotation_start || null;
  const rEnd      = rotation_end   || null;

  if (pgyVal !== null)  await sql`UPDATE residents SET pgy            = ${pgyVal}  WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  if (hospVal !== null) await sql`UPDATE residents SET hospital       = ${hospVal} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  if (statVal !== null) await sql`UPDATE residents SET status         = ${statVal} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  if ('rotation_start' in body) await sql`UPDATE residents SET rotation_start = ${rStart} WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  if ('rotation_end'   in body) await sql`UPDATE residents SET rotation_end   = ${rEnd}   WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;

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

  await sql`DELETE FROM residents WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;

  return NextResponse.json({ ok: true });
}
