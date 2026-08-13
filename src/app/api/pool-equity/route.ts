import { NextResponse } from 'next/server';
import { sql } from '@/lib/db';
import { getSession } from '@/lib/session';
import { initDb } from '@/lib/init-db';
import { periodEquity, zeroLine, type StoredSchedule } from '@/lib/equity';
import type { PoolEquityMember, EquityPeriod, PoolEquityResponse } from '@/types';

function academicYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const m = d.getMonth() + 1;
  return m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

// Pool-wide CUH/PMH junior call equity for one academic year.
//
// Every resident's target is their pro-rated share of the call that actually
// existed, weighted by how much of it they were available to cover:
//
//     target_r = D × P_r / Σ_j P_j
//
// where D is the pool's total demand for the metric (all junior call hours in the
// block, the weekend-call subset, or the trauma-week subset) and P_r is the
// resident's availability-weighted potential hours for that same metric, as
// computed by the scheduler on its equity basis (off-rotation days and official
// vacation subtracted; weekend/holiday opt-outs deliberately NOT subtracted, so
// opting out cannot shrink your own target).
//
// This is the fixed point of the scheduler's own balancing rule: pickJr and the
// rebalancers drive every resident toward an equal hours ÷ potential ratio k, and
// since the assigned hours must sum to D, k = D / ΣP and target_r = k · P_r. So a
// resident's distance from target is exactly the quantity the generator is trying
// to zero out, and the targets sum to the real work rather than to a constant.
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
  const acYearStartParam = params.get('acYearStart');
  const baseDate = acYearStartParam ?? new Date().toISOString().slice(0, 10);
  const acYear = academicYear(baseDate);
  const acYearStart = `${acYear}-07-01`;
  const acYearEnd   = `${acYear + 1}-06-30`;

  // Published CUH/PMH schedules for the year. Combined schedules are excluded — they
  // restate their sources' assignments AND re-sum the potential-hours denominators,
  // so counting them would double both sides of every ratio.
  const { rows: schedRows } = await sql`
    SELECT id, name, start_date, end_date, data
    FROM schedules
    WHERE published      = TRUE
      AND COALESCE(schedule_type, 'cuh_pmh') = 'cuh_pmh'
      AND (data::jsonb ->> 'mergedFrom') IS NULL
      AND start_date    >= ${acYearStart}
      AND end_date      <= ${acYearEnd}
    ORDER BY start_date ASC
  `;

  const parsed: Array<{ row: typeof schedRows[number]; data: StoredSchedule; poolIds: string[] }> = [];
  const allPoolIds = new Set<string>();

  for (const row of schedRows) {
    let data: StoredSchedule;
    try { data = JSON.parse(row.data); } catch { continue; }

    // The junior pool is whoever the scheduler computed a potential for. Legacy
    // schedules without that map fall back to whoever actually appears on a call day.
    const poolIds = data.jrPotentialHours
      ? Object.keys(data.jrPotentialHours)
      : [...new Set((data.juniorDays ?? []).map((d) => d.res.id))];
    if (poolIds.length === 0) continue;

    poolIds.forEach((id) => allPoolIds.add(id));
    parsed.push({ row, data, poolIds });
  }

  // Resolve resident records to people. The DB is authoritative for names (they may have
  // been corrected since a schedule was generated); the schedule's own snapshot covers
  // residents whose row has since been deleted.
  const identity: Record<string, { personId: string; name: string; pgy: number; color: string }> = {};
  if (allPoolIds.size > 0) {
    const { rows } = await sql.query(
      `SELECT r.id, r.name, r.color, r.person_id, COALESCE(p.pgy, r.pgy) AS pgy
         FROM residents r LEFT JOIN persons p ON r.person_id = p.id
        WHERE r.id = ANY($1)`,
      [[...allPoolIds]],
    );
    for (const r of rows) {
      identity[r.id] = {
        personId: r.person_id ?? r.id,
        name: r.name,
        pgy: Number(r.pgy),
        color: r.color,
      };
    }
  }
  for (const { data } of parsed) {
    for (const jd of data.juniorDays ?? []) {
      if (identity[jd.res.id]) continue;
      identity[jd.res.id] = {
        personId: jd.res.person_id ?? jd.res.id,
        name: jd.res.name ?? 'Unknown',
        pgy: jd.res.pgy ?? 0,
        color: jd.res.color ?? '#888888',
      };
    }
  }

  const periods: EquityPeriod[] = [];
  const ytd: Record<string, PoolEquityMember> = {};

  for (const { row, data, poolIds } of parsed) {
    const lines = periodEquity(data, poolIds);
    const members: PoolEquityMember[] = [];

    for (const id of poolIds) {
      const who = identity[id];
      if (!who) continue;

      const member: PoolEquityMember = {
        personId: who.personId,
        name: who.name,
        pgy: who.pgy,
        color: who.color,
        isMe: myPersonId !== null && who.personId === myPersonId,
        ...lines[id],
      };
      members.push(member);

      // Roll into the year. Targets are absolute hours, so the annual target is simply
      // the sum of each block's share — which is what makes a resident who joins the
      // pool mid-year, or leaves it, carry a correspondingly smaller annual target.
      const agg = (ytd[who.personId] ??= {
        personId: who.personId,
        name: who.name,
        pgy: who.pgy,
        color: who.color,
        isMe: member.isMe,
        total: zeroLine(),
        weekend: zeroLine(),
        trauma: zeroLine(),
      });
      // A resident's record can differ between blocks; keep the most recent identity.
      agg.name = who.name;
      agg.pgy = who.pgy;
      agg.color = who.color;
      for (const axis of ['total', 'weekend', 'trauma'] as const) {
        agg[axis].worked    += member[axis].worked;
        agg[axis].target    += member[axis].target;
        agg[axis].potential += member[axis].potential;
      }
    }

    members.sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name));

    periods.push({
      scheduleId: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      members,
    });
  }

  const response: PoolEquityResponse = {
    academicYearStart: acYearStart,
    periods,
    ytd: Object.values(ytd).sort((a, b) => b.pgy - a.pgy || a.name.localeCompare(b.name)),
  };

  return NextResponse.json(response);
}
