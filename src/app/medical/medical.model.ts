/** Medical Desk (MEDICAL_CONTEXT.md, release 1). Same shapes as big-api routers/medical.js. */
export type PatientKind = 'participant' | 'staff' | 'walkin';
export type Severity = 'minor' | 'moderate' | 'serious';
export type Outcome = 'returned' | 'resting' | 'referred' | 'ambulance';
export type Gender = 'Male' | 'Female' | 'Prefer not to say';

export interface MedicalAccess {
  canUse: boolean;
  canManage: boolean;
  canAudit: boolean;
  canExport: boolean;
  /** Outside production every email goes only to a tester address. */
  safeMode?: boolean;
  locked: boolean;
  lockMinutes: number;
}

export interface Guardian { name: string; phone: string; contacted: boolean; }

export interface MedicalPatient {
  _id: string;
  event: string;
  kind: PatientKind;
  pass?: string;
  user?: string;
  name: string;
  phone: string;
  email: string;
  age: number | null;
  gender: Gender | null;
  guardian: Guardian;
  allergies: string;
  conditions: string;
  visitCount: number;
  lastVisitAt: string | null;
  lastComplaint: string;
  lastSeverity: Severity | null;
  lastOutcome: Outcome | null;
  restingNow: boolean;
  followUpDue: string | null;
  createdAt: string;
}

export interface Medicine { name: string; dose: string; qty: string; }

export interface Vitals {
  temperature: number | null;
  pulse: number | null;
  bpSys: number | null;
  bpDia: number | null;
  spo2: number | null;
}

export interface FollowUp { needed: boolean; at: string | null; note: string; done: boolean; }

export interface Named { _id: string; name: string; }

export interface MedicalVisit {
  _id: string;
  patient: string;
  at: string;
  attendedBy: Named;
  createdBy: Named;
  alsoAttended: string;
  complaint: string;
  diagnosis: string;
  medicines: Medicine[];
  notes: string;
  vitals: Vitals;
  severity: Severity;
  outcome: Outcome;
  hospital: string;
  leftAt: string | null;
  followUp: FollowUp;
  edits: { by: Named; at: string }[];
  createdAt: string;
  canEdit: boolean;
  canDelete: boolean;
}

export interface VisitInput {
  at?: string;
  alsoAttended: string;
  complaint: string;
  diagnosis: string;
  medicines: Medicine[];
  notes: string;
  vitals: Vitals;
  severity: Severity | null;
  outcome: Outcome | null;
  hospital: string;
  followUp: FollowUp;
}

export interface PatientHeaderInput {
  name?: string;
  phone?: string;
  email?: string;
  age?: number | null;
  gender?: Gender | null;
  guardian?: Guardian;
  allergies?: string;
  conditions?: string;
}

export interface FoundPerson {
  kind: PatientKind;
  passId?: string;
  userId?: string;
  name: string;
  detail: string;
  reportId: string | null;
}

export interface PatientReport {
  patient: MedicalPatient;
  event: Named;
  visits: MedicalVisit[];
  can: { manage: boolean; audit: boolean };
}

export interface RecordCounts {
  patients: number;
  visitsToday: number;
  restingNow: number;
  followUpsDue: number;
  serious: number;
}

export interface RecordsPage {
  patients: MedicalPatient[];
  total: number;
  page: number;
  pageSize: number;
  counts: RecordCounts;
}

export interface RecordFilters {
  q?: string;
  type?: PatientKind | '';
  severity?: Severity | '';
  outcome?: Outcome | '';
  from?: string;
  to?: string;
  resting?: boolean;
  followUp?: boolean;
  page?: number;
}

export interface AuditEntry {
  _id: string;
  user: Named | null;
  action: string;
  patientName: string;
  at: string;
}

export interface Tally { label: string; n: number; }

export interface DayReport {
  date: string;
  days: string[];
  visits: number;
  patients: number;
  newPatients: number;
  byType: Record<PatientKind, number>;
  bySeverity: Record<Severity, number>;
  byOutcome: Record<Outcome, number>;
  complaints: Tally[];
  medicines: Tally[];
  byHour: number[];
  referrals: { patientId: string | null; name: string; at: string; outcome: Outcome; hospital: string; severity: Severity }[];
}

export type ExportRow = Record<string, string | number>;

export interface Choice<T> { value: T; label: string; icon: string; hint: string; }

export const SEVERITIES: Choice<Severity>[] = [
  { value: 'minor', label: 'Minor', icon: 'healing', hint: 'First aid' },
  { value: 'moderate', label: 'Moderate', icon: 'medication', hint: 'Treated, watch' },
  { value: 'serious', label: 'Serious', icon: 'emergency', hint: 'Urgent care' },
];

export const OUTCOMES: Choice<Outcome>[] = [
  { value: 'returned', label: 'Back to festival', icon: 'directions_walk', hint: 'Left after care' },
  { value: 'resting', label: 'Resting here', icon: 'airline_seat_flat', hint: 'In the Medical camp' },
  { value: 'referred', label: 'Referred', icon: 'local_hospital', hint: 'To a hospital' },
  { value: 'ambulance', label: 'Ambulance', icon: 'ambulance', hint: 'Taken by ambulance' },
];

export const KIND_LABEL: Record<PatientKind, string> = { participant: 'Participant', staff: 'Staff', walkin: 'Walk-in' };
export const SEVERITY_LABEL: Record<Severity, string> = { minor: 'Minor', moderate: 'Moderate', serious: 'Serious' };
export const SEVERITY_BADGE: Record<Severity, string> = { minor: 'bg', moderate: 'ba', serious: 'br' };
export const OUTCOME_LABEL: Record<Outcome, string> = { returned: 'Back to festival', resting: 'Resting here', referred: 'Referred', ambulance: 'Ambulance' };
export const GENDERS: Gender[] = ['Male', 'Female', 'Prefer not to say'];

export const AUDIT_LABEL: Record<string, string> = {
  unlock: 'Unlocked the Medical Desk', unlock_failed: 'Wrong password', view_list: 'Opened the records list',
  view_report: 'Opened the report', create_report: 'Opened a new report', update_report: 'Changed the report details',
  delete_report: 'Deleted the report', create_visit: 'Recorded a visit', update_visit: 'Changed a visit',
  delete_visit: 'Deleted a visit', mark_left: 'Marked left the camp', follow_up_done: 'Marked a follow-up done'
};

/** A patient is a minor below this age: guardian details are asked for. */
export const ADULT_AGE = 18;
