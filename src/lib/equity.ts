import { isWeekendCall, TRAUMA_WEEKS, LEGACY_AVG_DAY_HOURS } from '@/lib/scheduler';
import type { EquityLine } from '@/types';

// Pro-rated CUH/PMH junior call equity — the arithmetic behind /api/pool-equity.
//
// Every resident's target is their share of the call that actually existed, weighted
// by how much of it they were available to cover:
//
//     target_r = D × P_r / Σ_j P_j
//
// where D is the pool's demand for the metric (all junior call hours in the block, the
// weekend-call subset, or the trauma-week subset) and P_r is the resident's
// availability-weighted potential hours for that same metric, as computed by the
// scheduler on its equity basis: off-rotation days and official vacation subtracted,
// weekend/holiday opt-outs deliberately NOT subtracted, so opting out of a weekend
// cannot shrink your own target.
//
// This is the fixed point of the scheduler's own balancing rule. pickJr and the
// rebalancers drive every resident toward an equal hours ÷ potential ratio k; the
// assigned hours must sum to D, so k = D / ΣP and target_r = k · P_r. A resident's
// distance from target is therefore exactly the quantity the generator is trying to
// zero out, and the targets sum to the real work rather than to a fixed constant.

export interface StoredJuniorDay {
  dateKey: string;
  res: { id: string; name?: string; pgy?: number; color?: string; person_id?: string };
  shiftHrs: number;
  isTrauma?: boolean;
}

export interface StoredSchedule {
  juniorDays?: StoredJuniorDay[];
  jrAvailDays?: Record<string, number>;
  jrWkndAvailDays?: Record<string, number>;
  jrPotentialHours?: Record<string, number>;
  jrWkndPotentialHours?: Record<string, number>;
  jrPotentialTraumaHours?: Record<string, number>;
}

// Total potential call hours for one resident in one block. Exact when the scheduler
// stored it; otherwise rebuilt from the weekday/weekend day split using the same
// 12h/24h weighting, falling back to a flat per-day average only when neither is present.
function totalPotential(
  resId: string,
  s: StoredSchedule,
): number {
  const exact = s.jrPotentialHours?.[resId];
  if (exact !== undefined) return exact;

  const avail = s.jrAvailDays?.[resId] ?? 0;
  const wknd  = s.jrWkndAvailDays?.[resId];
  if (wknd !== undefined) return wknd * 24 + Math.max(0, avail - wknd) * 12;
  return avail * LEGACY_AVG_DAY_HOURS;
}

export const zeroLine = (): EquityLine => ({ worked: 0, target: 0, potential: 0 });

export interface ResidentEquityLines {
  total: EquityLine;
  weekend: EquityLine;
  trauma: EquityLine;
}

// Rounds a set of lines for display. Applied once, after any cross-block summing.
export function roundLines(l: ResidentEquityLines): ResidentEquityLines {
  const r = (line: EquityLine): EquityLine => ({
    worked: Math.round(line.worked),
    target: Math.round(line.target),
    potential: Math.round(line.potential),
  });
  return { total: r(l.total), weekend: r(l.weekend), trauma: r(l.trauma) };
}

// Pro-rated shares for one block, keyed by resident id. Targets come back UNROUNDED —
// see the note on `share` below. Pure, so the arithmetic can be exercised directly
// against a generated schedule.
//
// Demand and worked hours are both read live from juniorDays so a chief's override is
// reflected: reassigning a day moves hours between residents but leaves the pool's
// demand unchanged, which is what keeps targets stable while worked figures move.
export function periodEquity(
  data: StoredSchedule,
  poolIds: string[],
): Record<string, ResidentEquityLines> {
  const juniorDays = data.juniorDays ?? [];

  let dTotal = 0, dWknd = 0, dTrauma = 0;
  for (const jd of juniorDays) {
    dTotal += jd.shiftHrs;
    if (isWeekendCall(jd.dateKey)) dWknd += jd.shiftHrs;
    if (TRAUMA_WEEKS.has(jd.dateKey)) dTrauma += jd.shiftHrs;
  }

  const wTotal: Record<string, number> = {};
  const wWknd: Record<string, number> = {};
  const wTrauma: Record<string, number> = {};
  for (const id of poolIds) { wTotal[id] = 0; wWknd[id] = 0; wTrauma[id] = 0; }
  for (const jd of juniorDays) {
    const id = jd.res.id;
    if (!(id in wTotal)) { wTotal[id] = 0; wWknd[id] = 0; wTrauma[id] = 0; }
    wTotal[id] += jd.shiftHrs;
    if (isWeekendCall(jd.dateKey)) wWknd[id] += jd.shiftHrs;
    if (TRAUMA_WEEKS.has(jd.dateKey)) wTrauma[id] += jd.shiftHrs;
  }

  // Weekend and trauma have no reliable reconstruction from older blobs, so when the
  // scheduler did not store them the axis is dropped for this block — for every member
  // alike, which keeps the remaining figures comparable across the pool.
  const pTotal: Record<string, number> = {};
  for (const id of poolIds) pTotal[id] = totalPotential(id, data);
  const pWknd = data.jrWkndPotentialHours;
  const pTrauma = data.jrPotentialTraumaHours;

  const sumTotal  = poolIds.reduce((s, id) => s + (pTotal[id] ?? 0), 0);
  const sumWknd   = pWknd   ? poolIds.reduce((s, id) => s + (pWknd[id]   ?? 0), 0) : 0;
  const sumTrauma = pTrauma ? poolIds.reduce((s, id) => s + (pTrauma[id] ?? 0), 0) : 0;

  // Left unrounded on purpose. Rounding here and then summing across blocks lets up to
  // half an hour of error per block accumulate into the year-to-date figure, which shows
  // up as two residents with identical availability appearing 1h apart. Callers round
  // once, at the point of display.
  const share = (demand: number, potential: number, sum: number) =>
    sum > 0 ? demand * potential / sum : 0;

  const out: Record<string, ResidentEquityLines> = {};
  for (const id of poolIds) {
    out[id] = {
      total: {
        worked: wTotal[id] ?? 0,
        target: share(dTotal, pTotal[id] ?? 0, sumTotal),
        potential: pTotal[id] ?? 0,
      },
      weekend: pWknd
        ? { worked: wWknd[id] ?? 0, target: share(dWknd, pWknd[id] ?? 0, sumWknd), potential: pWknd[id] ?? 0 }
        : zeroLine(),
      trauma: pTrauma
        ? { worked: wTrauma[id] ?? 0, target: share(dTrauma, pTrauma[id] ?? 0, sumTrauma), potential: pTrauma[id] ?? 0 }
        : zeroLine(),
    };
  }
  return out;
}

