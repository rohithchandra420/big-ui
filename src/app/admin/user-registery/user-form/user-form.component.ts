import { Component, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';

import { AdminService } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { AuthService } from '../../../core/auth.service';

export type PermLevel = 'none' | 'read' | 'write' | 'manage';
export type UserFormMode = 'create' | 'edit';

const passwordsMatch = (group: AbstractControl): ValidationErrors | null => {
  const password = group.get('password');
  const confirm = group.get('confirmPassword');
  if (!password || !confirm || password.disabled) return null;
  return password.value && confirm.value && password.value !== confirm.value
    ? { passwordMismatch: true }
    : null;
};

/**
 * Create/Edit user form, shown inside the Users page's side panel. Same
 * fields and rules the page's old inline form had — DEV/DIR/ADMIN can set
 * everything; a TL (edit only) can only change their own department's
 * permission chip, with role/home department/date of joining locked.
 */
@Component({
  selector: 'app-user-form',
  templateUrl: './user-form.component.html',
  styleUrls: ['./user-form.component.css']
})
export class UserFormComponent implements OnInit, OnChanges {

  @Input() mode: UserFormMode = 'create';
  /** The user being edited (edit mode only). */
  @Input() user: any = null;
  @Input() roles: { _id: string; name: string }[] = [];
  /** DEV/DIR/ADMIN: every department. TL: only their own. */
  @Input() departments: { _id: string; name: string; key?: string }[] = [];
  @Input() isTopLevel = false;
  /** Staff list: a new user is also put on this event (the one picked in the sidebar). */
  @Input() eventId = '';

  /** Emits the created/updated user as returned by the backend. */
  @Output() saved = new EventEmitter<any>();
  @Output() cancelled = new EventEmitter<void>();

  readonly permLevels: PermLevel[] = ['read', 'write', 'manage'];
  readonly genders = ['Male', 'Female', 'Prefer not to say'];
  /**
   * Shared department keys (2026-11-06): access is granted per department KEY,
   * so departments sharing a key ("music": Music Stage A, Music Stage B) are
   * one row with one level. Stored list (stable identities for *ngFor).
   */
  accessKeys: { key: string; names: string }[] = [];
  keySelections: { [key: string]: PermLevel } = {};
  saving = false;

  form = new FormGroup({
    userName: new FormControl<string | null>(null, Validators.required),
    email: new FormControl<string | null>(null, [Validators.required, Validators.email]),
    password: new FormControl<string | null>(null, Validators.required),
    confirmPassword: new FormControl<string | null>(null, Validators.required),
    role: new FormControl<string>('', Validators.required),
    homeDepartment: new FormControl<string>('', Validators.required),
    dateOfJoining: new FormControl<string | null>(null, Validators.required),
    // Hospitality: what the kitchen counts them as (missing = Veg on the server).
    foodPreference: new FormControl<'veg' | 'non-veg'>('veg', { nonNullable: true }),
    // Hospitality H6: needed before giving them a bed (optional here).
    gender: new FormControl<string>('', { nonNullable: true })
  }, { validators: passwordsMatch });

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private authService: AuthService
  ) { }

  get isEdit(): boolean {
    return this.mode === 'edit';
  }

  /** A TL doesn't get the roles list (no /admin/roles access) — fall back to
   *  the edited user's own role so the locked dropdown still shows it.
   *  Bug fix (v1.14.1): the fallback is cached, not rebuilt on every read — a
   *  fresh array/object each change-detection pass made *ngFor re-create the
   *  <app-option> every pass, the same freeze as the Users page filters. */
  get roleOptions(): { _id: string; name: string }[] {
    if (this.roles.length) return this.roles;
    const own = this.user?.role?.name || this.user?.role || '';
    if (own !== this.fallbackRoleName) {
      this.fallbackRoleName = own;
      this.fallbackRoleOptions = own ? [{ _id: '', name: own }] : [];
    }
    return this.fallbackRoleOptions;
  }
  private fallbackRoleName = '';
  private fallbackRoleOptions: { _id: string; name: string }[] = [];

  trackRole(_: number, r: { name: string }): string {
    return r.name;
  }

  trackKey(_: number, k: { key: string }): string {
    return k.key;
  }

  /** The department list can arrive after the form opens: rebuild the rows, keeping picks. */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['departments'] && !changes['departments'].firstChange) {
      const kept = { ...this.keySelections };
      this.buildAccessKeys();
      Object.keys(kept).forEach(k => { if (k in this.keySelections) this.keySelections[k] = kept[k]; });
      if (this.isEdit && this.user) this.populateFromUser();
      const general = this.departments.find(d => d.name.toLowerCase() === 'general');
      const gKey = general ? this.authService.deptKeyOf(general) : '';
      if (!this.isEdit && gKey && !(gKey in kept)) this.keySelections[gKey] = 'read';
    }
  }

  /** One row per key, with the names of the departments that share it. */
  private buildAccessKeys() {
    const byKey = new Map<string, string[]>();
    this.departments.forEach(d => {
      const key = this.authService.deptKeyOf(d);
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(d.name);
    });
    this.accessKeys = [...byKey].map(([key, names]) => ({ key, names: names.sort((a, b) => a.localeCompare(b)).join(', ') }))
      .sort((a, b) => a.key.localeCompare(b.key));
    this.accessKeys.forEach(k => { this.keySelections[k.key] = 'none'; });
  }

  ngOnInit() {
    this.buildAccessKeys();

    if (this.isEdit) {
      this.form.controls.password.disable();
      this.form.controls.confirmPassword.disable();
      this.populateFromUser();
    } else {
      const general = this.departments.find(d => d.name.toLowerCase() === 'general');
      if (general) this.keySelections[this.authService.deptKeyOf(general)] = 'read';
    }

    if (!this.isTopLevel) {
      this.form.controls.role.disable();
      this.form.controls.homeDepartment.disable();
      this.form.controls.dateOfJoining.disable();
    }
  }

  private populateFromUser() {
    const u = this.user;
    const homeDept = u.departments?.[0]?.department;
    const homeDeptId = homeDept && typeof homeDept !== 'string' ? homeDept._id : homeDept;

    this.form.patchValue({
      userName: u.name,
      email: u.email,
      role: u.role?.name || u.role || '',
      homeDepartment: homeDeptId || '',
      dateOfJoining: u.dateOfJoining ? u.dateOfJoining.substring(0, 10) : null,
      foodPreference: u.foodPreference === 'non-veg' ? 'non-veg' : 'veg',
      gender: u.gender || ''
    });

    (u.permissions || []).forEach((perm: string) => {
      const [key, action] = perm.split(':');
      if (key in this.keySelections && this.permLevels.includes(action as PermLevel)) {
        this.keySelections[key] = action as PermLevel;
      }
    });
  }

  setKeyLevel(key: string, level: PermLevel) {
    // Clicking the active level clears the key
    this.keySelections[key] = this.keySelections[key] === level ? 'none' : level;
  }

  buildPermissions(): string[] {
    return Object.entries(this.keySelections)
      .filter(([, level]) => level !== 'none')
      .map(([key, level]) => `${key}:${level}`);
  }

  submit() {
    if (this.form.invalid || this.saving) return;
    this.isEdit ? this.update() : this.create();
  }

  private create() {
    const raw = this.form.getRawValue();
    const userDetails = {
      name: raw.userName,
      email: raw.email,
      password: raw.password,
      roleName: raw.role,
      departmentIds: raw.homeDepartment ? [raw.homeDepartment] : [],
      permissions: this.buildPermissions(),
      dateOfJoining: raw.dateOfJoining,
      foodPreference: raw.foodPreference,
      ...(raw.gender ? { gender: raw.gender } : {}),
      ...(this.eventId ? { eventId: this.eventId } : {})
    };

    this.saving = true;
    this.adminService.createUser(userDetails).subscribe({
      next: res => {
        this.saving = false;
        this.notificationService.openSucessSnackBar('User ' + res.name + ' created successfully');
        this.saved.emit(res);
      },
      error: () => {
        this.saving = false;
        this.notificationService.openErrorSnackBar('Could not create user');
      }
    });
  }

  private update() {
    const raw = this.form.getRawValue();
    const updateDetails: any = {
      _id: this.user._id,
      name: raw.userName,
      email: raw.email,
      roleName: raw.role,
      permissions: this.buildPermissions(),
      foodPreference: raw.foodPreference,
      ...(raw.gender ? { gender: raw.gender } : {})
    };

    if (this.isTopLevel) {
      updateDetails.departments = raw.homeDepartment ? [{ departmentId: raw.homeDepartment, access: ['read'] }] : [];
      updateDetails.dateOfJoining = raw.dateOfJoining;
    }

    this.saving = true;
    this.adminService.updateUser(updateDetails).subscribe({
      next: res => {
        this.saving = false;
        this.notificationService.openSucessSnackBar('User updated successfully');
        this.saved.emit(res);
      },
      error: error => {
        this.saving = false;
        this.notificationService.openErrorSnackBar('Failed to update: ' + (error?.error?.message || error?.error || 'unknown error'));
      }
    });
  }
}
