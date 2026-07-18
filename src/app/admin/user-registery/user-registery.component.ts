import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { AdminService } from '../admin.service';
import { User } from '../../core/user.model';
import { NotificationService } from '../../core/notification.service';
import { Subscription } from 'rxjs';
import { AuthService } from 'src/app/core/auth.service';

type PermLevel = 'none' | 'read' | 'write' | 'manage';

@Component({
  selector: 'app-user-registery',
  templateUrl: './user-registery.component.html',
  styleUrls: ['./user-registery.component.css']
})
export class UserRegisteryComponent implements OnInit, OnDestroy {

  private userSub!: Subscription;
  user: User | null = null;
  userRole: string = '';

  roles: { _id: string; name: string }[] = [];
  departments: { _id: string; name: string }[] = [];
  deptSelections: { [deptId: string]: PermLevel } = {};

  readonly permLevels: PermLevel[] = ['read', 'write', 'manage'];

  userList: any[] = [];
  isEditMode = false;
  selectedUser: any;

  userFrom: FormGroup;

  readonly topLevelRoles = ['DEV', 'DIR', 'ADMIN'];

  // DEV/DIR/ADMIN: full platform-wide create + edit access
  get isTopLevel(): boolean {
    return this.topLevelRoles.includes(this.userRole);
  }

  // TL: view/edit only, scoped to their own department (enforced server-side too)
  get isTL(): boolean {
    return this.userRole === 'TL';
  }

  get canCreateUsers(): boolean {
    return this.isTopLevel;
  }

  get canViewPage(): boolean {
    return this.isTopLevel || this.isTL;
  }

