import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  const { published, scheduleId } = await req.json();

  if (!scheduleId) {
    return NextResponse.json({ error: 'scheduleId required' }, { status: 400 });
  }

  await sql`
    UPDATE schedules SET published = ${Boolean(published)} WHERE id = ${scheduleId}
  `;

  // Keep blocks.published in sync: true if any schedule in the block is published
  const { rows } = await sql`
    SELECT block_id FROM schedules WHERE id = ${scheduleId}
  `;
  if (rows[0]?.block_id) {
    const { rows: anyRows } = await sql`
      SELECT EXISTS(SELECT 1 FROM schedules WHERE block_id = ${rows[0].block_id} AND published = TRUE) AS any_published
    `;
    await sql`
      UPDATE blocks SET published = ${anyRows[0].any_published} WHERE id = ${rows[0].block_id}
    `;
  }

  return NextResponse.json({ ok: true });
}
