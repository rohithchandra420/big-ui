import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { BulkUsersComponent } from './bulk-users/bulk-users.component';
import { Subscription } from 'rxjs';

import { AdminService, UserDeleteCheck } from '../admin.service';
import { User } from '../../core/user.model';
import { NotificationService } from '../../core/notification.service';
import { AuthService } from 'src/app/core/auth.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { ConfirmDialogData } from '../../shared/confirm-dialog/confirm-dialog.component';
import { AvatarService } from '../../core/avatar.service';
import { EventService } from '../../core/event.service';
import { StaffBandInfo, StaffBandService } from '../../core/staff-band.service';

type UserStatFilter = 'admins' | 'leads' | 'volunteers' | 'noDept' | null;
export type UserStatusFilter = 'active' | 'deactivated' | 'all';
/** Staff list filter for the event picked in the sidebar (STAFF_LIST_CONTEXT.md). */
export type StaffFilter = '' | 'on' | 'off';
type PanelMode = 'view' | 'edit' | 'create';

const TOP_LEVEL_ROLES = ['DEV', 'DIR', 'ADMIN'];
// Display order for the Role filter; anything unexpected sorts after these.
const ROLE_ORDER = ['DEV', 'DIR', 'ADMIN', 'TL', 'VOL'];

/**
 * Users page — Bookings-style layout: summary stat cards (tap to filter),
 * search + Role/Department filters, paged table, and a right-side panel that
 * shows the user's details first, with Edit/Delete (or Reactivate) actions.
 *
 * Access: DEV/DIR/ADMIN see and manage everyone; TL sees and edits only their
 * own department (enforced server-side too). Deactivated users are returned
 * by the backend to DEV/DIR only, and only show under the Deactivated card.
 */
@Component({
  selector: 'app-user-registery',
  templateUrl: './user-registery.component.html',
  styleUrls: ['./user-registery.component.css']
})
export class UserRegisteryComponent implements OnInit, OnDestroy {

  private userSub!: Subscription;
  user: User | null = null;
  userRole = '';

  users: any[] = [];
  loading = false;

  // Fed to the create/edit form — TL only gets their own department
  roles: { _id: string; name: string }[] = [];
  departments: { _id: string; name: string; key?: string }[] = [];

  activeFilter: UserStatFilter = null;
  /** DEV/DIR only (nobody else is sent deactivated users). Driven by both the
   *  Status dropdown and the Deactivated stat card, so the two always agree. */
  statusFilter: UserStatusFilter = 'active';
  searchTerm = '';
  roleFilter = '';
  deptFilter = '';
  /** Opens on "On <event>" (user, 2026-11-07). */
  staffFilter: StaffFilter = 'on';

  /** Staff list: ids picked with the row check boxes (DEV/DIR/ADMIN). */
  selectedIds = new Set<string>();
  staffBusy = false;
  private eventSub?: Subscription;
  /** The event the loaded `onEvent` flags belong to. */
  private staffEventId = '';

  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [20, 50, 100];

  panelOpen = false;
  panelMode: PanelMode = 'view';
  activeUser: any = null;
  removing = false;
  photoBusy = false;