  constructor(
    private adminService: AdminService,
    private notificationService: NotificationService,
    private authService: AuthService
  ) {
    this.userFrom = new FormGroup({
      userName: new FormControl(null, Validators.required),
      email: new FormControl(null, [Validators.required, Validators.email]),
      password: new FormControl(null, Validators.required),
      confirmPassword: new FormControl(null, Validators.required),
      role: new FormControl('', Validators.required),
      homeDepartment: new FormControl('', Validators.required)
    });
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
        this.userFrom.get('role')?.disable();
        this.userFrom.get('homeDepartment')?.disable();
      }
    });
    this.getAllUsers();
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }

  loadRoles() {
    this.adminService.getRoles().subscribe(roles => {
      this.roles = roles;
    }, () => {
      this.notificationService.openErrorSnackBar('Error loading roles');
    });
  }

  loadDepartments() {
    this.adminService.getDepartments().subscribe(depts => {
      this.departments = depts;
      this.deptSelections = {};
      depts.forEach(d => {
        this.deptSelections[d._id] = 'none';
      });
      const general = depts.find(d => d.name.toLowerCase() === 'general');
      if (general) this.deptSelections[general._id] = 'read';
    }, () => {
      this.notificationService.openErrorSnackBar('Error loading departments');
    });
  }

  // TL doesn't have access to /admin/departments — their one department is already
  // known from their own logged-in user object, so build the chip/dropdown list from that.
  private setupTLDepartmentContext() {
    const ownDept = this.user?.departments?.[0]?.department;
    this.departments = ownDept && typeof ownDept !== 'string'
      ? [{ _id: ownDept._id, name: ownDept.name }]
      : [];
    this.deptSelections = {};
    this.departments.forEach(d => { this.deptSelections[d._id] = 'none'; });
  }

  setDeptLevel(deptId: string, level: PermLevel) {
    // Clicking the active level deselects the department
    this.deptSelections[deptId] = this.deptSelections[deptId] === level ? 'none' : level;
  }

  private buildPermissions(): string[] {
    const permissions: string[] = [];
    Object.entries(this.deptSelections).forEach(([deptId, level]) => {
      if (level !== 'none') {
        const dept = this.departments.find(d => d._id === deptId);
        if (dept) permissions.push(`${this.authService.deptNameToKey(dept.name)}:${level}`);
      }
    });
    return permissions;
  }

  onSubmit() {
    if (!this.canCreateUsers || this.userFrom.invalid) return;

    const permissions = this.buildPermissions();
    const homeDepartmentId = this.userFrom.value.homeDepartment;

    const userDetails = {
      name: this.userFrom.value.userName,
      email: this.userFrom.value.email,
      password: this.userFrom.value.password,
      roleName: this.userFrom.value.role,
      departmentIds: homeDepartmentId ? [homeDepartmentId] : [],
      permissions
    };

    this.adminService.createUser(userDetails).subscribe(res => {
      this.notificationService.openSucessSnackBar('User ' + res.name + ' created successfully');
      this.getAllUsers();
      this.switchMode();
    }, () => {
      this.notificationService.openErrorSnackBar('Could not create user');
    });
  }

  canEditUser(user: any): boolean {
    if (this.isTopLevel) return true;
    if (!this.isTL) return false;
    const ownDeptId = this.user?.departments?.[0]?.department?._id;
    const userDept = user.departments?.[0]?.department;
    const userDeptId = userDept && typeof userDept !== 'string' ? userDept._id : userDept;
    return !!ownDeptId && ownDeptId === userDeptId;
  }

  getAccessLabel(user: any): string {
    const homeDept = user.departments?.[0]?.department;
    const deptName = homeDept && typeof homeDept !== 'string' ? homeDept.name : null;
    if (!deptName) return '—';

    const key = this.authService.deptNameToKey(deptName);
    const roleName = user.role?.name || user.role || '';
    const map = this.authService.getEffectivePermissionMap({
      role: roleName,
      permissions: user.permissions,
      departments: user.departments
    } as any);
    const level = map[key];
    return level ? level.charAt(0).toUpperCase() + level.slice(1) : 'Read Only';
  }

  editUser(user: any) {
    if (!this.canEditUser(user)) return;

    this.isEditMode = true;
    this.selectedUser = user;
    this.userFrom.controls['password'].disable();
    this.userFrom.controls['confirmPassword'].disable();
    this.userFrom.get('userName')?.setValue(user.name);
    this.userFrom.get('email')?.setValue(user.email);
    this.userFrom.get('role')?.setValue(user.role?.name || user.role);

    const userDept = user.departments?.[0]?.department;
    const userDeptId = userDept && typeof userDept !== 'string' ? userDept._id : userDept;
    this.userFrom.get('homeDepartment')?.setValue(userDeptId || '');

    if (!this.isTopLevel) {
      // TL: role and home department are locked, only their own department's
      // permission chip (already the sole row in `departments`) is editable
      this.roles = [{ _id: '', name: user.role?.name || user.role || '' }];
      this.userFrom.get('role')?.disable();
      this.userFrom.get('homeDepartment')?.disable();
    }

    // Reset all chip rows to none, then restore from user.permissions strings
    this.departments.forEach(d => {
      this.deptSelections[d._id] = 'none';
    });
    if (user.permissions) {
      user.permissions.forEach((perm: string) => {
        const [module, action] = perm.split(':');
        const dept = this.departments.find(d => this.authService.deptNameToKey(d.name) === module);
        if (dept && this.permLevels.includes(action as PermLevel)) {
          this.deptSelections[dept._id] = action as PermLevel;
        }
      });
    }
  }

  updateUser() {
    if (!this.isEditMode) return;

    const permissions = this.buildPermissions();
    const raw = this.userFrom.getRawValue();

    const updateDetails: any = {
      _id: this.selectedUser._id,
      name: raw.userName,
      email: raw.email,
      roleName: raw.role,
      permissions
    };

    if (this.isTopLevel) {
      updateDetails.departments = raw.homeDepartment ? [{ departmentId: raw.homeDepartment, access: ['read'] }] : [];
    }

    this.adminService.updateUser(updateDetails).subscribe(() => {
      this.getAllUsers();
      this.notificationService.openSucessSnackBar('User updated successfully');
      this.switchMode();
    }, error => {
      this.notificationService.openErrorSnackBar('Failed to update: ' + error?.error);
    });
  }

  switchMode() {
    this.isEditMode = false;
    this.userFrom.reset();
    this.userFrom.controls['password'].enable();
    this.userFrom.controls['confirmPassword'].enable();

    if (this.isTopLevel) {
      this.loadDepartments();
    } else if (this.isTL) {
      this.setupTLDepartmentContext();
      this.userFrom.get('role')?.disable();
      this.userFrom.get('homeDepartment')?.disable();
    }
  }

  getAllUsers() {
    this.adminService.getAllUsers().subscribe(res => {
      this.userList = res || [];
    }, () => {
      this.notificationService.openErrorSnackBar('Error fetching users');
    });
  }

  deleteUser() {
    // TODO: implement delete confirmation
  }
}
