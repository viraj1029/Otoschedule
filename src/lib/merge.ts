// Combine two or more saved schedules of the same type into a single schedule
// spanning the full date range — e.g. a July junior schedule + an Aug/Sep junior
// schedule viewed as one Jul–Sep schedule with cumulative equity metrics.
//
// The merge is a snapshot: assignments are copied out of the sources, so later
// edits to a source schedule are not reflected in a combined schedule already built.
//
// Two rules keep the aggregate numbers honest:
//   • Sources must not overlap in time — otherwise the per-resident potential-hours
//     denominators (jrPotentialHours & friends) would be counted twice.
//   • Everything copied out of a source is clipped to that source's own date window,
//     so a senior week that runs past the end of its block cannot bleed into the
//     next source's period and double-count days.

import type {
  AnyScheduleData, ScheduleData, CMCScheduleData, VAScheduleData,
  MergedSource, Resident, SeniorWeek, JuniorDay, ResBkpWeek, ResBkpDay,
  CMCDay, VAWeek,
} from '@/types';

export interface MergeSource {
  id: string;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  data: AnyScheduleData;
}

export interface MergeResult {
  data: AnyScheduleData;
  warnings: string[];
}

export type ScheduleTypeKey = 'cuh_pmh' | 'cmc' | 'va';

export function scheduleTypeOf(d: AnyScheduleData): ScheduleTypeKey {
  return d.type === 'cmc' ? 'cmc' : d.type === 'va' ? 'va' : 'cuh_pmh';
}

// ─── Small helpers ────────────────────────────────────────────────────────────
// All dates are YYYY-MM-DD, so plain string comparison is chronological.

interface Prepared extends MergeSource {
  bStart: string;
  bEnd: string;
}

function within(key: string, s: Prepared) {
  return key >= s.bStart && key <= s.bEnd;
}

function sumInto(target: Record<string, number>, src: Record<string, number> | undefined, idMap: Record<string, string>) {
  if (!src) return;
  for (const [k, v] of Object.entries(src)) {
    const key = idMap[k] ?? k;
    target[key] = (target[key] ?? 0) + (v ?? 0);
  }
}

/** Sum a numeric map across sources; undefined when no source defines it. */
function sumMaps(
  sources: Prepared[],
  pick: (d: AnyScheduleData) => Record<string, number> | undefined,
  idMap: Record<string, string>,
): Record<string, number> | undefined {
  if (!sources.some((s) => pick(s.data))) return undefined;
  const out: Record<string, number> = {};
  sources.forEach((s) => sumInto(out, pick(s.data), idMap));
  return out;
}

function remapRes<T extends Resident>(res: T, idMap: Record<string, string>): T {
  const to = idMap[res.id];
  return to && to !== res.id ? { ...res, id: to } : res;
}

function fmtDay(d: string) {
  const M = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, day] = d.split('-');
  return `${M[Number(m) - 1]} ${Number(day)}, ${y}`;
}

/** Every resident object referenced anywhere in a schedule. */
function residentsIn(d: AnyScheduleData): Resident[] {
  const out: Resident[] = [];
  if (d.type === 'cmc') {
    d.days.forEach((x) => out.push(x.res));
  } else if (d.type === 'va') {
    d.weeks.forEach((w) => out.push(w.res));
    Object.values(d.dayOverrides ?? {}).forEach((r) => out.push(r));
  } else {
    d.juniorDays.forEach((x) => { out.push(x.res); if (x.cuhRounder) out.push(x.cuhRounder); });
    d.seniorWeeks.forEach((w) => out.push(w.res));
    d.resBkpWeeks.forEach((w) => out.push(w.res));
    d.resBkpDays.forEach((x) => out.push(x.res));
  }
  return out;
}

/**
 * Residents are stored per block assignment, so the same person can carry a
 * different resident id in each source (e.g. the roster was edited between
 * generations). person_id is stable, so build id → canonical-id using the
 * newest source's ids; without it the combined equity bars would split one
 * person across two rows.
 */
function buildIdMap(sources: Prepared[]): Record<string, string> {
  const canonical: Record<string, string> = {}; // person_id → resident id (latest source wins)
  const idToPerson: Record<string, string> = {};
  for (const s of sources) {
    for (const r of residentsIn(s.data)) {
      if (!r?.person_id) continue;
      idToPerson[r.id] = r.person_id;
      canonical[r.person_id] = r.id;
    }
  }
  const map: Record<string, string> = {};
  for (const [id, person] of Object.entries(idToPerson)) {
    const target = canonical[person];
    if (target && target !== id) map[id] = target;
  }
  return map;
}

