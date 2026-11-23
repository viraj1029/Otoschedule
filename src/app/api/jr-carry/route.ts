import { NextResponse } from 'next/server';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';
import { loadPoolEquity } from '@/lib/pool-equity-data';
import type { CarryIn } from '@/lib/scheduler';

// Carry-in for a CUH/PMH junior schedule about to be generated: each person's
// cumulative worked hours AND cumulative fair-share target from PUBLISHED blocks
// earlier in the same academic year (blocks that end before `before`), keyed by
// person_id.
//
// It is computed by the same loader as the Usage tab (/api/pool-equity), so the
// generator corrects exactly the year-to-date deviation the Usage tab displays.
// Previously the carry-in only held hours and potentials, and the generator
// equalized a pooled hours ÷ potential ratio across the year. That is not the same
// thing as summing per-block shares once the pool changes size between blocks, and
// the two drifted apart.
export async function GET(req: Request) {
  const session = await getSession();
  if (session.role !== 'chief') {
    return NextResponse.json({ error: 'Chief access required' }, { status: 401 });
  }

  await initDb();

  const before = new URL(req.url).searchParams.get('before');
  if (!before) return NextResponse.json({}); // no target start date → no carry-in

  const { ytd } = await loadPoolEquity(before, before);

  const carryIn: Record<string, CarryIn> = {};
  for (const [personId, l] of Object.entries(ytd)) {
    carryIn[personId] = {
      hours: l.total.worked,
      availDays: 0,
      potentialHours: l.total.potential,
      targetHours: l.total.target,
      wkndHours: l.weekend.worked,
      wkndPotentialHours: l.weekend.potential,
      wkndTargetHours: l.weekend.target,
      traumaHours: l.trauma.worked,
      traumaPotentialHours: l.trauma.potential,
      traumaTargetHours: l.trauma.target,
    };
  }

  return NextResponse.json(carryIn);
}
