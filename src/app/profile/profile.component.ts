import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProfileService } from './profile.service';
import { Subscription, lastValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';

interface DeptMatrixEntry {
  deptId: string;
  deptName: string;
  currentAccess: string[];
  editAccess: 'read' | 'read_write';
}

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit, OnDestroy {

  profileForm!: FormGroup;
  private userSub!: Subscription;
  isEditMode = false;
  loggedInUser: any;
  loggedInRole: string = '';
  profileData: any;
  profilePreview: string = 'assets/default-user.png';

  deptMatrix: DeptMatrixEntry[] = [];
  readonly superuserRoles = ['DEV', 'DIR'];
  readonly elevatedRoles = ['DEV', 'DIR', 'ADMIN'];

  get isSuperuser(): boolean {
    return this.superuserRoles.includes(this.loggedInRole);
  }

  get canEditMatrix(): boolean {
    return this.elevatedRoles.includes(this.loggedInRole) || this.loggedInRole === 'TL';
  }

  constructor(
    private fb: FormBuilder,
    private profileService: ProfileService,
    private authService: AuthService,
    private notificationService: NotificationService
  ) {}

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      name: ['', Validators.required],
      phone: ['', [Validators.pattern(/^[0-9]{10}$/)]],
      email: ['', [Validators.required, Validators.email]],
      role: ['']
    });
    this.profileForm.disable();

    this.userSub = this.authService.user.subscribe(user => {
      this.loggedInUser = user;
      this.loggedInRole = user?.role || '';
      if (user?._id) this.loadProfile();
    });
  }

  loadProfile() {
    this.profileService.getProfileDetails(this.loggedInUser._id).subscribe({
      next: (user) => {
        this.profileData = user;
        this.profileForm.patchValue({
          name: user.name,
          phone: (user as any).phone || '',
          email: user.email,
          role: (user.role as any)?.name || user.role
        });
        this.buildDeptMatrix(user);
      },
      error: (err) => console.error(err)
    });
  }

  private buildDeptMatrix(user: any) {
    this.deptMatrix = (user.departments || []).map((da: any) => {
      const hasWrite = da.access?.includes('write');
      return {
        deptId: da.department?._id || da.department,
        deptName: da.department?.name || da.department,
        currentAccess: da.access || ['read'],
        editAccess: hasWrite ? 'read_write' : 'read'
      };
    });
  }

  setDeptAccess(deptId: string, access: 'read' | 'read_write') {
    const entry = this.deptMatrix.find(d => d.deptId === deptId);
    if (entry) entry.editAccess = access;
  }

  toggleEdit() {
    this.isEditMode = !this.isEditMode;
    if (this.isEditMode) {
      this.profileForm.enable();
      this.profileForm.get('role')?.disable();
    } else {
      this.profileForm.disable();
      this.loadProfile();
    }
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const payload = this.profileForm.getRawValue();
    const saves: Promise<void>[] = [];

    // Save basic profile fields
    saves.push(
      lastValueFrom(this.profileService.updateProfile(this.loggedInUser._id, {
        name: payload.name,
        email: payload.email,
        roleName: payload.role
      })).then(() => {})
    );

    // Save changed department access entries
    if (this.canEditMatrix) {
      this.deptMatrix.forEach(entry => {
        const newAccess = entry.editAccess === 'read_write' ? ['read', 'write'] : ['read'];
        const changed = JSON.stringify(entry.currentAccess.sort()) !== JSON.stringify(newAccess.sort());
        if (changed) {
          saves.push(
            lastValueFrom(this.profileService.updateDepartmentAccess({
              userId: this.loggedInUser._id,
              departmentId: entry.deptId,
              access: newAccess
            })).then(() => {})
          );
        }
      });
    }

    Promise.all(saves).then(() => {
      this.notificationService.openSucessSnackBar('Profile saved successfully');
      this.isEditMode = false;
      this.profileForm.disable();
      this.loadProfile();
    }).catch(err => {
      console.error(err);
      this.notificationService.openErrorSnackBar('Error saving profile');
    });
  }

  onFileSelect(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => { this.profilePreview = reader.result as string; };
      reader.readAsDataURL(file);
    }
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }
}
