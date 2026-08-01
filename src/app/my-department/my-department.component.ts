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
  SlotState
} from '../core/department.service';

type ViewMode = 'mark' | 'history' | 'matrix';
type AllViewMode = 'summary' | 'matrix' | 'users';

@Component({
  selector: 'app-my-department',
  templateUrl: './my-department.component.html',
  styleUrls: ['./my-department.component.css']
})
export class MyDepartmentComponent implements OnInit, OnDestroy {

  private userSub!: Subscription;
  userRole = '';

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
    private notificationService: NotificationService
  ) {}

  ngOnInit() {
    this.userSub = this.authService.user.subscribe(user => {
      this.userRole = user?.role || '';
    });
    this.loadDepartments();
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
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

    this.loadDeptInfo();
    this.loadForCurrentViewMode();
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
      next: (grid) => { this.roster = grid.roster; this.loadingRoster = false; },
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

  toggleSlot(entry: AttendanceRosterEntry, slot: 'morning' | 'afternoon' | 'night') {
    if (!this.canMark) return;
    entry[slot] = !entry[slot];
  }

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
          const confirmed = window.confirm(
            `Already marked elsewhere:\n\n${summary}\n\nOverwrite with this department's marking?`
          );

          if (confirmed) {
            this.saveAttendance(toConfirm.map(c => ({ userId: c.userId, slot: c.slot })));
            return;
          }

          this.notificationService.openErrorSnackBar('Attendance saved — conflicting slot(s) left unchanged');
          this.loadRoster();
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

  tlNames(): string {
    return this.deptInfo?.tls.map(t => t.name).join(', ') || '—';
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
