import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AdminService, DeptDetail } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { AuthService } from '../../../core/auth.service';

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
    // Create only — fixed after creation (permission grants use it).
    key: new FormControl('', [Validators.pattern(/^[a-z0-9-]{1,40}$/)]),
    description: new FormControl('')
  });
  private keyEdited = false;

  // Working sets during edit / create — changes are not persisted until Save is clicked
  editedTls: UserChip[] = [];
  editedVolunteers: UserChip[] = [];

  // All users for autocomplete dropdowns — loaded once, on first Edit / Create
  allUsers: any[] = [];
  usersLoaded = false;

  // Autocomplete search inputs
  tlSearchCtrl = new FormControl('');
  volSearchCtrl = new FormControl('');
  filteredTlOptions: UserChip[] = [];
  filteredVolOptions: UserChip[] = [];

  // Maps userId → old dept name for volunteers being moved from another dept
  volWarnings: { [userId: string]: string } = {};

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    // On Create, the key follows the name until someone types in it.
    this.editForm.get('name')!.valueChanges.subscribe(name => {
      if (this.mode === 'create' && !this.keyEdited) {
        this.editForm.get('key')!.setValue(this.authService.deptNameToKey((name || '').trim()), { emitEvent: false });
      }
    });
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['deptId'] || (changes['eventId'] && !changes['eventId'].firstChange && this.mode === 'view')) this.reset();
  }

  /** Start over for the current deptId: view an existing department, or a blank Create form. */
  reset() {
    this.clearSearch();
    this.volWarnings = {};
    this.saving = false;
    if (this.deptId) {
      this.mode = 'view';
      this.detail = null;
      this.loadDetail(this.deptId);
    } else {
      this.mode = 'create';
      this.detail = null;
      this.keyEdited = false;
      this.editForm.reset({ name: '', key: '', description: '' });
      this.editedTls = [];
      this.editedVolunteers = [];
      if (!this.usersLoaded) this.loadAllUsers();
      this.loadExistingKeys();
    }
  }

  // ── Shared department keys (2026-11-06) ──
  /** Every department's name + key, for the Create form's key suggestions. */
  private existingDepts: { name: string; key: string }[] = [];
  existingKeys: string[] = [];

  private loadExistingKeys() {
    this.adminService.getDepartments().subscribe({
      next: (depts) => {
        this.existingDepts = depts.map(d => ({ name: d.name, key: this.authService.deptKeyOf(d) }));
        this.existingKeys = [...new Set(this.existingDepts.map(d => d.key).filter(Boolean))].sort();
      },
      error: () => { this.existingDepts = []; this.existingKeys = []; }
    });
  }

  /** "Music Stage A" when the typed key is already used — the new department gets the same access. */
  get sharedWith(): string {
    const key = (this.editForm.get('key')?.value || '').trim().toLowerCase();
    if (!key || this.mode !== 'create') return '';
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
    this.editedVolunteers = this.detail.volunteers.map(v => ({ ...v }));
    this.volWarnings = {};
    this.mode = 'edit';
    if (!this.usersLoaded) this.loadAllUsers();
  }

  onKeyInput() {
    this.keyEdited = true;
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
      this.volWarnings = {};
    } else {
      this.close();
    }
  }

  close() {
    this.closed.emit();
  }

  private clearSearch() {
    this.tlSearchCtrl.setValue('', { emitEvent: false });
    this.volSearchCtrl.setValue('', { emitEvent: false });
    this.filteredTlOptions = [];
    this.filteredVolOptions = [];
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
    this.volSearchCtrl.valueChanges.subscribe(val => {
      this.filteredVolOptions = this.filterVolUsers(val || '');
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

  // Return VOL users that match search and are not already added
  private filterVolUsers(search: string): UserChip[] {
    const s = search.toLowerCase();
    const existingIds = new Set(this.editedVolunteers.map(v => v._id));
    return this.allUsers
      .filter(u => u.role?.name === 'VOL')
      .filter(u => !existingIds.has(u._id))
      .filter(u => u.name.toLowerCase().includes(s))
      .map(u => ({ _id: u._id, name: u.name, avatarVersion: u.avatarVersion, departments: u.departments }));
  }

  // Add a TL chip and refresh the filtered options list
  onTlSelected(user: UserChip) {
    this.editedTls.push({ _id: user._id, name: user.name, avatarVersion: user.avatarVersion });
    this.tlSearchCtrl.setValue('');
    this.filteredTlOptions = this.filterTlUsers('');
  }

  // Add a VOL chip; if they belong to a different dept, record a reassignment warning
  onVolSelected(user: UserChip) {
    const fullUser = this.allUsers.find(u => u._id === user._id);
    this.editedVolunteers.push({ _id: user._id, name: user.name, avatarVersion: fullUser?.avatarVersion, departments: fullUser?.departments });

    const depts: any[] = fullUser?.departments || [];
    const otherDept = depts.find(da => {
      const deptId = da.department?._id || da.department;
      return deptId?.toString() !== this.detail?._id?.toString();
    });
    if (otherDept) {
      this.volWarnings[user._id] = otherDept.department?.name || 'another department';
    }

    this.volSearchCtrl.setValue('');
    this.filteredVolOptions = this.filterVolUsers('');
  }

  // Remove a TL chip and re-run autocomplete filter so they reappear as an option
  removeTl(id: string) {
    this.editedTls = this.editedTls.filter(t => t._id !== id);
    this.filteredTlOptions = this.filterTlUsers(this.tlSearchCtrl.value || '');
  }

  // Remove a VOL chip, clear any reassignment warning for that user
  removeVol(id: string) {
    this.editedVolunteers = this.editedVolunteers.filter(v => v._id !== id);
    delete this.volWarnings[id];
    this.filteredVolOptions = this.filterVolUsers(this.volSearchCtrl.value || '');
  }

  // Returns the list of active reassignment warnings for the warning banner
  get warningList(): { name: string; fromDept: string }[] {
    return Object.entries(this.volWarnings).map(([id, fromDept]) => {
      const vol = this.editedVolunteers.find(v => v._id === id);
      return { name: vol?.name || '', fromDept };
    });
  }

  get formInvalid(): boolean {
    if (this.editForm.get('name')!.invalid) return true;
    if (this.mode === 'create') {
      const key = this.editForm.get('key')!;
      return !key.value || key.invalid;
    }
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
    const memberIds = [...this.editedTls, ...this.editedVolunteers].map(u => u._id);
    this.adminService.createDepartment({ name: name!.trim(), key: key!.trim(), description: description || '' }).subscribe({
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
    this.saving = false;
    if (ok) this.notificationService.openSucessSnackBar('Department created');
    this.changed.emit(id);
  }

  // Diff edited vs original sets to produce addUserIds / removeUserIds, then PATCH the department
  private update() {
    if (!this.detail) return;
    this.saving = true;

    const originalAllIds = new Set([
      ...this.detail.tls.map(t => t._id),
      ...this.detail.volunteers.map(v => v._id)
    ]);
    const editedAllIds = new Set([
      ...this.editedTls.map(t => t._id),
      ...this.editedVolunteers.map(v => v._id)
    ]);

    const addUserIds = [...editedAllIds].filter(id => !originalAllIds.has(id));
    const removeUserIds = [...originalAllIds].filter(id => !editedAllIds.has(id));

    const { name, description } = this.editForm.value;
    this.adminService.updateDepartment(this.detail._id, {
      name: name!.trim(),
      description: description || '',
      addUserIds,
      removeUserIds
    }).subscribe({
      next: () => {
        this.saving = false;
        this.mode = 'view';
        this.volWarnings = {};
        this.notificationService.openSucessSnackBar('Department updated');
        this.loadDetail(this.detail!._id);
        this.changed.emit(this.detail!._id);
      },
      error: (err) => {
        this.saving = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Error saving department');
      }
    });
  }
}
