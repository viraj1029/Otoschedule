// ─── Core domain types ────────────────────────────────────────────────────────

export interface Block {
  id: string;
  name: string;
  start_date: string; // YYYY-MM-DD
  end_date: string;   // YYYY-MM-DD
  published: boolean;
  created_at?: string;
  // chief_password is never sent to the client
}

export interface Resident {
  id: string;
  block_id: string;
  name: string;
  pgy: number;
  hospital: 'CUH' | 'PMH';
  status: 'active' | 'research' | 'away';
  pin: string;
  color: string;
  sort_order: number;
}

export interface Request {
  id: string;
  resident_id: string;
  block_id: string;
  date: string; // YYYY-MM-DD
  type: 'vacation' | 'weekend' | 'holiday';
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
}

// ─── Session / auth ───────────────────────────────────────────────────────────

export type Role = 'chief' | 'resident';

export interface SessionData {
  role?: Role;
  residentId?: string;
  blockId?: string;
}

// ─── App UI state ─────────────────────────────────────────────────────────────

export type Step = 1 | 2 | 3 | 4;
export type Tab = 'calendar' | 'senior' | 'junior' | 'hours' | 'equity';
