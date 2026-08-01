import { HttpClient } from "@angular/common/http";
import { Injectable } from "@angular/core";
import { environment } from "src/environments/environment.development";

export interface MyDept {
  _id: string;
  name: string;
}

export interface DeptInfo {
  _id: string;
  name: string;
  description: string;
  tls: { _id: string; name: string }[];
  volunteerCount: number;
  volunteers: { _id: string; name: string }[];
}

export interface AttendanceRosterEntry {
  userId: string;
  name: string;
  // False when this person has since transferred to a different department —
  // grandfathered in so their same-day history stays visible/editable here.
  current: boolean;
  morning: boolean;
  afternoon: boolean;
  night: boolean;
}

export interface AttendanceGrid {
  date: string;
  department: { _id: string; name: string };
  roster: AttendanceRosterEntry[];
}

// A slot someone else already claimed under a different department that day —
// returned instead of silently overwritten. Resubmit with this {userId, slot}
// pair in `overrides` to confirm reassigning it to the current department.
export interface AttendanceConflict {
  userId: string;
  slot: 'morning' | 'afternoon' | 'night';
  existingDepartment: { _id: string; name: string };
}

export interface MarkAttendanceResponse {
  date: string;
  department: string;
  records: any[];
  conflicts: AttendanceConflict[];
}

export interface AttendanceReportRow {
  userId: string;
  name: string;
  morning: number;
  afternoon: number;
  night: number;
  daysMarked: number;
}

export interface AttendanceReport {
  from: string;
  to: string;
  department: { _id: string; name: string };
  volunteers: AttendanceReportRow[];
}

export interface DeptSummaryStat {
  _id: string;
  name: string;
  volunteerCount: number;
  marked: number;
  morning: number;
  afternoon: number;
  night: number;
}

export interface DeptSummaryResponse {
  date: string;
  departments: DeptSummaryStat[];
}

export interface MyAttendanceRecord {
  date: string;
  department: { _id: string; name: string };
  morning: boolean;
  afternoon: boolean;
  night: boolean;
}

export type SlotState = 'marked' | 'unmarked' | 'null';

// Per-user, per-date, per-slot state: 'marked' (a record exists), 'unmarked'
// (applicable but nothing recorded), or 'null' (before this user's
// dateOfJoining, or after their last recorded day here if they've since
// transferred out — not applicable, don't count it either way).
export interface AttendanceMatrixCell {
  morning: SlotState;
  afternoon: SlotState;
  night: SlotState;
}

export interface AttendanceMatrixRow {
  userId: string;
  name: string;
  current: boolean;
  cells: { [date: string]: AttendanceMatrixCell };
}

export interface SlotTotals {
  morning: number;
  afternoon: number;
  night: number;
}

export interface AttendanceMatrix {
  from: string;
  to: string;
  dates: string[];
  department: { _id: string; name: string };
  users: AttendanceMatrixRow[];
  totals: { [date: string]: SlotTotals };
}

export interface SlotCount {
  marked: number;
  unmarked: number;
}

// A department-level cell: `null: true` means the department didn't exist yet
// on that date (before Department.createdAt) — the per-slot counts are then
// meaningless and should render as not-applicable rather than zero.
export interface DeptSummaryMatrixCell {
  null: boolean;
  morning: SlotCount;
  afternoon: SlotCount;
  night: SlotCount;
}

export interface DeptSummaryMatrixRow {
  _id: string;
  name: string;
  cells: { [date: string]: DeptSummaryMatrixCell };
}

export interface SlotCountTotals {
  morning: SlotCount;
  afternoon: SlotCount;
  night: SlotCount;
}

export interface DeptSummaryMatrix {
  from: string;
  to: string;
  dates: string[];
  departments: DeptSummaryMatrixRow[];
  totals: { [date: string]: SlotCountTotals };
}

// Per-user-matrix cell: same three-state semantics as AttendanceMatrixCell,
// but the department a mark belongs to can vary by date (a user may move
// mid-range), so each slot carries its own department reference — null
// unless that specific slot is 'marked'.
export interface UsersMatrixSlotCell {
  state: SlotState;
  department: { _id: string; name: string } | null;
}

export interface UsersMatrixCell {
  morning: UsersMatrixSlotCell;
  afternoon: UsersMatrixSlotCell;
  night: UsersMatrixSlotCell;
}

export interface UsersMatrixRow {
  userId: string;
  name: string;
  current: boolean;
  cells: { [date: string]: UsersMatrixCell };
}

export interface UsersMatrix {
  from: string;
  to: string;
  dates: string[];
  users: UsersMatrixRow[];
  totals: { [date: string]: SlotTotals };
}

@Injectable({ providedIn: 'root' })
export class DepartmentService {

  url = environment.URL;
  constructor(private http: HttpClient) {}

  getMyDepartments() {
    return this.http.get<MyDept[]>(this.url + '/department/mine');
  }

  getDepartmentDetail(id: string) {
    return this.http.get<DeptInfo>(this.url + '/department/' + id);
  }

  getAttendance(id: string, date: string) {
    return this.http.get<AttendanceGrid>(this.url + '/department/' + id + '/attendance', { params: { date } });
  }

  markAttendance(
    id: string,
    date: string,
    entries: { userId: string; morning: boolean; afternoon: boolean; night: boolean }[],
    overrides: { userId: string; slot: string }[] = []
  ) {
    return this.http.post<MarkAttendanceResponse>(this.url + '/department/' + id + '/attendance', { date, entries, overrides });
  }

  getAttendanceReport(id: string, from: string, to: string) {
    return this.http.get<AttendanceReport>(this.url + '/department/' + id + '/attendance/report', { params: { from, to } });
  }

  getSummary(date: string) {
    return this.http.get<DeptSummaryResponse>(this.url + '/department/summary', { params: { date } });
  }

  getMyAttendance(from?: string, to?: string) {
    const params: { [key: string]: string } = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<MyAttendanceRecord[]>(this.url + '/department/attendance/me', { params });
  }

  getAttendanceMatrix(id: string, from?: string, to?: string) {
    const params: { [key: string]: string } = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<AttendanceMatrix>(this.url + '/department/' + id + '/attendance/matrix', { params });
  }

  getSummaryMatrix(from?: string, to?: string) {
    const params: { [key: string]: string } = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<DeptSummaryMatrix>(this.url + '/department/summary/matrix', { params });
  }

  getUsersMatrix(from?: string, to?: string) {
    const params: { [key: string]: string } = {};
    if (from) params['from'] = from;
    if (to) params['to'] = to;
    return this.http.get<UsersMatrix>(this.url + '/department/summary/users-matrix', { params });
  }
}
