import { sql } from '@/lib/db';
import {
  periodEquity, zeroLine, livePotentials,
  type StoredSchedule, type Potentials, type RotationSeg, type RequestRow, type ResidentEquityLines,
} from '@/lib/equity';

// Shared loader behind /api/pool-equity (the Usage tab) and /api/jr-carry (the
// generator's carry-in). Both MUST read the same blocks with the same arithmetic:
// the generator balances toward exactly the deviation the Usage tab displays, and
// any divergence between the two shows up as residents drifting away from their
// fair share block after block.

export function academicYear(dateStr: string): number {
  const d = new Date(dateStr + 'T12:00:00');
  const m = d.getMonth() + 1;
  return m >= 7 ? d.getFullYear() : d.getFullYear() - 1;
}

export interface Identity { personId: string; name: string; pgy: number; color: string }

export interface LoadedPeriod {
  scheduleId: string;
  name: string;
  startDate: string;
  endDate: string;
  // Unrounded lines keyed by resident id (block-specific record).
  lines: Record<string, ResidentEquityLines>;
  poolIds: string[];
}

export interface LoadedPoolEquity {
  acYearStart: string;
  identity: Record<string, Identity>;
  periods: LoadedPeriod[];
  // Unrounded year-to-date lines keyed by person id.
  ytd: Record<string, ResidentEquityLines>;
}

// `endBefore` restricts to blocks that end strictly before that date (the generator's
// carry-in: prior blocks only). Omit it for the whole academic year.
export async function loadPoolEquity(baseDate: string, endBefore?: string): Promise<LoadedPoolEquity> {
  const acYear = academicYear(baseDate);
  const acYearStart = `${acYear}-07-01`;
  const acYearEnd   = `${acYear + 1}-06-30`;
  const upper = endBefore ?? '9999-12-31';

  // Published CUH/PMH schedules for the year. Combined schedules are excluded — they
  // restate their sources' assignments AND re-sum the potential-hours denominators,
  // so counting them would double both sides of every ratio.
  const { rows: schedRows } = await sql`
    SELECT id, name, start_date, end_date, data, generated_at
    FROM schedules
    WHERE published      = TRUE
      AND COALESCE(schedule_type, 'cuh_pmh') = 'cuh_pmh'
      AND (data::jsonb ->> 'mergedFrom') IS NULL
      AND start_date    >= ${acYearStart}
      AND end_date      <= ${acYearEnd}
      AND end_date       < ${upper}
    ORDER BY start_date ASC, generated_at DESC
  `;

  const parsed: Array<{ row: typeof schedRows[number]; data: StoredSchedule; poolIds: string[] }> = [];
  const allPoolIds = new Set<string>();
  const seenPeriods = new Set<string>();

  for (const row of schedRows) {
    let data: StoredSchedule;
    try { data = JSON.parse(row.data); } catch { continue; }

    // The junior pool is whoever the scheduler computed a potential for. Legacy
    // schedules without that map fall back to whoever actually appears on a call day.
    // Senior-only schedules have neither and are skipped here, BEFORE de-duplication,
    // so a senior schedule for the same dates can never displace the junior one.
    const fromPot = data.jrPotentialHours ? Object.keys(data.jrPotentialHours) : [];
    const poolIds = fromPot.length > 0
      ? fromPot
      : [...new Set((data.juniorDays ?? []).map((d) => d.res.id))];
    if (poolIds.length === 0) continue;

    // One junior schedule per period: if a period was regenerated and both versions
    // are published, the newest wins rather than both being counted.
    const periodKey = `${row.start_date}|${row.end_date}`;
    if (seenPeriods.has(periodKey)) continue;
    seenPeriods.add(periodKey);

    poolIds.forEach((id) => allPoolIds.add(id));
    parsed.push({ row, data, poolIds });
  }

  // Resolve resident records to people. The DB is authoritative for names (they may have
  // been corrected since a schedule was generated); the schedule's own snapshot covers
  // residents whose row has since been deleted.
  const identity: Record<string, Identity> = {};
  if (allPoolIds.size > 0) {
    const { rows } = await sql.query(
      `SELECT r.id, r.name, r.color, r.person_id, COALESCE(p.pgy, r.pgy) AS pgy
         FROM residents r LEFT JOIN persons p ON r.person_id = p.id
        WHERE r.id = ANY($1)`,
      [[...allPoolIds]],
    );
    for (const r of rows) {
      identity[r.id] = { personId: r.person_id ?? r.id, name: r.name, pgy: Number(r.pgy), color: r.color };
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

  // Current rotations and requests for everyone in any pool. The schedule blob carries a
  // copy of each resident's potential hours frozen at generation time; a rotation edited
  // afterwards would never reach the fair share unless the schedule were regenerated, so
  // the denominators are recomputed here from live data instead.
  const rotationsBy: Record<string, RotationSeg[]> = {};
  const requestsBy: Record<string, RequestRow[]> = {};
  if (allPoolIds.size > 0) {
    const ids = [...allPoolIds];
    const [rotRes, reqRes] = await Promise.all([
      sql.query(`SELECT resident_id, hospital, start_date, end_date FROM rotations WHERE resident_id = ANY($1)`, [ids]),
      sql.query(`SELECT resident_id, date, type FROM requests WHERE resident_id = ANY($1)`, [ids]),
    ]);
    for (const id of ids) { rotationsBy[id] = []; requestsBy[id] = []; }
    for (const r of rotRes.rows) {
      rotationsBy[r.resident_id]?.push({ hospital: r.hospital, start_date: r.start_date, end_date: r.end_date });
    }
    for (const q of reqRes.rows) {
      requestsBy[q.resident_id]?.push({ date: q.date, type: q.type });
    }
  }

  const periods: LoadedPeriod[] = [];
  const ytd: Record<string, ResidentEquityLines> = {};

  for (const { row, data, poolIds } of parsed) {
    const live: Record<string, Potentials> = {};
    for (const id of poolIds) {
      const who = identity[id];
      if (!who || !rotationsBy[id]) continue;
      live[id] = livePotentials(
        { pgy: who.pgy, rotations: rotationsBy[id], requests: requestsBy[id] ?? [] },
        row.start_date,
        row.end_date,
      );
    }

    const lines = periodEquity(data, poolIds, live);

    // Roll into the year from the UNROUNDED block figures. Targets are absolute hours,
    // so the annual target is simply the sum of each block's share.
    for (const id of poolIds) {
      const who = identity[id];
      if (!who) continue;
      const agg = (ytd[who.personId] ??= { total: zeroLine(), weekend: zeroLine(), trauma: zeroLine() });
      for (const axis of ['total', 'weekend', 'trauma'] as const) {
        agg[axis].worked    += lines[id][axis].worked;
        agg[axis].target    += lines[id][axis].target;
        agg[axis].potential += lines[id][axis].potential;
      }
    }

    periods.push({
      scheduleId: row.id,
      name: row.name,
      startDate: row.start_date,
      endDate: row.end_date,
      lines,
      poolIds,
    });
  }

  return { acYearStart, identity, periods, ytd };
}
