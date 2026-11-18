import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import {
  DepartmentService,
  MyDept,
  DeptInfo,
  AttendanceRosterEntry,
  AttendanceReportRow,
  DeptSummaryStat,
  AttendanceMatrix,
  AttendanceMatrixRow,
  AttendanceMatrixCell,
  DeptSummaryMatrix,
  DeptSummaryMatrixRow,
  DeptSummaryMatrixCell,
  UsersMatrix,
  UsersMatrixRow,
  UsersMatrixCell,
  SlotState,
  MemberRole
} from '../core/department.service';
import type { VolProfile } from '../volunteers/volunteers.model';
import { VolProfileComponent } from '../volunteers/vol-profile/vol-profile.component';
import { ConfirmationService } from '../shared/confirm-dialog/confirmation.service';
import { EventService } from '../core/event.service';
import { TaskService } from '../core/task.service';

type ViewMode = 'mark' | 'history' | 'matrix';
export type Slot = 'morning' | 'afternoon' | 'night';
/** The three slots on the Attendance tab (B-004 restyle): label + icon. */
export const SLOT_CHIPS: { slot: Slot; label: string; icon: string }[] = [
  { slot: 'morning', label: 'Morning', icon: 'wb_sunny' },
  { slot: 'afternoon', label: 'Afternoon', icon: 'wb_twilight' },
  { slot: 'night', label: 'Night', icon: 'bedtime' }
];
type AllViewMode = 'summary' | 'matrix' | 'users';

@Component({
  selector: 'app-my-department',
  templateUrl: './my-department.component.html',
  styleUrls: ['./my-department.component.css']
})
export class MyDepartmentComponent implements OnInit, OnDestroy {

  private userSub!: Subscription;
  userRole = '';
  private authUserId = '';

  departments: MyDept[] = [];
  selectedDeptId = '';
  loadingDepts = false;

  deptInfo: DeptInfo | null = null;
  loadingInfo = false;

  viewMode: ViewMode = 'mark';

  selectedDate: string = this.today();
  roster: AttendanceRosterEntry[] = [];
  loadingRoster = false;
  saving = false;
  readonly slotChips = SLOT_CHIPS;
  /** What was saved, per person, to count unsaved changes (B-004). */
  private saved = new Map<string, Record<Slot, boolean>>();

  // B-005: the department's tasks open in a slide panel; the card shows the count.
  tasksOpen = false;
  openTasks = 0;
  totalTasks = 0;
  private taskRequest = 0;

  // 2026-11-19: a member's details in a slide panel (Volunteers profile + Role)
  member: { userId: string; name: string } | null = null;
  memberProfile: VolProfile | null = null;
  roleBusy = false;
  @ViewChild(VolProfileComponent) memberView?: VolProfileComponent;
  /** "Not marked" stat: show only people with no saved slot on the picked day. */
  onlyUnmarked = false;

  reportFrom: string = this.daysAgo(30);
  reportTo: string = this.today();
  reportRows: AttendanceReportRow[] = [];
  loadingReport = false;

  allViewMode: AllViewMode = 'summary';

  summaryDate: string = this.today();
  summaryRows: DeptSummaryStat[] = [];
  loadingSummary = false;

  matrix: AttendanceMatrix | null = null;
  loadingMatrix = false;

  allMatrix: DeptSummaryMatrix | null = null;
  loadingAllMatrix = false;

  usersMatrix: UsersMatrix | null = null;
  loadingUsersMatrix = false;

  @ViewChild('deptMatrixScroll') deptMatrixScrollRef?: ElementRef<HTMLElement>;
  @ViewChild('allMatrixScroll') allMatrixScrollRef?: ElementRef<HTMLElement>;
  @ViewChild('usersMatrixScroll') usersMatrixScrollRef?: ElementRef<HTMLElement>;

  readonly topLevelRoles = ['DEV', 'DIR', 'ADMIN'];

  get isTopLevel(): boolean {
    return this.topLevelRoles.includes(this.userRole);
  }

  get isAllView(): boolean {
    return this.selectedDeptId === 'ALL';
  }

  // VOL always read-only; TL only for their own dept (guaranteed here since
  // the dropdown only ever lists a TL's own departments); DEV/DIR/ADMIN always.
  get canMark(): boolean {
    if (this.isAllView || !this.selectedDeptId) return false;
    return this.isTopLevel || this.userRole === 'TL';
  }