  /** H5: the panel user's wrist band for the event picked in the sidebar (null = not allowed / not loaded). */
  band: StaffBandInfo | null = null;
  bandBusy = false;
  bandReasonOpen = false;
  bandReason = '';
  private bandFor = '';

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private authService: AuthService,
    private confirmationService: ConfirmationService,
    private dialog: MatDialog,
    private avatarService: AvatarService,
    private eventService: EventService,
    private staffBands: StaffBandService
  ) { }

  // ── Role checks ──────────────────────────────────────────

  get isTopLevel(): boolean {
    return TOP_LEVEL_ROLES.includes(this.userRole);
  }

  get isTL(): boolean {
    return this.userRole === 'TL';
  }

  get canCreateUsers(): boolean {
    return this.isTopLevel;
  }

  get canViewPage(): boolean {
    return this.isTopLevel || this.isTL;
  }

  /** Only DEV/DIR can see (and reactivate) deactivated users. */
  get canSeeDeactivated(): boolean {
    return this.userRole === 'DEV' || this.userRole === 'DIR';
  }

  ngOnInit() {
    this.userSub = this.authService.user.subscribe(user => {
      this.user = user;
      this.userRole = user?.role || '';

      if (this.isTopLevel) {
        this.loadRoles();
        this.loadDepartments();
      } else if (this.isTL) {
        this.setupTLDepartmentContext();
      }
      if (this.canViewPage) this.loadUsers();
    });
    // Staff list: reload the flags when the sidebar event changes.
    this.eventSub = this.eventService.activeEvent.subscribe(ev => {
      const id = ev?._id || '';
      if (id === this.staffEventId) return;
      this.selectedIds.clear();
      this.staffFilter = 'on';
      // Reload even when the first list hasn't arrived yet — loadUsers() drops a
      // reply that belongs to an older event (bug fix: Add/Remove went missing
      // when the page opened before the sidebar event had loaded).
      if (this.isTopLevel && this.canViewPage) this.loadUsers();
    });
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
    this.eventSub?.unsubscribe();
  }

  // ── Data loading ─────────────────────────────────────────

  loadUsers() {
    this.loading = true;
    const eventId = this.isTopLevel ? (this.eventService.currentActiveEvent?._id || '') : '';
    this.adminService.getAllUsers(this.canSeeDeactivated, eventId).subscribe({
      next: res => {
        // A reply for an event that is no longer the picked one: a newer request is on its way.
        if (this.isTopLevel && eventId !== (this.eventService.currentActiveEvent?._id || '')) return;
        this.users = res || [];
        this.staffEventId = eventId;
        const ids = new Set(this.users.map(u => u._id));
        this.selectedIds.forEach(id => { if (!ids.has(id)) this.selectedIds.delete(id); });
        this.rebuildFilterOptions();
        this.loading = false;
        // Keep the open panel pointed at the fresh copy of the same user
        if (this.activeUser?._id) {
          this.activeUser = this.users.find(u => u._id === this.activeUser._id) || null;
          if (!this.activeUser && this.panelMode !== 'create') this.panelOpen = false;
        }
      },
      error: () => {
        this.loading = false;
        this.notificationService.openErrorSnackBar('Error fetching users');
      }
    });
  }

  loadRoles() {
    this.adminService.getRoles().subscribe({
      next: roles => this.roles = roles,
      error: () => this.notificationService.openErrorSnackBar('Error loading roles')
    });
  }

  loadDepartments() {
    this.adminService.getDepartments().subscribe({
      next: depts => this.departments = depts,
      error: () => this.notificationService.openErrorSnackBar('Error loading departments')
    });
  }

  // TL doesn't have access to /admin/departments — their one department is already
  // known from their own logged-in user object, so build the form's list from that.
  private setupTLDepartmentContext() {
    const ownDept = this.user?.departments?.[0]?.department;
    this.departments = ownDept && typeof ownDept !== 'string'
      ? [{ _id: ownDept._id, name: ownDept.name }]
      : [];
  }

  // ── Per-user helpers ─────────────────────────────────────

  isActive(u: any): boolean {
    return u?.isActive !== false;
  }

  roleName(u: any): string {
    return u?.role?.name || u?.role || '';
  }

  homeDeptId(u: any): string {
    const dept = u?.departments?.[0]?.department;
    return dept && typeof dept !== 'string' ? dept._id : (dept || '');
  }

  homeDeptName(u: any): string {
    const dept = u?.departments?.[0]?.department;
    return dept && typeof dept !== 'string' ? dept.name : '';
  }

  getAccessLabel(u: any): string {
    const deptName = this.homeDeptName(u);
    if (!deptName) return '—';

    const key = this.authService.deptKeyOf(u?.departments?.[0]?.department);
    const map = this.authService.getEffectivePermissionMap({
      role: this.roleName(u),
      permissions: u.permissions,
      departments: u.departments
    } as any);
    const level = map[key];
    return level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Read Only';
  }

  /** "box-office:write" → { dept: 'Box Office', level: 'write' }, for the
   *  panel's Department Access list. Uses the real department name where we
   *  have it, else prettifies the key. */
  permissionRows(u: any): { key: string; dept: string; level: string }[] {
    return (u?.permissions || []).map((perm: string) => {
      const [key, level] = perm.split(':');
      const home = u?.departments?.[0]?.department;
      // Shared keys: every department with this key ("Music Stage A, Music Stage B").
      const names = this.departments.filter(d => this.authService.deptKeyOf(d) === key).map(d => d.name);
      if (!names.length && home && typeof home !== 'string' && this.authService.deptKeyOf(home) === key) names.push(home.name);
      const dept = names.length ? names.sort((a, b) => a.localeCompare(b)).join(', ')
        : key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { key, dept, level };   // the panel shows the key; dept names are its tooltip
    });
  }

  /** permissionRows() builds fresh objects every change-detection pass —
   *  without this, *ngFor would see "new" items each time and rebuild the rows. */
  trackPerm(_: number, p: { key: string; level: string }): string {
    return p.key + ':' + p.level;
  }

  canEditUser(u: any): boolean {
    if (!this.isActive(u)) return false;
    if (this.isTopLevel) return true;
    if (!this.isTL) return false;
    const ownDeptId = this.user?.departments?.[0]?.department?._id;
    return !!ownDeptId && ownDeptId === this.homeDeptId(u);
  }

  /** Mirrors the backend guard: top-level only, never yourself, and an ADMIN
   *  can't remove a DEV or DIR. */
  canDeleteUser(u: any): boolean {
    if (!this.isTopLevel || !this.isActive(u)) return false;
    if (u._id === this.user?._id) return false;
    if (this.userRole === 'ADMIN' && ['DEV', 'DIR'].includes(this.roleName(u))) return false;
    return true;
  }

  canReactivateUser(u: any): boolean {
    return this.canSeeDeactivated && !this.isActive(u);
  }

  // ── Stats + filtering ────────────────────────────────────

  get activeUsers(): any[] {
    return this.users.filter(u => this.isActive(u));
  }

  get deactivatedUsers(): any[] {
    return this.users.filter(u => !this.isActive(u));
  }

  get adminsCount(): number {
    return this.activeUsers.filter(u => TOP_LEVEL_ROLES.includes(this.roleName(u))).length;
  }

  get leadsCount(): number {
    return this.activeUsers.filter(u => this.roleName(u) === 'TL').length;
  }

  get volunteersCount(): number {
    return this.activeUsers.filter(u => this.roleName(u) === 'VOL').length;
  }

  get noDeptCount(): number {
    return this.activeUsers.filter(u => !this.homeDeptId(u)).length;
  }

  /**
   * Filter dropdown options. Deliberately plain fields rebuilt only when the
   * user list changes — NOT getters. Bug fix (v1.14.1): as a getter,
   * deptFilterOptions returned brand-new objects on every change-detection
   * pass, so *ngFor tore down and re-created every <app-option> (each with
   * projected content) on every pass, which hung Angular's view insertion and
   * froze the whole tab on UAT. Any list fed to an *ngFor of <app-option>
   * must keep stable object identities.
   */
  roleFilterOptions: string[] = [];
  deptFilterOptions: { _id: string; name: string }[] = [];

  private rebuildFilterOptions() {
    const names = Array.from(new Set(this.users.map(u => this.roleName(u)).filter(Boolean)));
    const rank = (r: string) => ROLE_ORDER.indexOf(r) === -1 ? ROLE_ORDER.length : ROLE_ORDER.indexOf(r);
    this.roleFilterOptions = names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

    const byId = new Map<string, string>();
    this.users.forEach(u => {
      const id = this.homeDeptId(u);
      if (id) byId.set(id, this.homeDeptName(u) || id);
    });
    this.deptFilterOptions = Array.from(byId, ([_id, name]) => ({ _id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  trackRoleOption(_: number, role: string): string {
    return role;
  }

  trackDeptOption(_: number, dept: { _id: string }): string {
    return dept._id;
  }

  get filteredUsers(): any[] {
    let result = this.statusFilter === 'deactivated' ? this.deactivatedUsers
      : this.statusFilter === 'all' ? this.users
      : this.activeUsers;

    if (this.activeFilter === 'admins') {
      result = result.filter(u => TOP_LEVEL_ROLES.includes(this.roleName(u)));
    } else if (this.activeFilter === 'leads') {
      result = result.filter(u => this.roleName(u) === 'TL');
    } else if (this.activeFilter === 'volunteers') {
      result = result.filter(u => this.roleName(u) === 'VOL');
    } else if (this.activeFilter === 'noDept') {
      result = result.filter(u => !this.homeDeptId(u));
    }

    if (this.roleFilter) {
      result = result.filter(u => this.roleName(u) === this.roleFilter);
    }
    if (this.deptFilter) {
      result = result.filter(u => this.homeDeptId(u) === this.deptFilter);
    }
    if (this.staffFilter && this.showStaff) {
      const want = this.staffFilter === 'on';
      result = result.filter(u => !!u.onEvent === want);
    }

    const term = this.searchTerm.trim().toLowerCase();
    if (term) {
      result = result.filter(u =>
        u.name?.toLowerCase().includes(term) ||
        u.email?.toLowerCase().includes(term)
      );
    }

    return [...result].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  get pagedUsers(): any[] {
    const start = this.pageIndex * this.pageSize;
    return this.filteredUsers.slice(start, start + this.pageSize);
  }

  get hasFilters(): boolean {
    return !!(this.activeFilter || this.searchTerm.trim() || this.roleFilter || this.deptFilter || (this.showStaff && this.staffFilter !== 'on'))
      || this.statusFilter !== 'active';
  }

  toggleFilter(filter: UserStatFilter) {
    this.activeFilter = this.activeFilter === filter ? null : filter;
    this.pageIndex = 0;
  }

  /** The Deactivated card — same setting as the Status dropdown. */
  toggleDeactivated() {
    this.statusFilter = this.statusFilter === 'deactivated' ? 'active' : 'deactivated';
    this.pageIndex = 0;
  }

  onFilterChange() {
    this.pageIndex = 0;
  }

  clearFilters() {
    this.activeFilter = null;
    this.statusFilter = 'active';
    this.searchTerm = '';
    this.roleFilter = '';
    this.deptFilter = '';
    this.staffFilter = 'on';
    this.pageIndex = 0;
  }

  // ── Staff list (STAFF_LIST_CONTEXT.md) ───────────────────

  /** The event picked in the sidebar, when its staff flags are loaded. */
  get staffEvent() {
    const ev = this.eventService.currentActiveEvent;
    return ev && ev._id === this.staffEventId ? ev : null;
  }

  /** Staff list controls: DEV/DIR/ADMIN with an event picked. */
  get showStaff(): boolean {
    return this.isTopLevel && !!this.staffEvent;
  }

  get staffCount(): number {
    return this.activeUsers.filter(u => u.onEvent).length;
  }

  /** DEV/DIR/ADMIN are always staff, deactivated people can't be picked. */
  canPickForStaff(u: any): boolean {
    return this.isActive(u) && !TOP_LEVEL_ROLES.includes(this.roleName(u));
  }

  isAlwaysStaff(u: any): boolean {
    return TOP_LEVEL_ROLES.includes(this.roleName(u));
  }

  togglePick(u: any, event?: Event) {
    event?.stopPropagation();
    if (!this.canPickForStaff(u)) return;
    if (this.selectedIds.has(u._id)) this.selectedIds.delete(u._id);
    else this.selectedIds.add(u._id);
  }

  /** Every pickable person in the current filter (all pages). */
  get pickableFiltered(): any[] {
    return this.filteredUsers.filter(u => this.canPickForStaff(u));
  }

  /** Some (not necessarily all) of the current filter are ticked — header shows a dash. */
  get somePicked(): boolean {
    return this.pickableFiltered.some(u => this.selectedIds.has(u._id));
  }

  get allPicked(): boolean {
    const list = this.pickableFiltered;
    return list.length > 0 && list.every(u => this.selectedIds.has(u._id));
  }

  togglePickAll() {
    const list = this.pickableFiltered;
    if (this.allPicked) list.forEach(u => this.selectedIds.delete(u._id));
    else list.forEach(u => this.selectedIds.add(u._id));
  }

  clearPicks() {
    this.selectedIds.clear();
  }

  /** Adds (or removes) people on the sidebar event's staff list. */
  changeStaff(add: boolean, ids: string[] = [...this.selectedIds]) {
    const ev = this.staffEvent;
    if (!ev || !ids.length || this.staffBusy) return;
    this.staffBusy = true;
    const done = (n: number) => {
      this.staffBusy = false;
      const who = n === 1 ? '1 person' : n + ' people';
      this.notificationService.openSucessSnackBar(add ? `${who} added to ${ev.name}` : `${who} removed from ${ev.name}`);
      ids.forEach(id => this.selectedIds.delete(id));
      this.loadUsers();
    };
    const fail = () => {
      this.staffBusy = false;
      this.notificationService.openErrorSnackBar('The staff list could not be changed. Try again.');
    };
    if (add) this.adminService.addEventStaff(ev._id, ids).subscribe({ next: r => done(r.added), error: fail });
    else this.adminService.removeEventStaff(ev._id, ids).subscribe({ next: r => done(r.removed), error: fail });
  }

  /**
   * Bulk delete (v1.43.0): asks the server what would happen (deleted when no
   * history, deactivated when there is, or refused with a reason), shows that
   * in one confirm, then removes them.
   */
  deleteSelected() {
    const ids = [...this.selectedIds];
    if (!ids.length || this.staffBusy || !this.isTopLevel) return;
    this.staffBusy = true;
    this.adminService.bulkDeleteUsers(ids, true).subscribe({
      next: (preview) => {
        this.staffBusy = false;
        const del = preview.counts['delete'] || 0;
        const deact = preview.counts['deactivate'] || 0;
        const refused = preview.results.filter(r => r.result === 'refused');
        if (!del && !deact) {
          this.notificationService.openErrorSnackBar('None of the selected people can be removed.');
          return;
        }
        this.confirmationService.confirm({
          title: 'Remove ' + this.people(del + deact),
          message: this.bulkDeleteMessage(del, deact, refused),
          confirmText: 'Remove',
          danger: true
        }).subscribe(ok => { if (ok) this.runBulkDelete(ids); });
      },
      error: () => {
        this.staffBusy = false;
        this.notificationService.openErrorSnackBar('Could not check the selected people. Try again.');
      }
    });
  }

  private people(n: number): string { return n === 1 ? '1 person' : n + ' people'; }

  bulkDeleteMessage(del: number, deact: number, refused: { name: string; reason?: string }[]): string {
    const parts: string[] = [];
    if (del) parts.push(`${this.people(del)} will be deleted permanently (no attendance or event records). This can't be undone.`);
    if (deact) parts.push(`${this.people(deact)} ${deact === 1 ? 'has' : 'have'} records, so ${deact === 1 ? 'is' : 'are'} deactivated instead: they can't sign in, their records are kept, and a DEV or DIR can reactivate them.`);
    if (refused.length) parts.push(`${this.people(refused.length)} can't be removed and will be skipped: ` +
      refused.map(r => `${r.name || 'unknown'} (${r.reason})`).join(', ') + '.');
    return parts.join(' ');
  }

  private runBulkDelete(ids: string[]) {
    this.staffBusy = true;
    this.adminService.bulkDeleteUsers(ids, false).subscribe({
      next: (res) => {
        this.staffBusy = false;
        const del = res.counts['deleted'] || 0, deact = res.counts['deactivated'] || 0, skipped = res.counts['refused'] || 0;
        const bits = [del ? del + ' deleted' : '', deact ? deact + ' deactivated' : '', skipped ? skipped + ' skipped' : ''].filter(Boolean);
        this.notificationService.openSucessSnackBar(bits.join(', ') || 'Nothing removed');
        this.selectedIds.clear();
        if (this.activeUser && ids.includes(this.activeUser._id)) this.panelOpen = false;
        this.loadUsers();
      },
      error: () => {
        this.staffBusy = false;
        this.notificationService.openErrorSnackBar('Removing failed. The list was reloaded to show who was removed.');
        this.loadUsers();
      }
    });
  }

  onPageChange(event: PageEvent) {
    this.pageIndex = event.pageIndex;
    this.pageSize = event.pageSize;
  }

  // ── Panel ────────────────────────────────────────────────

  openUser(u: any) {
    this.activeUser = u;
    this.panelMode = 'view';
    this.panelOpen = true;
    this.loadBand();
  }

  // ── Wrist band (Hospitality H5) ──────────────────────────

  get bandEvent() { return this.eventService.activeEvent.value; }

  /** Shown only to people the server lets change this user's band (403 → hidden). */
  async loadBand() {
    this.band = null;
    this.bandReasonOpen = false;
    this.bandReason = '';
    const u = this.activeUser, ev = this.bandEvent;
    if (!u?._id || !ev || !this.isActive(u)) return;
    const key = this.bandFor = u._id + '|' + ev._id;
    try {
      const info = await this.staffBands.get(u._id, ev._id);
      if (this.bandFor === key) this.band = info;
    } catch { /* not allowed or not reachable: no band row */ }
  }

  async changeBand(replace: boolean) {
    const u = this.activeUser, ev = this.bandEvent;
    if (!u || !ev || this.bandBusy) return;
    if (replace && !this.bandReason.trim()) { this.bandReasonOpen = true; return; }
    const raw = await this.staffBands.scan(`${replace ? 'Replace' : 'Link'} band: ${u.name}`);
    if (!raw) return;
    this.bandBusy = true;
    try {
      if (replace) await this.staffBands.replace(u._id, ev._id, raw, this.bandReason.trim());
      else await this.staffBands.link(u._id, ev._id, raw);
      this.notificationService.openSucessSnackBar(replace ? 'Band replaced' : 'Band linked');
      await this.loadBand();
    } catch (err: any) {
      this.notificationService.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the band');
    } finally {
      this.bandBusy = false;
    }
  }

  trackBand(_: number, b: { _id: string }) { return b._id; }

  openCreate() {
    if (!this.canCreateUsers) return;
    this.activeUser = null;
    this.panelMode = 'create';
    this.panelOpen = true;
  }

  /** Bulk Add users from a spreadsheet (v1.42.0). Reloads the list when anyone was added. */
  openBulk() {
    if (!this.canCreateUsers) return;
    this.dialog.open(BulkUsersComponent, { width: '920px', maxWidth: '95vw', disableClose: true })
      .afterClosed().subscribe(added => { if (added) this.loadUsers(); });
  }

  startEdit() {
    if (this.activeUser && this.canEditUser(this.activeUser)) {
      this.panelMode = 'edit';
    }
  }

  onFormSaved(saved: any) {
    // Back to the details view; loadUsers() then swaps in the fresh copy. A
    // new user is shown straight away (createUser returns it populated); an
    // edited one keeps its current copy until then, since updateUser's
    // response doesn't populate role.
    if (this.panelMode === 'create') this.activeUser = saved;
    this.panelMode = 'view';
    this.loadUsers();
  }

  onFormCancelled() {
    if (this.panelMode === 'create') {
      this.closePanel();
    } else {
      this.panelMode = 'view';
    }
  }

  closePanel() {
    this.panelOpen = false;
    // Drop any open form so the next open starts fresh
    this.panelMode = 'view';
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    // Esc on top of a confirm dialog should only close the dialog
    if (this.panelOpen && this.dialog.openDialogs.length === 0) {
      this.closePanel();
    }
  }

  // ── Photo ────────────────────────────────────────────────

  /** Mirrors the backend: yourself, or DEV/DIR/ADMIN for any active user. */
  canChangePhoto(u: any): boolean {
    if (!this.isActive(u)) return false;
    return this.isTopLevel || u._id === this.user?._id;
  }

  hasPhoto(u: any): boolean {
    return this.avatarService.effectiveVersion(u._id, u.avatarVersion) > 0;
  }

  changePhoto(u: any) {
    if (!this.canChangePhoto(u) || this.photoBusy) return;
    this.photoBusy = true;
    this.avatarService.changePhoto(u._id, `Photo for ${u.name}`).subscribe({
      next: version => {
        u.avatarVersion = version;
        this.notificationService.openSucessSnackBar('Photo updated');
      },
      error: err => {
        this.photoBusy = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not save photo');
      },
      // Also fires when the picker is cancelled
      complete: () => this.photoBusy = false
    });
  }

  removePhoto(u: any) {
    if (!this.canChangePhoto(u) || this.photoBusy) return;
    this.confirmationService.confirm({
      title: 'Remove Photo',
      message: `Remove ${u.name}'s photo? Their initial will be shown instead.`,
      confirmText: 'Remove',
      danger: true
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.photoBusy = true;
      this.avatarService.remove(u._id).subscribe({
        next: () => {
          this.photoBusy = false;
          u.avatarVersion = 0;
          this.notificationService.openSucessSnackBar('Photo removed');
        },
        error: err => {
          this.photoBusy = false;
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not remove photo');
        }
      });
    });
  }

  // ── Delete / deactivate / reactivate ─────────────────────

  deleteUser(u: any) {
    if (!this.canDeleteUser(u) || this.removing) return;
    this.removing = true;

    this.adminService.checkDeleteUser(u._id).subscribe({
      next: check => {
        this.removing = false;
        this.confirmationService.confirm(this.buildDeleteConfirm(u, check)).subscribe(confirmed => {
          if (confirmed) this.performDelete(u);
        });
      },
      error: err => {
        this.removing = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not check this user');
      }
    });
  }

  buildDeleteConfirm(u: any, check: UserDeleteCheck): ConfirmDialogData {
    if (check.action === 'delete') {
      return {
        title: 'Delete User',
        message: `Permanently delete ${u.name}? They have no attendance or event records, so the account will be removed completely. This can't be undone.`,
        confirmText: 'Delete',
        danger: true
      };
    }

    const parts: string[] = [];
    if (check.attendanceCount) parts.push(`${check.attendanceCount} attendance ${check.attendanceCount === 1 ? 'entry' : 'entries'}`);
    if (check.attendanceMarkedCount) parts.push(`${check.attendanceMarkedCount} ${check.attendanceMarkedCount === 1 ? 'entry' : 'entries'} marked for others`);
    if (check.eventsCreatedCount) parts.push(`${check.eventsCreatedCount} event${check.eventsCreatedCount === 1 ? '' : 's'} created`);

    return {
      title: 'Deactivate User',
      message: `${u.name} has records in the system (${parts.join(', ')}), so they will be deactivated instead of deleted. ` +
        `They won't be able to log in and won't appear in any user list. All their records are kept, and a DEV or DIR can reactivate them later.`,
      confirmText: 'Deactivate',
      danger: true
    };
  }

  private performDelete(u: any) {
    this.removing = true;
    this.adminService.deleteUser(u._id).subscribe({
      next: res => {
        this.removing = false;
        this.notificationService.openSucessSnackBar(
          res.result === 'deactivated' ? `${u.name} has been deactivated` : `${u.name} has been deleted`
        );
        this.closePanel();
        this.activeUser = null;
        this.loadUsers();
      },
      error: err => {
        this.removing = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not delete user');
      }
    });
  }

  reactivateUser(u: any) {
    if (!this.canReactivateUser(u) || this.removing) return;

    this.confirmationService.confirm({
      title: 'Reactivate User',
      message: `Reactivate ${u.name}? They'll be able to log in again with the same role, department and access as before.`,
      confirmText: 'Reactivate'
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.removing = true;
      this.adminService.reactivateUser(u._id).subscribe({
        next: () => {
          this.removing = false;
          this.notificationService.openSucessSnackBar(`${u.name} has been reactivated`);
          // Status filter is left as-is — under "Deactivated" they simply drop
          // out of the table; the panel stays open on their refreshed details.
          this.loadUsers();
        },
        error: err => {
          this.removing = false;
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not reactivate user');
        }
      });
    });
  }
}
