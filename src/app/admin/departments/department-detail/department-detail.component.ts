import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AdminService, DeptDetail } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { AuthService } from '../../../core/auth.service';
import { ACCESS_KEYS, AccessKey, DEFAULT_ACCESS_KEY, accessKey, isAccessKey } from '../../../core/access-keys';
import { VolunteersService } from '../../../volunteers/volunteers.service';

interface UserChip { _id: string; name: string; avatarVersion?: number; departments?: any[]; }

export type DeptPanelMode = 'view' | 'edit' | 'create';

/**
 * Content of the Departments page's slide-in panel (the global .panel lives
 * in DepartmentsComponent): view a department, edit it, or create one.
 * `deptId` null = create.
 */
@Component({
  selector: 'app-department-detail',
  templateUrl: './department-detail.component.html',
  styleUrls: ['./department-detail.component.css']
})
export class DepartmentDetailComponent implements OnChanges {
  @Input() deptId: string | null = null;
  /** Staff list (R2): members shown for this event (the sidebar's); others counted as notOnEvent. */
  @Input() eventId = '';
  @Input() eventName = '';
  /** Emitted when the panel should close. */
  @Output() closed = new EventEmitter<void>();
  /** Emitted after a create / save, so the list can refresh. */
  @Output() changed = new EventEmitter<string>();

  mode: DeptPanelMode = 'create';
  detail: DeptDetail | null = null;
  loading = false;
  saving = false;

  editForm = new FormGroup({
    name: new FormControl('', Validators.required),
    // Create only — fixed after creation (permission grants use it). One of
    // the built-in keys (core/access-keys.ts), picked from a dropdown.
    key: new FormControl(DEFAULT_ACCESS_KEY),
    description: new FormControl(''),
    // Volunteers needed for the sidebar event (optional; empty or 0 = no number).
    needed: new FormControl<number | null>(null)
  });

  /** The number the server holds for this department and event (0 = none). */
  private savedNeeded = 0;

  /** Volunteers needed is per event, and the Volunteer department (the Unassigned pool) has none. */
  get showNeeded(): boolean {
    const key = this.mode === 'create' ? this.editForm.get('key')?.value : this.detail?.key;
    return !!this.eventId && key !== 'volunteer';
  }

  get neededInvalid(): boolean {
    const v = this.editForm.get('needed')?.value;
    if (!this.showNeeded || v === null || v === undefined || (v as any) === '') return false;
    const n = Number(v);
    return !Number.isInteger(n) || n < 0 || n > 1000;
  }

  /** The number to send after the department is saved; null when it has not changed. */
  private neededToSave(): number | null {
    if (!this.showNeeded) return null;
    const n = Number(this.editForm.get('needed')?.value ?? 0) || 0;
    return n === this.savedNeeded ? null : n;
  }

  /** Saves the number when it changed, then calls `done` (false = the number could not be saved). */
  private withNeeded(deptId: string, done: (ok: boolean) => void) {
    const n = this.neededToSave();
    if (n === null) { done(true); return; }
    this.volunteers.setNeed(this.eventId, deptId, n).then(() => done(true), () => done(false));
  }

  /** The built-in keys for the Create form's dropdown (a stored list: stable identities for *ngFor). */
  readonly accessKeys: AccessKey[] = ACCESS_KEYS;

  trackKey(_: number, k: AccessKey): string {
    return k.key;
  }

  /** What the picked key gives, under the dropdown. */
  get keyAbout(): string {
    return accessKey(this.editForm.get('key')?.value)?.about || '';
  }

  // Working sets during edit / create — changes are not persisted until Save is clicked
  // Volunteers are not edited here: they are assigned on the Volunteers page.
  editedTls: UserChip[] = [];

  // All users for autocomplete dropdowns — loaded once, on first Edit / Create
  allUsers: any[] = [];
  usersLoaded = false;