  constructor(
    private departmentService: DepartmentService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private confirmationService: ConfirmationService,
    private eventService: EventService,
    private taskService: TaskService
  ) {}

  /** Staff list (R2): lists and marks cover only the sidebar event's staff. */
  get staffEvent() { return this.eventService.currentActiveEvent; }
  private eventSub?: Subscription;
  private eventId: string | null = null;

  ngOnInit() {
    this.userSub = this.authService.user.subscribe(user => {
      this.userRole = user?.role || '';
      this.authUserId = user?._id || '';
    });
    this.loadDepartments();
    // Reload the current view when the sidebar event changes (not on the first value).
    this.eventSub = this.eventService.activeEvent.subscribe(ev => {
      const id = ev?._id || '';
      if (this.eventId !== null && id !== this.eventId && this.selectedDeptId) this.onDeptChange();
      this.eventId = id;
    });
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.eventSub?.unsubscribe();
  }

  loadDepartments() {
    this.loadingDepts = true;
    this.departmentService.getMyDepartments().subscribe({
      next: (depts) => {
        this.departments = depts;
        this.loadingDepts = false;

        const realDepts = depts.filter(d => d._id !== 'ALL');
        if (this.isTopLevel) {
          this.selectedDeptId = 'ALL';
        } else if (realDepts.length > 0) {
          this.selectedDeptId = realDepts[0]._id;
        }
        this.onDeptChange();
      },
      error: () => {
        this.loadingDepts = false;
        this.notificationService.openErrorSnackBar('Error loading departments');
      }
    });
  }

  onDeptChange() {
    this.deptInfo = null;
    this.roster = [];
    this.reportRows = [];
    this.summaryRows = [];
    this.matrix = null;
    this.allMatrix = null;
    this.usersMatrix = null;

    if (!this.selectedDeptId) return;

    if (this.isAllView) {
      this.loadForCurrentAllViewMode();
      return;
    }

    this.tasksOpen = false;
    this.closeMember();
    this.onlyUnmarked = false;
    this.loadDeptInfo();
    this.loadTaskCount();
    this.loadForCurrentViewMode();
    if (this.viewMode !== 'mark') this.loadRoster();   // the stat cards count the picked day
  }

  /** B-006: in the All view, a department row opens that department (and sets the dropdown). */
  openDepartment(id: string) {
    if (!this.isAllView || !this.departments.some(d => d._id === id)) return;
    this.selectedDeptId = id;
    this.onDeptChange();
  }

  /** B-005: open / all task counts for the marker on the department card. */
  async loadTaskCount() {
    const id = this.selectedDeptId;
    const req = ++this.taskRequest;
    this.openTasks = 0;
    this.totalTasks = 0;
    if (!id || this.isAllView) return;
    try {
      const tasks = await this.taskService.list(id);
      if (req !== this.taskRequest) return;
      this.totalTasks = tasks.length;
      this.openTasks = tasks.filter(t => t.status !== 'closed').length;
    } catch { /* the marker just stays at 0 */ }
  }

  get tasksLabel(): string {
    if (!this.totalTasks) return 'No tasks';
    return this.openTasks ? `Tasks · ${this.openTasks} open` : `Tasks · all ${this.totalTasks} closed`;
  }

  /** Closing the panel refreshes the marker (a status may have changed in it). */
  closeTasks() {
    this.tasksOpen = false;
    this.loadTaskCount();
  }

  loadDeptInfo() {
    this.loadingInfo = true;
    this.departmentService.getDepartmentDetail(this.selectedDeptId).subscribe({
      next: (info) => { this.deptInfo = info; this.loadingInfo = false; },
      error: () => {
        this.loadingInfo = false;
        this.notificationService.openErrorSnackBar('Error loading department details');
      }
    });
  }

  setViewMode(mode: ViewMode) {
    this.viewMode = mode;
    this.loadForCurrentViewMode();
  }

  private loadForCurrentViewMode() {
    if (this.viewMode === 'mark') {
      this.loadRoster();
    } else if (this.viewMode === 'history') {
      this.loadReport();
    } else {
      this.loadMatrix();
    }
  }