/** Flattened provenance — merging a combined schedule keeps the original periods. */
function provenance(sources: Prepared[]): MergedSource[] {
  return sources.flatMap((s) =>
    (s.data.mergedFrom?.length
      ? s.data.mergedFrom
      : [{ id: s.id, name: s.name, bStart: s.bStart, bEnd: s.bEnd }]),
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function mergeSchedules(sources: MergeSource[], name: string): MergeResult {
  if (sources.length < 2) {
    throw new Error('Select at least two schedules to combine');
  }

  const prepared: Prepared[] = sources
    .map((s) => ({
      ...s,
      bStart: s.data.bStart || s.start_date || '',
      bEnd: s.data.bEnd || s.end_date || '',
    }))
    .sort((a, b) => a.bStart.localeCompare(b.bStart));

  for (const s of prepared) {
    if (!s.bStart || !s.bEnd) throw new Error(`"${s.name}" has no date range and cannot be combined`);
    if (s.bStart > s.bEnd) throw new Error(`"${s.name}" ends before it starts`);
  }

  const type = scheduleTypeOf(prepared[0].data);
  const mismatch = prepared.find((s) => scheduleTypeOf(s.data) !== type);
  if (mismatch) {
    throw new Error(`Can only combine schedules of the same type — "${mismatch.name}" is not a ${type.replace('_', '/').toUpperCase()} schedule`);
  }

  const warnings: string[] = [];
  for (let i = 1; i < prepared.length; i++) {
    const prev = prepared[i - 1];
    const cur = prepared[i];
    if (cur.bStart <= prev.bEnd) {
      throw new Error(
        `"${prev.name}" and "${cur.name}" overlap (${fmtDay(cur.bStart)} → ${fmtDay(prev.bEnd)}). ` +
        'Overlapping periods would double-count call hours, so they cannot be combined.',
      );
    }
    const gapStart = nextDay(prev.bEnd);
    if (gapStart < cur.bStart) {
      warnings.push(`No coverage between ${fmtDay(gapStart)} and ${fmtDay(prevDay(cur.bStart))} — that gap is not part of any selected schedule.`);
    }
  }

  const idMap = buildIdMap(prepared);
  const bStart = prepared[0].bStart;
  const bEnd = prepared[prepared.length - 1].bEnd;
  const mergedFrom = provenance(prepared);

  const data =
    type === 'cmc' ? mergeCMC(prepared, name, bStart, bEnd, mergedFrom, idMap)
    : type === 'va' ? mergeVA(prepared, name, bStart, bEnd, mergedFrom, idMap)
    : mergeCuhPmh(prepared, name, bStart, bEnd, mergedFrom, idMap);

  return { data, warnings };
}

function nextDay(d: string) {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() + 1);
  return dt.toISOString().slice(0, 10);
}
function prevDay(d: string) {
  const dt = new Date(d + 'T12:00:00');
  dt.setDate(dt.getDate() - 1);
  return dt.toISOString().slice(0, 10);
}

// ─── CUH/PMH ──────────────────────────────────────────────────────────────────

function mergeCuhPmh(
  sources: Prepared[], name: string, bStart: string, bEnd: string,
  mergedFrom: MergedSource[], idMap: Record<string, string>,
): ScheduleData {
  const juniorDays: JuniorDay[] = [];
  const seenDay = new Set<string>();
  const seniorWeeks: SeniorWeek[] = [];
  const resBkpWeeks: ResBkpWeek[] = [];
  const resBkpDays: ResBkpDay[] = [];
  const resBkpWeekDates = new Set<string>();
  const resBkpDayKeys = new Set<string>();
  const roundingOverrides: NonNullable<ScheduleData['roundingOverrides']> = {};

  for (const s of sources) {
    const d = s.data as ScheduleData;

    for (const jd of d.juniorDays ?? []) {
      if (!within(jd.dateKey, s) || seenDay.has(jd.dateKey)) continue;
      seenDay.add(jd.dateKey);
      juniorDays.push({
        ...jd,
        res: remapRes(jd.res, idMap),
        cuhRounder: jd.cuhRounder ? remapRes(jd.cuhRounder, idMap) : null,
      });
    }

    for (const w of d.seniorWeeks ?? []) {
      const wS = w.wS < s.bStart ? s.bStart : w.wS;
      const wE = w.wE > s.bEnd ? s.bEnd : w.wE;
      if (wS > wE) continue;
      seniorWeeks.push({ ...w, wS, wE, res: remapRes(w.res, idMap) });
    }

    for (const w of d.resBkpWeeks ?? []) {
      const wS = w.wS < s.bStart ? s.bStart : w.wS;
      const wE = w.wE > s.bEnd ? s.bEnd : w.wE;
      if (wS > wE) continue;
      resBkpWeeks.push({ ...w, wS, wE, res: remapRes(w.res, idMap) });
    }

    for (const rd of d.resBkpDays ?? []) {
      if (!within(rd.dateKey, s)) continue;
      resBkpDays.push({ ...rd, res: remapRes(rd.res, idMap) });
    }
    (d.resBkpWeekDates ?? []).forEach((k) => { if (within(k, s)) resBkpWeekDates.add(k); });
    (d.resBkpDayKeys ?? []).forEach((k) => { if (within(k, s)) resBkpDayKeys.add(k); });

    for (const [k, v] of Object.entries(d.roundingOverrides ?? {})) {
      if (within(k, s)) roundingOverrides[k] = v;
    }
  }

  juniorDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  seniorWeeks.sort((a, b) => a.wS.localeCompare(b.wS));
  resBkpWeeks.sort((a, b) => a.wS.localeCompare(b.wS));
  resBkpDays.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  const pick = (k: keyof ScheduleData) =>
    (d: AnyScheduleData) => (d as ScheduleData)[k] as unknown as Record<string, number> | undefined;

  return {
    type: 'cuh_pmh',
    bStart,
    bEnd,
    blockName: name,
    seniorWeeks,
    juniorDays,
    resBkpWeeks,
    resBkpDays,
    resBkpWeekDates: [...resBkpWeekDates].sort(),
    resBkpDayKeys: [...resBkpDayKeys].sort(),
    srC: sumMaps(sources, pick('srC'), idMap) ?? {},
    jrC: sumMaps(sources, pick('jrC'), idMap) ?? {},
    jrH: sumMaps(sources, pick('jrH'), idMap) ?? {},
    jrHwknd: sumMaps(sources, pick('jrHwknd'), idMap),
    jrTH: sumMaps(sources, pick('jrTH'), idMap),
    jrTHwknd: sumMaps(sources, pick('jrTHwknd'), idMap),
    jrTHwkday: sumMaps(sources, pick('jrTHwkday'), idMap),
    jrTD: sumMaps(sources, pick('jrTD'), idMap),
    jrAvailDays: sumMaps(sources, pick('jrAvailDays'), idMap),
    jrWkndAvailDays: sumMaps(sources, pick('jrWkndAvailDays'), idMap),
    jrWkndPotentialHours: sumMaps(sources, pick('jrWkndPotentialHours'), idMap),
    jrPotentialHours: sumMaps(sources, pick('jrPotentialHours'), idMap),
    jrPotentialTraumaHours: sumMaps(sources, pick('jrPotentialTraumaHours'), idMap),
    roundingOverrides: Object.keys(roundingOverrides).length ? roundingOverrides : undefined,
    published: false,
    mergedFrom,
  };
}

// ─── CMC ──────────────────────────────────────────────────────────────────────

function mergeCMC(
  sources: Prepared[], name: string, bStart: string, bEnd: string,
  mergedFrom: MergedSource[], idMap: Record<string, string>,
): CMCScheduleData {
  const days: CMCDay[] = [];
  const seen = new Set<string>();

  for (const s of sources) {
    for (const day of (s.data as CMCScheduleData).days ?? []) {
      if (!within(day.dateKey, s) || seen.has(day.dateKey)) continue;
      seen.add(day.dateKey);
      days.push({ ...day, res: remapRes(day.res, idMap) });
    }
  }
  days.sort((a, b) => a.dateKey.localeCompare(b.dateKey));

  return {
    type: 'cmc',
    bStart,
    bEnd,
    blockName: name,
    days,
    counts: sumMaps(sources, (d) => (d as CMCScheduleData).counts, idMap) ?? {},
    hours: sumMaps(sources, (d) => (d as CMCScheduleData).hours, idMap) ?? {},
    published: false,
    mergedFrom,
  };
}

// ─── VA ───────────────────────────────────────────────────────────────────────

function mergeVA(
  sources: Prepared[], name: string, bStart: string, bEnd: string,
  mergedFrom: MergedSource[], idMap: Record<string, string>,
): VAScheduleData {
  const weeks: VAWeek[] = [];
  const dayOverrides: Record<string, Resident> = {};

  for (const s of sources) {
    const d = s.data as VAScheduleData;
    for (const w of d.weeks ?? []) {
      const wS = w.wS < s.bStart ? s.bStart : w.wS;
      const wE = w.wE > s.bEnd ? s.bEnd : w.wE;
      if (wS > wE) continue;
      weeks.push({ ...w, wS, wE, res: remapRes(w.res, idMap) });
    }
    for (const [k, res] of Object.entries(d.dayOverrides ?? {})) {
      if (within(k, s)) dayOverrides[k] = remapRes(res, idMap);
    }
  }
  weeks.sort((a, b) => a.wS.localeCompare(b.wS));

  return {
    type: 'va',
    bStart,
    bEnd,
    blockName: name,
    weeks,
    dayOverrides,
    counts: sumMaps(sources, (d) => (d as VAScheduleData).counts, idMap) ?? {},
    days: sumMaps(sources, (d) => (d as VAScheduleData).days, idMap) ?? {},
    hours: sumMaps(sources, (d) => (d as VAScheduleData).hours, idMap) ?? {},
    published: false,
    mergedFrom,
  };
}
