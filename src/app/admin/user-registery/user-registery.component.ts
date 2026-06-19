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

  readonly managerRoles = ['DEV', 'DIR', 'ADMIN'];

  get canManageUsers(): boolean {
    return this.managerRoles.includes(this.userRole);
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
      role: new FormControl('', Validators.required)
    });
  }

  ngOnInit() {
    this.userSub = this.authService.user.subscribe(user => {
      this.user = user;
      this.userRole = user?.role || '';
    });
    this.loadRoles();
    this.loadDepartments();
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

  setDeptLevel(deptId: string, level: PermLevel) {
    // Clicking the active level deselects the department
    this.deptSelections[deptId] = this.deptSelections[deptId] === level ? 'none' : level;
  }

  private deptNameToKey(name: string): string {
    return name.toLowerCase().replace(/\s+/g, '-');
  }

  private buildPayload(): { permissions: string[]; departmentIds: string[] } {
    const permissions: string[] = [];
    const departmentIds: string[] = [];
    Object.entries(this.deptSelections).forEach(([deptId, level]) => {
      if (level !== 'none') {
        departmentIds.push(deptId);
        const dept = this.departments.find(d => d._id === deptId);
        if (dept) permissions.push(`${this.deptNameToKey(dept.name)}:${level}`);
      }
    });
    return { permissions, departmentIds };
  }

  onSubmit() {
    if (!this.canManageUsers || this.userFrom.invalid) return;

    const { permissions, departmentIds } = this.buildPayload();

    const userDetails = {
      name: this.userFrom.value.userName,
      email: this.userFrom.value.email,
      password: this.userFrom.value.password,
      roleName: this.userFrom.value.role,
      departmentIds,
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

  editUser(user: any) {
    this.isEditMode = true;
    this.selectedUser = user;
    this.userFrom.controls['password'].disable();
    this.userFrom.controls['confirmPassword'].disable();
    this.userFrom.get('userName')?.setValue(user.name);
    this.userFrom.get('email')?.setValue(user.email);
    this.userFrom.get('role')?.setValue(user.role?.name || user.role);

    // Reset all to none, then restore from user.permissions strings
    this.departments.forEach(d => {
      this.deptSelections[d._id] = 'none';
    });
    if (user.permissions) {
      user.permissions.forEach((perm: string) => {
        const [module, action] = perm.split(':');
        const dept = this.departments.find(d => this.deptNameToKey(d.name) === module);
        if (dept && this.permLevels.includes(action as PermLevel)) {
          this.deptSelections[dept._id] = action as PermLevel;
        }
      });
    }
  }

  updateUser() {
    if (!this.canManageUsers) return;

    const { permissions, departmentIds } = this.buildPayload();
    const departments = departmentIds.map(id => ({ departmentId: id, access: ['read'] }));

    const updateDetails = {
      _id: this.selectedUser._id,
      name: this.userFrom.value.userName,
      email: this.userFrom.value.email,
      roleName: this.userFrom.value.role,
      departments,
      permissions
    };

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
    this.userFrom.controls['password'].enable();
    this.userFrom.controls['confirmPassword'].enable();
    this.userFrom.reset();
    this.loadDepartments();
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