  loadRoster() {
    if (!this.selectedDeptId || this.isAllView) return;
    this.loadingRoster = true;
    this.departmentService.getAttendance(this.selectedDeptId, this.selectedDate).subscribe({
      next: (grid) => {
        this.roster = grid.roster;
        this.saved = new Map(grid.roster.map(r => [r.userId, { morning: r.morning, afternoon: r.afternoon, night: r.night }]));
        this.loadingRoster = false;
      },
      error: () => {
        this.loadingRoster = false;
        this.notificationService.openErrorSnackBar('Error loading attendance');
      }
    });
  }

  onDateChange() {
    this.loadRoster();
  }

  shiftDate(days: number) {
    const d = new Date(this.selectedDate + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + days);
    this.selectedDate = d.toISOString().substring(0, 10);
    this.loadRoster();
  }

  toggleSlot(entry: AttendanceRosterEntry, slot: Slot) {
    if (!this.canMark) return;
    entry[slot] = !entry[slot];
  }

  // ── B-004: the Attendance tab ──

  /** Mark everyone for a slot, or clear it when everyone already is. */
  markAll(slot: Slot) {
    if (!this.canMark || !this.roster.length) return;
    const all = this.roster.every(r => r[slot]);
    this.roster.forEach(r => { r[slot] = !all; });
  }
  allMarked(slot: Slot): boolean { return this.roster.length > 0 && this.roster.every(r => r[slot]); }

  /** Slots ticked or cleared since the last load / save. */
  get unsavedCount(): number {
    let n = 0;
    this.roster.forEach(r => {
      const was = this.saved.get(r.userId);
      (['morning', 'afternoon', 'night'] as Slot[]).forEach(sl => { if (!was || was[sl] !== r[sl]) n++; });
    });
    return n;
  }

  /** "2/3" at the end of a row. */
  rowCount(entry: AttendanceRosterEntry): number {
    return Number(entry.morning) + Number(entry.afternoon) + Number(entry.night);
  }

  /** The hover on a slot: who marked it and when, or what will happen on Save. */
  markTip(entry: AttendanceRosterEntry, slot: Slot): string {
    const label = SLOT_CHIPS.find(c => c.slot === slot)!.label;
    const was = this.saved.get(entry.userId)?.[slot];
    if (entry[slot] && !was) return `${label} — ticked, not saved yet`;
    if (!entry[slot] && was) return `${label} — will be cleared on Save`;
    const m = entry.marks?.[slot];
    if (entry[slot] && m) return `${label} — marked by ${m.by} · ${this.when(m.at)}`;
    return entry[slot] ? `${label} — marked` : `${label} — not marked`;
  }

