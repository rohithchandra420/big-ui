import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, SimpleChanges } from '@angular/core';
import { AbstractControl, FormControl, FormGroup, ValidationErrors, Validators } from '@angular/forms';

import { AdminService } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { AuthService } from '../../../core/auth.service';
import { Subscription } from 'rxjs';
import { ACCESS_KEYS, AccessKey, AccessKeyTier, grantTier } from '../../../core/access-keys';
import { PHONE_PATTERN } from '../../../core/phone';

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
export class UserFormComponent implements OnInit, OnChanges, OnDestroy {

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

  readonly genders = ['Male', 'Female', 'Prefer not to say'];
  /**
   * Built-in access keys (2026-11-14): one row per key that gives something
   * (core/access-keys.ts) — always shown, even before any department uses the
   * key — with only the tiers that key really has. `names` = the departments
   * carrying the key (the tooltip). A TL sees only their own department's key.
   * Stored list (stable identities for *ngFor).
   */
  accessKeys: (AccessKey & { names: string })[] = [];
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
    gender: new FormControl<string>('', { nonNullable: true }),
    // Contact number (optional): 7 to 15 digits, spaces and a leading + allowed.
    phone: new FormControl<string>('', { nonNullable: true, validators: Validators.pattern(PHONE_PATTERN) })
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

  trackTier(_: number, t: AccessKeyTier): string {
    return t.tier;
  }

  /** What the picked tier of this key gives (the line under the chips). */
  givesOf(k: AccessKey): string {
    return k.tiers.find(t => t.tier === this.keySelections[k.key])?.gives || '';
  }

  /** The department list can arrive after the form opens: rebuild the rows, keeping picks. */
  ngOnChanges(changes: SimpleChanges) {
    if (changes['departments'] && !changes['departments'].firstChange) {
      const kept = { ...this.keySelections };
      this.buildAccessKeys();
      Object.keys(kept).forEach(k => { if (k in this.keySelections) this.keySelections[k] = kept[k]; });
      if (this.isEdit && this.user) this.populateFromUser();
      // Create: the department may have been picked before its list arrived.
      else if (!this.defaultedKey) this.defaultHomeRead(this.form.controls.homeDepartment.value);
    }
  }

  /** One row per built-in key that has tiers, with the names of the departments carrying it. */
  private buildAccessKeys() {
    const byKey = new Map<string, string[]>();
    this.departments.forEach(d => {
      const key = this.authService.deptKeyOf(d);
      if (!key) return;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(d.name);
    });
    this.accessKeys = ACCESS_KEYS
      .filter(k => k.tiers.length > 0)
      // A TL only gets their own department(s) in `departments`, so only that key.
      .filter(k => this.isTopLevel || byKey.has(k.key))
      .map(k => ({ ...k, names: (byKey.get(k.key) || []).sort((a, b) => a.localeCompare(b)).join(', ') }));
    this.keySelections = {};
    this.accessKeys.forEach(k => { this.keySelections[k.key] = 'none'; });
  }

  /** The key whose Read was picked by default for the current home department (see defaultHomeRead). */
  private defaultedKey = '';
  private homeSub?: Subscription;

  /**
   * Picking a home department picks Read on that department's key by default
   * (user, 2026-11-14) — the rest is extra access. Only when the key has a Read
   * tier and nothing is picked on it yet. Changing the department takes that
   * default back off the old key, unless it was raised or was there before.
   */
  private defaultHomeRead(deptId: string | null) {
    if (this.defaultedKey && this.keySelections[this.defaultedKey] === 'read') this.keySelections[this.defaultedKey] = 'none';
    this.defaultedKey = '';
    const dept = this.departments.find(d => d._id === deptId);
    const row = dept && this.accessKeys.find(k => k.key === this.authService.deptKeyOf(dept));
    // Not for a key where membership gives nothing (Volunteers — the Unassigned pool).
    if (!row || row.noHomeRead || !row.tiers.some(t => t.tier === 'read') || this.keySelections[row.key] !== 'none') return;
    this.keySelections[row.key] = 'read';
    this.defaultedKey = row.key;
  }

  ngOnDestroy() {
    this.homeSub?.unsubscribe();
  }

  ngOnInit() {
    this.buildAccessKeys();
    this.homeSub = this.form.controls.homeDepartment.valueChanges.subscribe(id => this.defaultHomeRead(id));

    if (this.isEdit) {
      this.form.controls.password.disable();
      this.form.controls.confirmPassword.disable();
      this.populateFromUser();
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

    // Loading the user is not "picking" a department: no default Read on top of their saved grants.
    this.form.patchValue({
      userName: u.name,
      email: u.email,
      role: u.role?.name || u.role || '',
      homeDepartment: homeDeptId || '',
      dateOfJoining: u.dateOfJoining ? u.dateOfJoining.substring(0, 10) : null,
      foodPreference: u.foodPreference === 'non-veg' ? 'non-veg' : 'veg',
      gender: u.gender || '',
      phone: u.phone || ''
    }, { emitEvent: false });

    // Only grants that do something (built-in key, a tier it uses) show as picked.
    (u.permissions || []).forEach((perm: string) => {
      const g = grantTier(perm);
      if (g && g.key in this.keySelections) this.keySelections[g.key] = g.tier;
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
      ...(raw.phone.trim() ? { phone: raw.phone.trim() } : {}),
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
      ...(raw.gender ? { gender: raw.gender } : {}),
      phone: raw.phone.trim()   // empty clears it
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
