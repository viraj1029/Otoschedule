import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';
import { roundLines } from '@/lib/equity';
import { loadPoolEquity } from '@/lib/pool-equity-data';
import type { PoolEquityMember, EquityPeriod, PoolEquityResponse } from '@/types';

// Pool-wide CUH/PMH junior call equity for one academic year.
//
// Every resident's target is their pro-rated share of the call that actually
// existed, weighted by how much of it they were available to cover:
//
//     target_r = D × P_r / Σ_j P_j
//
// per block, summed across blocks for the year. The arithmetic lives in
// loadPoolEquity, which /api/jr-carry also uses, so the generator balances toward
// exactly the figures shown here.
//
// Visible to residents as well as chiefs — the whole pool's numbers are published
// so that call load is not private.

export async function GET(req: Request) {
  const session = await getSession();
  if (!session.role) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  await initDb();

  // Identify the caller so the client can highlight their own row. Chiefs match nobody.
  let myPersonId: string | null = null;
  if (session.role === 'resident' && session.residentId) {
    if (session.personId) {
      myPersonId = session.personId;
    } else {
      const { rows } = await sql`SELECT person_id FROM residents WHERE id = ${session.residentId}`;
      myPersonId = rows[0]?.person_id ?? null;
    }
  }

  const params = new URL(req.url).searchParams;
  const baseDate = params.get('acYearStart') ?? new Date().toISOString().slice(0, 10);
  const { acYearStart, identity, periods: loaded, ytd } = await loadPoolEquity(baseDate);

  // Most recent identity per person, for the year-to-date rows.
  const latest: Record<string, (typeof identity)[string]> = {};

  const periods: EquityPeriod[] = loaded.map((p) => {
    const members: PoolEquityMember[] = [];
    for (const id of p.poolIds) {
      const who = identity[id];
      if (!who) continue;
      latest[who.personId] = who;
      members.push({
        personId: who.personId,
        name: who.name,
        pgy: who.pgy,
        color: who.color,
        isMe: myPersonId !== null && who.personId === myPersonId,
        ...roundLines(p.lines[id]),
      });
    }
    members.sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));
    return { scheduleId: p.scheduleId, name: p.name, startDate: p.startDate, endDate: p.endDate, members };
  });

  const response: PoolEquityResponse = {
    academicYearStart: acYearStart,
    periods,
    ytd: Object.entries(ytd)
      .map(([personId, lines]) => {
        const who = latest[personId];
        return {
          personId,
          name: who.name,
          pgy: who.pgy,
          color: who.color,
          isMe: myPersonId !== null && personId === myPersonId,
          ...roundLines(lines),
        };
      })
      .sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name)),
  };

  return NextResponse.json(response);
}
