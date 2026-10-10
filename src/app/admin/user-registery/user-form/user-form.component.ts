import { Component, EventEmitter, Input, OnInit, Output } from '@angular/core';
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
export class UserFormComponent implements OnInit {

  @Input() mode: UserFormMode = 'create';
  /** The user being edited (edit mode only). */
  @Input() user: any = null;
  @Input() roles: { _id: string; name: string }[] = [];
  /** DEV/DIR/ADMIN: every department. TL: only their own. */
  @Input() departments: { _id: string; name: string }[] = [];
  @Input() isTopLevel = false;

  /** Emits the created/updated user as returned by the backend. */
  @Output() saved = new EventEmitter<any>();
  @Output() cancelled = new EventEmitter<void>();

  readonly permLevels: PermLevel[] = ['read', 'write', 'manage'];
  deptSelections: { [deptId: string]: PermLevel } = {};
  saving = false;

  form = new FormGroup({
    userName: new FormControl<string | null>(null, Validators.required),
    email: new FormControl<string | null>(null, [Validators.required, Validators.email]),
    password: new FormControl<string | null>(null, Validators.required),
    confirmPassword: new FormControl<string | null>(null, Validators.required),
    role: new FormControl<string>('', Validators.required),
    homeDepartment: new FormControl<string>('', Validators.required),
    dateOfJoining: new FormControl<string | null>(null, Validators.required)
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
   *  the edited user's own role so the locked dropdown still shows it. */
  get roleOptions(): { _id: string; name: string }[] {
    if (this.roles.length) return this.roles;
    const own = this.user?.role?.name || this.user?.role;
    return own ? [{ _id: '', name: own }] : [];
  }

  ngOnInit() {
    this.departments.forEach(d => { this.deptSelections[d._id] = 'none'; });

    if (this.isEdit) {
      this.form.controls.password.disable();
      this.form.controls.confirmPassword.disable();
      this.populateFromUser();
    } else {
      const general = this.departments.find(d => d.name.toLowerCase() === 'general');
      if (general) this.deptSelections[general._id] = 'read';
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
      dateOfJoining: u.dateOfJoining ? u.dateOfJoining.substring(0, 10) : null
    });

    (u.permissions || []).forEach((perm: string) => {
      const [module, action] = perm.split(':');
      const dept = this.departments.find(d => this.authService.deptNameToKey(d.name) === module);
      if (dept && this.permLevels.includes(action as PermLevel)) {
        this.deptSelections[dept._id] = action as PermLevel;
      }
    });
  }

  setDeptLevel(deptId: string, level: PermLevel) {
    // Clicking the active level deselects the department
    this.deptSelections[deptId] = this.deptSelections[deptId] === level ? 'none' : level;
  }

  buildPermissions(): string[] {
    const permissions: string[] = [];
    Object.entries(this.deptSelections).forEach(([deptId, level]) => {
      if (level !== 'none') {
        const dept = this.departments.find(d => d._id === deptId);
        if (dept) permissions.push(`${this.authService.deptNameToKey(dept.name)}:${level}`);
      }
    });
    return permissions;
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
      dateOfJoining: raw.dateOfJoining
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
      permissions: this.buildPermissions()
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