  // Autocomplete search inputs
  tlSearchCtrl = new FormControl('');
  filteredTlOptions: UserChip[] = [];

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private authService: AuthService,
    private volunteers: VolunteersService
  ) { }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['deptId'] || (changes['eventId'] && !changes['eventId'].firstChange && this.mode === 'view')) this.reset();
  }

  /** Start over for the current deptId: view an existing department, or a blank Create form. */
  reset() {
    this.clearSearch();
    this.saving = false;
    this.savedNeeded = 0;
    if (this.deptId) {
      this.mode = 'view';
      this.detail = null;
      this.loadDetail(this.deptId);
    } else {
      this.mode = 'create';
      this.detail = null;
      this.editForm.reset({ name: '', key: DEFAULT_ACCESS_KEY, description: '' });
      this.editedTls = [];
      if (!this.usersLoaded) this.loadAllUsers();
      this.loadExistingKeys();
    }
  }

  // ── Shared department keys (2026-11-06) ──
  /** Every department's name + key, for the Create form's "Shared with" line. */
  private existingDepts: { name: string; key: string }[] = [];

  private loadExistingKeys() {
    this.adminService.getDepartments().subscribe({
      next: (depts) => {
        this.existingDepts = depts.map(d => ({ name: d.name, key: this.authService.deptKeyOf(d) }));
      },
      error: () => { this.existingDepts = []; }
    });
  }

  /** "Music Stage A" when the picked key is already used — the new department gets the same access.
   *  Not for "general": it gives no access, so there is nothing to share. */
  get sharedWith(): string {
    const key = this.editForm.get('key')?.value || '';
    if (!key || key === DEFAULT_ACCESS_KEY || this.mode !== 'create') return '';
    return this.existingDepts.filter(d => d.key === key).map(d => d.name).join(', ');
  }

  // Fetch full department detail (TLs + volunteers with their dept info)
  loadDetail(id: string) {
    this.loading = true;
    this.adminService.getDepartmentDetail(id, this.eventId).subscribe({
      next: (d) => { if (id === this.deptId) this.detail = d; this.loading = false; },
      error: () => { this.notificationService.openErrorSnackBar('Error loading department'); this.loading = false; }
    });
  }

  // Switch to edit mode — populate form and working sets from current detail; load users if not already done
  enterEditMode() {
    if (!this.detail) return;
    this.editForm.reset({ name: this.detail.name, key: this.detail.key || '', description: this.detail.description || '' });
    this.editedTls = this.detail.tls.map(t => ({ ...t }));
    this.mode = 'edit';
    this.loadNeeded(this.detail._id);
    if (!this.usersLoaded) this.loadAllUsers();
  }

  /** Edit: show the number already given for this event (left empty when it can't be read). */
  private loadNeeded(deptId: string) {
    this.savedNeeded = 0;
    if (!this.showNeeded) return;
    this.volunteers.need(this.eventId, deptId).then(info => {
      if (this.mode !== 'edit' || this.detail?._id !== deptId) return;
      this.savedNeeded = info.needed;
      const ctrl = this.editForm.get('needed')!;
      if (ctrl.pristine) ctrl.setValue(info.needed || null);
    }, () => { /* no number shown */ });
  }

  // Esc: leave Edit for the details, otherwise close the panel
  @HostListener('document:keydown.escape')
  onEscape() {
    if (!this.saving) this.cancel();
  }

  /** Cancel: Edit goes back to the details; Create / view close the panel. */
  cancel() {
    if (this.mode === 'edit') {
      this.mode = 'view';
      this.clearSearch();
    } else {
      this.close();
    }
  }

  close() {
    this.closed.emit();
  }

  private clearSearch() {
    this.tlSearchCtrl.setValue('', { emitEvent: false });
    this.filteredTlOptions = [];
  }

  // Load all platform users once; wire up autocomplete subscriptions after load
  private loadAllUsers() {
    this.adminService.getAllUsers().subscribe({
      next: (users) => {
        this.allUsers = users;
        this.usersLoaded = true;
        this.setupAutocomplete();
      },
      error: () => this.notificationService.openErrorSnackBar('Error loading users')
    });
  }

  // Subscribe to search input changes and refresh autocomplete option lists
  private setupAutocomplete() {
    this.tlSearchCtrl.valueChanges.subscribe(val => {
      this.filteredTlOptions = this.filterTlUsers(val || '');
    });
  }

  // Return TL-eligible users (DIR/ADMIN/TL) that match search and are not already added
  private filterTlUsers(search: string): UserChip[] {
    const s = search.toLowerCase();
    const existingIds = new Set(this.editedTls.map(t => t._id));
    return this.allUsers
      .filter(u => ['TL', 'DIR', 'ADMIN'].includes(u.role?.name || ''))
      .filter(u => !existingIds.has(u._id))
      .filter(u => u.name.toLowerCase().includes(s))
      .map(u => ({ _id: u._id, name: u.name, avatarVersion: u.avatarVersion }));
  }

  // Add a TL chip and refresh the filtered options list
  onTlSelected(user: UserChip) {
    this.editedTls.push({ _id: user._id, name: user.name, avatarVersion: user.avatarVersion });
    this.tlSearchCtrl.setValue('');
    this.filteredTlOptions = this.filterTlUsers('');
  }

  // Remove a TL chip and re-run autocomplete filter so they reappear as an option
  removeTl(id: string) {
    this.editedTls = this.editedTls.filter(t => t._id !== id);
    this.filteredTlOptions = this.filterTlUsers(this.tlSearchCtrl.value || '');
  }

  get formInvalid(): boolean {
    if (this.editForm.get('name')!.invalid) return true;
    if (this.neededInvalid) return true;
    if (this.mode === 'create') return !isAccessKey(this.editForm.get('key')!.value);
    return false;
  }

  save() {
    if (this.formInvalid || this.saving) return;
    this.mode === 'create' ? this.create() : this.update();
  }

  /** Create the department, then add the chosen members (a second request). */
  private create() {
    this.saving = true;
    const { name, key, description } = this.editForm.value;
    const memberIds = this.editedTls.map(u => u._id);
    this.adminService.createDepartment({ name: name!.trim(), key: key || DEFAULT_ACCESS_KEY, description: description || '' }).subscribe({
      next: (dept) => {
        if (!memberIds.length) return this.created(dept._id);
        this.adminService.updateDepartment(dept._id, { addUserIds: memberIds }).subscribe({
          next: () => this.created(dept._id),
          error: () => {
            this.notificationService.openErrorSnackBar('Department created, but adding the members failed — add them with Edit');
            this.created(dept._id, false);
          }
        });
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error creating department');
      }
    });
  }

  private created(id: string, ok = true) {
    this.withNeeded(id, needOk => {
      this.saving = false;
      if (!needOk) this.notificationService.openErrorSnackBar('Department created, but the volunteers needed number was not saved — set it with Edit');
      else if (ok) this.notificationService.openSucessSnackBar('Department created');
      this.changed.emit(id);
    });
  }

  // Diff edited vs original sets to produce addUserIds / removeUserIds, then PATCH the department
  private update() {
    if (!this.detail) return;
    this.saving = true;

    // Team Leads only — volunteers are assigned on the Volunteers page.
    const originalAllIds = new Set(this.detail.tls.map(t => t._id));
    const editedAllIds = new Set(this.editedTls.map(t => t._id));

    const addUserIds = [...editedAllIds].filter(id => !originalAllIds.has(id));
    const removeUserIds = [...originalAllIds].filter(id => !editedAllIds.has(id));

    const { name, description } = this.editForm.value;
    this.adminService.updateDepartment(this.detail._id, {
      name: name!.trim(),
      description: description || '',
      addUserIds,
      removeUserIds
    }).subscribe({
      next: () => this.withNeeded(this.detail!._id, needOk => {
        this.saving = false;
        this.mode = 'view';
        if (needOk) this.notificationService.openSucessSnackBar('Department updated');
        else this.notificationService.openErrorSnackBar('Department updated, but the volunteers needed number was not saved');
        this.loadDetail(this.detail!._id);
        this.changed.emit(this.detail!._id);
      }),
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error saving department');
      }
    });
  }
}