  private when(iso: string): string {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  /** "Tue 18 Nov" over the date picker. */
  get dayLabel(): string {
    const d = new Date(this.selectedDate + 'T00:00:00Z');
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  }
  get isToday(): boolean { return this.selectedDate === this.today(); }
  backToToday() { this.selectedDate = this.today(); this.loadRoster(); }

  // ── redesign (2026-11-19): stat cards ──

  private hasSaved(r: AttendanceRosterEntry): boolean {
    const s = this.saved.get(r.userId);
    return !!s && (s.morning || s.afternoon || s.night);
  }
  /** People with at least one SAVED slot on the picked day (ticks count once saved). */
  get markedCount(): number { return this.roster.filter(r => this.hasSaved(r)).length; }
  get shownRoster(): AttendanceRosterEntry[] {
    return this.onlyUnmarked ? this.roster.filter(r => !this.hasSaved(r)) : this.roster;
  }
  toggleUnmarked() {
    this.onlyUnmarked = !this.onlyUnmarked;
    if (this.onlyUnmarked && this.viewMode !== 'mark') this.setViewMode('mark');
  }
  /** All view: totals over the Summary rows. */
  get allTotals(): { people: number; marked: number; unmarked: number } {
    const people = this.summaryRows.reduce((n, r) => n + (r.volunteerCount || 0), 0);
    const marked = this.summaryRows.reduce((n, r) => n + (r.marked || 0), 0);
    return { people, marked, unmarked: Math.max(0, people - marked) };
  }

  // ── a member's details (2026-11-19) ──

  /** This department's TL or a top role (the dropdown lists a TL's own departments only). */
  get canOpenMembers(): boolean { return this.canMark; }

  openMember(userId: string, name: string) {
    if (!this.canOpenMembers || !this.staffEvent) return;
    this.member = { userId, name };
    this.memberProfile = null;
  }
  closeMember() { this.member = null; this.memberProfile = null; this.roleBusy = false; }

  get memberSubtitle(): string {
    const p = this.memberProfile;
    if (!p) return this.deptInfo?.name || '';
    return p.role === 'TL' ? `Team Lead${p.teams?.length ? ' · ' + p.teams.join(', ') : ''}` : `Volunteer · ${this.deptInfo?.name || ''}`;
  }

  /** Why the Role buttons are not there. */
  roleNote(p: VolProfile): string {
    if (this.member?.userId && this.authUserId === this.member.userId) return 'You cannot change your own role.';
    return p.role === 'TL' && (p.teams?.length || 0) > 1
      ? `${p.name} leads more than one department. Change them in Admin › Users.` : '';
  }

  changeRole(to: MemberRole) {
    const m = this.member, p = this.memberProfile, ev = this.staffEvent, dept = this.selectedDeptId;
    if (!m || !p || !ev || !dept || this.roleBusy) return;
    const deptName = this.deptInfo?.name || 'this department';
    this.confirmationService.confirm({
      title: to === 'TL' ? 'Make Team Lead' : 'Make volunteer',
      message: to === 'TL'
        ? `${p.name} becomes a Team Lead of ${deptName}. They can mark attendance and manage this department's people.`
        : `${p.name} stops being a Team Lead of ${deptName} and becomes a volunteer here.`,
      confirmText: to === 'TL' ? 'Make Team Lead' : 'Make volunteer',
      danger: to === 'VOL'
    }).subscribe(async ok => {
      if (!ok || this.member?.userId !== m.userId) return;
      this.roleBusy = true;
      try {
        await this.departmentService.setMemberRole(dept, m.userId, ev._id, to);
        this.notificationService.openSucessSnackBar(to === 'TL' ? `${p.name} is now a Team Lead` : `${p.name} is now a volunteer`);
        await this.memberView?.load();
        this.loadDeptInfo();
      } catch (err: any) {
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not change the role');
      } finally {
        this.roleBusy = false;
      }
    });
  }

  trackRoster = (_: number, r: AttendanceRosterEntry) => r.userId;
  trackSlot = (_: number, c: { slot: Slot }) => c.slot;

  saveAttendance(overrides: { userId: string; slot: string }[] = []) {
    if (!this.canMark || !this.selectedDeptId) return;
    this.saving = true;
    const entries = this.roster.map(r => ({
      userId: r.userId, morning: r.morning, afternoon: r.afternoon, night: r.night
    }));
    this.departmentService.markAttendance(this.selectedDeptId, this.selectedDate, entries, overrides).subscribe({
      next: (res) => {
        this.saving = false;

        if (res?.conflicts?.length) {
          // Someone was already marked in a different department for that
          // exact slot that day — ask before reassigning it to this one.
          const toConfirm = res.conflicts.map(c => ({
            userId: c.userId,
            slot: c.slot,
            name: this.roster.find(r => r.userId === c.userId)?.name || 'This person',
            deptName: c.existingDepartment?.name || 'another department'
          }));
          const summary = toConfirm.map(c => `${c.name} — ${c.slot} (already marked by ${c.deptName})`).join('\n');
          this.confirmationService.confirm({
            title: 'Overwrite attendance',
            message: `Already marked elsewhere:\n\n${summary}\n\nOverwrite with this department's marking?`,
            confirmText: 'Overwrite',
            danger: true,
          }).subscribe(confirmed => {
            if (confirmed) {
              this.saveAttendance(toConfirm.map(c => ({ userId: c.userId, slot: c.slot })));
              return;
            }

            this.notificationService.openErrorSnackBar('Attendance saved — conflicting slot(s) left unchanged');
            this.loadRoster();
          });
          return;
        }

        this.notificationService.openSucessSnackBar('Attendance saved');
        this.loadRoster();
      },
      error: () => {
        this.saving = false;
        this.notificationService.openErrorSnackBar('Error saving attendance');
      }
    });
  }

  loadReport() {
    if (!this.selectedDeptId || this.isAllView) return;
    this.loadingReport = true;
    this.departmentService.getAttendanceReport(this.selectedDeptId, this.reportFrom, this.reportTo).subscribe({
      next: (report) => { this.reportRows = report.volunteers; this.loadingReport = false; },
      error: () => {
        this.loadingReport = false;
        this.notificationService.openErrorSnackBar('Error loading attendance report');
      }
    });
  }

  setAllViewMode(mode: AllViewMode) {
    this.allViewMode = mode;
    this.loadForCurrentAllViewMode();
  }

  private loadForCurrentAllViewMode() {
    if (this.allViewMode === 'summary') {
      this.loadSummary();
    } else if (this.allViewMode === 'matrix') {
      this.loadAllMatrix();
    } else {
      this.loadUsersMatrix();
    }
  }

  loadSummary() {
    this.loadingSummary = true;
    this.departmentService.getSummary(this.summaryDate).subscribe({
      next: (res) => { this.summaryRows = res.departments; this.loadingSummary = false; },
      error: () => {
        this.loadingSummary = false;
        this.notificationService.openErrorSnackBar('Error loading summary');
      }
    });
  }

  // Cross-department, per-user history — every attendance-tracked user
  // across every department, from earliest known activity through today.
  loadUsersMatrix() {
    this.loadingUsersMatrix = true;
    this.departmentService.getUsersMatrix().subscribe({
      next: (matrix) => {
        this.usersMatrix = matrix;
        this.loadingUsersMatrix = false;
        this.scrollToEnd(() => this.usersMatrixScrollRef);
      },
      error: () => {
        this.loadingUsersMatrix = false;
        this.notificationService.openErrorSnackBar('Error loading user attendance history');
      }
    });
  }

  // ALL view calendar: every department x every date from the earliest
  // attendance-tracked member's date of joining (across all departments) through today.
  loadAllMatrix() {
    this.loadingAllMatrix = true;
    this.departmentService.getSummaryMatrix().subscribe({
      next: (matrix) => {
        this.allMatrix = matrix;
        this.loadingAllMatrix = false;
        this.scrollToEnd(() => this.allMatrixScrollRef);
      },
      error: () => {
        this.loadingAllMatrix = false;
        this.notificationService.openErrorSnackBar('Error loading attendance calendar');
      }
    });
  }

  // Whole-department view: users x every date from the earliest current
  // member's date of joining through today.
  loadMatrix() {
    if (!this.selectedDeptId || this.isAllView) return;
    this.loadingMatrix = true;
    this.departmentService.getAttendanceMatrix(this.selectedDeptId).subscribe({
      next: (matrix) => {
        this.matrix = matrix;
        this.loadingMatrix = false;
        this.scrollToEnd(() => this.deptMatrixScrollRef);
      },
      error: () => {
        this.loadingMatrix = false;
        this.notificationService.openErrorSnackBar('Error loading attendance calendar');
      }
    });
  }

  // Defaults every Calendar/history table scrolled fully right, so today
  // (the most relevant column) is visible without the user having to drag
  // the scrollbar themselves. Deferred a tick so the *ngIf-gated table has
  // actually rendered (and its columns laid out) before we measure scrollWidth.
  private scrollToEnd(getRef: () => ElementRef<HTMLElement> | undefined) {
    setTimeout(() => {
      const el = getRef()?.nativeElement;
      if (el) el.scrollLeft = el.scrollWidth;
    });
  }

  matrixCell(row: AttendanceMatrixRow, date: string): AttendanceMatrixCell {
    return row.cells[date] || { morning: 'null', afternoon: 'null', night: 'null' };
  }

  allMatrixCell(row: DeptSummaryMatrixRow, date: string): DeptSummaryMatrixCell {
    return row.cells[date] || { null: true, morning: { marked: 0, unmarked: 0 }, afternoon: { marked: 0, unmarked: 0 }, night: { marked: 0, unmarked: 0 } };
  }

  dotClass(state: SlotState): string {
    return 'dot-' + state;
  }

  usersMatrixCell(row: UsersMatrixRow, date: string): UsersMatrixCell {
    return row.cells[date] || {
      morning: { state: 'null', department: null },
      afternoon: { state: 'null', department: null },
      night: { state: 'null', department: null }
    };
  }

  slotTooltip(slotLabel: string, cell: { state: SlotState; department: { name: string } | null }): string {
    if (cell.state === 'marked') return `${slotLabel} — marked (${cell.department?.name || 'unknown dept'})`;
    if (cell.state === 'unmarked') return `${slotLabel} — unmarked`;
    return `${slotLabel} — not applicable`;
  }

  formatDateHeader(date: string): string {
    const d = new Date(date + 'T00:00:00Z');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  private today(): string {
    return new Date().toISOString().substring(0, 10);
  }

  private daysAgo(n: number): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - n);
    return d.toISOString().substring(0, 10);
  }
}
