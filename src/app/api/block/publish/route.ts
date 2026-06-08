import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';

const DEFAULT_BLOCK_ID = 'block_main';

export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  const { published, scheduleId } = await req.json();

  if (scheduleId) {
    // Publish or unpublish a specific schedule
    await sql`
      UPDATE schedules SET published = ${Boolean(published)}
      WHERE id = ${scheduleId} AND block_id = ${DEFAULT_BLOCK_ID}
    `;
    // Keep blocks.published in sync: true if any schedule is published
    const { rows } = await sql`
      SELECT EXISTS(SELECT 1 FROM schedules WHERE block_id = ${DEFAULT_BLOCK_ID} AND published = TRUE) AS any_published
    `;
    await sql`
      UPDATE blocks SET published = ${rows[0].any_published} WHERE id = ${DEFAULT_BLOCK_ID}
    `;
  } else {
    // Legacy: publish/unpublish at block level (affects all schedules)
    await sql`UPDATE blocks SET published = ${Boolean(published)} WHERE id = ${DEFAULT_BLOCK_ID}`;
  }

  return NextResponse.json({ ok: true });
}
