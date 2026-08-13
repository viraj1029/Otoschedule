import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';
import { mergeSchedules, scheduleTypeOf, type MergeSource } from '@/lib/merge';
import type { AnyScheduleData } from '@/types';
import { randomUUID } from 'crypto';

const DEFAULT_BLOCK_ID = 'block_main';

// POST /api/schedules/merge  { ids: string[], name?: string }
// Combines the given schedules into a new draft schedule covering the full range.
export async function POST(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  await initDb();

  const body = await req.json() as { ids?: string[]; name?: string };
  const name = body.name;
  const ids = [...new Set(Array.isArray(body.ids) ? body.ids : [])];
  if (ids.length < 2) {
    return NextResponse.json({ error: 'Select at least two schedules to combine' }, { status: 400 });
  }

  const { rows } = await sql.query(
    `SELECT id, name, start_date, end_date, data
       FROM schedules
      WHERE id = ANY($1) AND block_id = $2`,
    [ids, DEFAULT_BLOCK_ID],
  );
  if (rows.length !== ids.length) {
    return NextResponse.json({ error: 'One or more schedules no longer exist' }, { status: 404 });
  }

  const sources: MergeSource[] = [];
  for (const row of rows) {
    let data: AnyScheduleData;
    try {
      data = JSON.parse(row.data);
    } catch {
      return NextResponse.json({ error: `Schedule "${row.name}" could not be read` }, { status: 422 });
    }
    sources.push({ id: row.id, name: row.name, start_date: row.start_date, end_date: row.end_date, data });
  }

  let merged;
  try {
    merged = mergeSchedules(sources, (name ?? '').trim() || defaultName(sources));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }

  const id = 'sched_' + randomUUID().replace(/-/g, '').slice(0, 12);
  const scheduleType = scheduleTypeOf(merged.data);
  await sql`
    INSERT INTO schedules (id, block_id, name, start_date, end_date, data, published, schedule_type)
    VALUES (
      ${id}, ${DEFAULT_BLOCK_ID}, ${merged.data.blockName},
      ${merged.data.bStart}, ${merged.data.bEnd},
      ${JSON.stringify(merged.data)}, FALSE, ${scheduleType}
    )
  `;

  return NextResponse.json({ ok: true, id, name: merged.data.blockName, warnings: merged.warnings });
}

function defaultName(sources: MergeSource[]): string {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const starts = sources.map((s) => s.data.bStart || s.start_date || '').filter(Boolean).sort();
  const ends   = sources.map((s) => s.data.bEnd   || s.end_date   || '').filter(Boolean).sort();
  const s = starts[0];
  const e = ends[ends.length - 1];
  if (!s || !e) return 'Combined Schedule';
  const [sy, sm] = s.split('-').map(Number);
  const [ey, em] = e.split('-').map(Number);
  const range = sy === ey
    ? `${M[sm - 1]} – ${M[em - 1]} ${sy}`
    : `${M[sm - 1]} ${sy} – ${M[em - 1]} ${ey}`;
  // Carry the source suffix (e.g. "Junior Schedule") when every source agrees on it.
  const suffixes = sources.map((x) => x.name.split(' - ').slice(1).join(' - ').trim()).filter(Boolean);
  const suffix = suffixes.length === sources.length && suffixes.every((x) => x === suffixes[0]) ? suffixes[0] : '';
  return suffix ? `${range} - ${suffix} (Combined)` : `${range} (Combined)`;
}
