import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }
  const { id } = await params;
  await sql`DELETE FROM schedules WHERE id = ${id} AND block_id = ${DEFAULT_BLOCK_ID}`;
  return NextResponse.json({ ok: true });
}
