import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { PageEvent } from '@angular/material/paginator';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';

import { AdminService, UserDeleteCheck } from '../admin.service';
import { User } from '../../core/user.model';
import { NotificationService } from '../../core/notification.service';
import { AuthService } from 'src/app/core/auth.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { ConfirmDialogData } from '../../shared/confirm-dialog/confirm-dialog.component';
import { AvatarService } from '../../core/avatar.service';

type UserStatFilter = 'admins' | 'leads' | 'volunteers' | 'noDept' | null;
export type UserStatusFilter = 'active' | 'deactivated' | 'all';
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
  departments: { _id: string; name: string }[] = [];

  activeFilter: UserStatFilter = null;
  /** DEV/DIR only (nobody else is sent deactivated users). Driven by both the
   *  Status dropdown and the Deactivated stat card, so the two always agree. */
  statusFilter: UserStatusFilter = 'active';
  searchTerm = '';
  roleFilter = '';
  deptFilter = '';

  pageIndex = 0;
  pageSize = 20;
  readonly pageSizeOptions = [20, 50, 100];

  panelOpen = false;
  panelMode: PanelMode = 'view';
  activeUser: any = null;
  removing = false;
  photoBusy = false;

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private authService: AuthService,
    private confirmationService: ConfirmationService,
    private dialog: MatDialog,
    private avatarService: AvatarService
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
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }

  // ── Data loading ─────────────────────────────────────────

  loadUsers() {
    this.loading = true;
    this.adminService.getAllUsers(this.canSeeDeactivated).subscribe({
      next: res => {
        this.users = res || [];
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

    const key = this.authService.deptNameToKey(deptName);
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
  permissionRows(u: any): { dept: string; level: string }[] {
    return (u?.permissions || []).map((perm: string) => {
      const [key, level] = perm.split(':');
      const known = this.departments.find(d => this.authService.deptNameToKey(d.name) === key)
        || (this.authService.deptNameToKey(this.homeDeptName(u)) === key ? { name: this.homeDeptName(u) } : null);
      const dept = known?.name || key.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { dept, level };
    });
  }

  /** permissionRows() builds fresh objects every change-detection pass —
   *  without this, *ngFor would see "new" items each time and rebuild the rows. */
  trackPerm(_: number, p: { dept: string; level: string }): string {
    return p.dept + ':' + p.level;
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

  get roleFilterOptions(): string[] {
    const names = Array.from(new Set(this.users.map(u => this.roleName(u)).filter(Boolean)));
    const rank = (r: string) => ROLE_ORDER.indexOf(r) === -1 ? ROLE_ORDER.length : ROLE_ORDER.indexOf(r);
    return names.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  }

  get deptFilterOptions(): { _id: string; name: string }[] {
    const byId = new Map<string, string>();
    this.users.forEach(u => {
      const id = this.homeDeptId(u);
      if (id) byId.set(id, this.homeDeptName(u) || id);
    });
    return Array.from(byId, ([_id, name]) => ({ _id, name })).sort((a, b) => a.name.localeCompare(b.name));
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
    return !!(this.activeFilter || this.searchTerm.trim() || this.roleFilter || this.deptFilter)
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
    this.pageIndex = 0;
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
  }

  openCreate() {
    if (!this.canCreateUsers) return;
    this.activeUser = null;
    this.panelMode = 'create';
    this.panelOpen = true;
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
