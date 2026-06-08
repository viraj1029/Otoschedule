// ─── Core domain types ────────────────────────────────────────────────────────

export interface Block {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD — academic year start (Jul 1)
  end_date: string;   // YYYY-MM-DD — academic year end (Jun 30)
  published: boolean; // true if any sub-schedule is published
  created_at?: string;
  // chief_password is never sent to the client
}

export interface Schedule {
  id: string;
  block_id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  published: boolean;
  generated_at?: string;
}

export type Hospital = 'CUH' | 'PMH' | 'CMC' | 'VA' | 'Research';

export interface Rotation {
  id: string;
  resident_id: string;
  hospital: Hospital;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
}

export interface Resident {
  id: string;
  person_id?: string;    // links to global persons table
  block_id: string;
  name: string;
  pgy: number;
  hospital: Hospital;   // primary / legacy hospital field
  status: 'active' | 'research' | 'away';
  pin: string;
  color: string;
  sort_order: number;
  rotation_start?: string | null;  // legacy — superseded by rotations[]
  rotation_end?: string | null;    // legacy — superseded by rotations[]
  rotations?: Rotation[];          // rotation segments from the rotations table
}

export interface Request {
  id: string;
  resident_id: string;
  block_id: string;
  date: string; // YYYY-MM-DD
  type: 'vacation' | 'vacation_official' | 'weekend' | 'holiday';
  created_at?: string;
}

// ─── Schedule types ───────────────────────────────────────────────────────────

export interface SeniorWeek {
  wS: string; // YYYY-MM-DD
  wE: string; // YYYY-MM-DD
  res: Resident;
  isBackup: boolean;
  override: boolean;
}

export type JuniorDayType =
  | 'weekday'
  | 'fri-pair'
  | 'sun-pair'
  | 'saturday'
  | 'sunday';

export interface JuniorDay {
  dateKey: string; // YYYY-MM-DD
  res: Resident;
  shiftHrs: number;
  type: JuniorDayType;
  paired: boolean;
  cuhRounder: Resident | null;
  isWeekend: boolean;
  isTrauma: boolean;   // true when date falls in a trauma week
  override: boolean;
}

export interface ResBkpWeek {
  wS: string;
  wE: string;
  res: Resident;
  isBackup: boolean;
}

export interface ResBkpDay {
  dateKey: string;
  res: Resident;
  isBackup: boolean;
}

export interface ScheduleData {
  type?: 'cuh_pmh';  // undefined = legacy CUH/PMH schedule
  bStart: string;
  bEnd: string;
  blockName: string;
  seniorWeeks: SeniorWeek[];
  juniorDays: JuniorDay[];
  resBkpWeeks: ResBkpWeek[];
  resBkpDays: ResBkpDay[];
  resBkpWeekDates: string[];
  resBkpDayKeys: string[];
  srC: Record<string, number>;
  jrC: Record<string, number>;
  jrH: Record<string, number>;
  published: boolean;
  roundingOverrides?: Record<string, { cuhResId?: string | null; pmhResId?: string | null }>;
  jrTH?: Record<string, number>;
  jrTHwknd?: Record<string, number>;
  jrTHwkday?: Record<string, number>;
  jrTD?: Record<string, number>;
  jrAvailDays?: Record<string, number>;
  _scheduleId?: string;  // injected by GET /api/schedule
}

// ─── CMC schedule types ───────────────────────────────────────────────────────

export interface CMCDay {
  dateKey: string;
  res: Resident;
  shiftHrs: number;
  isPowerWeekend: boolean;  // true for Fri/Sat/Sun power weekend
  override: boolean;
}

export interface CMCScheduleData {
  type: 'cmc';
  bStart: string;
  bEnd: string;
  blockName: string;
  days: CMCDay[];
  counts: Record<string, number>;  // call days per resident
  hours: Record<string, number>;   // call hours per resident
  published: boolean;
  _scheduleId?: string;
}

// ─── VA schedule types ────────────────────────────────────────────────────────

export interface VAWeek {
  wS: string;
  wE: string;
  res: Resident;
  override: boolean;
}

export interface VAScheduleData {
  type: 'va';
  bStart: string;
  bEnd: string;
  blockName: string;
  weeks: VAWeek[];
  counts: Record<string, number>;  // call weeks per resident
  days: Record<string, number>;    // call days per resident
  hours: Record<string, number>;   // call hours per resident
  published: boolean;
  _scheduleId?: string;
}

export type AnyScheduleData = ScheduleData | CMCScheduleData | VAScheduleData;

// ─── Session / auth ───────────────────────────────────────────────────────────

export type Role = 'chief' | 'resident';

export interface SessionData {
  role?: Role;
  residentId?: string;  // block-assignment ID
  personId?: string;    // global person ID
  blockId?: string;
}

// ─── App UI state ─────────────────────────────────────────────────────────────

export type Step = 1 | 2 | 3 | 4;
export type Tab = 'calendar' | 'senior' | 'junior' | 'hours' | 'equity' | 'stats';
