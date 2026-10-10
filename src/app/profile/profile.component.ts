import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProfileService } from './profile.service';
import { Subscription, lastValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';
import { DepartmentService, MyAttendanceRecord } from '../core/department.service';
import { deptShortCode } from '../core/department.utils';
import { AvatarService } from '../core/avatar.service';
import { ConfirmationService } from '../shared/confirm-dialog/confirmation.service';

interface PermissionEntry {
  moduleKey: string;
  displayName: string;
  level: 'read' | 'write' | 'manage';
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
  photoBusy = false;

  memberDepartments: string[] = [];
  permissionEntries: PermissionEntry[] = [];
  readonly superuserRoles = ['DEV', 'DIR'];

  attendanceHistory: MyAttendanceRecord[] = [];
  loadingAttendance = false;
  readonly deptShortCode = deptShortCode;

  get isSuperuser(): boolean {
    return this.superuserRoles.includes(this.loggedInRole);
  }

  constructor(
    private fb: FormBuilder,
    private profileService: ProfileService,
    private authService: AuthService,
    private notificationService: NotificationService,
    private departmentService: DepartmentService,
    private avatarService: AvatarService,
    private confirmationService: ConfirmationService
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
      if (user?._id) {
        this.loadProfile();
        this.loadAttendanceHistory();
      }
    });
  }

  loadAttendanceHistory() {
    this.loadingAttendance = true;
    this.departmentService.getMyAttendance().subscribe({
      next: (records) => {
        // Most-recent-first for a profile history view.
        this.attendanceHistory = records.slice().reverse();
        this.loadingAttendance = false;
      },
      error: () => { this.loadingAttendance = false; }
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
        this.buildMemberDepartments(user);
        this.buildPermissionEntries(user);
      },
      error: (err) => console.error(err)
    });
  }

  private buildMemberDepartments(user: any) {
    this.memberDepartments = (user.departments || []).map((da: any) => da.department?.name || da.department);
  }

  private buildPermissionEntries(user: any) {
    const map = this.authService.getEffectivePermissionMap(user);
    this.permissionEntries = Object.entries(map).map(([moduleKey, level]) => ({
      moduleKey,
      displayName: moduleKey.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
      level
    }));
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

    lastValueFrom(this.profileService.updateProfile(this.loggedInUser._id, {
      name: payload.name,
      email: payload.email,
      roleName: payload.role
    })).then(() => {
      this.notificationService.openSucessSnackBar('Profile saved successfully');
      this.isEditMode = false;
      this.profileForm.disable();
      this.loadProfile();
    }).catch(err => {
      console.error(err);
      this.notificationService.openErrorSnackBar('Error saving profile');
    });
  }

  get hasPhoto(): boolean {
    return !!this.loggedInUser?._id
      && this.avatarService.effectiveVersion(this.loggedInUser._id, this.profileData?.avatarVersion) > 0;
  }

  changePhoto() {
    if (!this.loggedInUser?._id || this.photoBusy) return;
    this.photoBusy = true;
    this.avatarService.changePhoto(this.loggedInUser._id, 'Your profile photo').subscribe({
      next: version => {
        if (this.profileData) this.profileData.avatarVersion = version;
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

  removePhoto() {
    if (!this.loggedInUser?._id || this.photoBusy) return;
    this.confirmationService.confirm({
      title: 'Remove Photo',
      message: 'Remove your profile photo? Your initial will be shown instead.',
      confirmText: 'Remove',
      danger: true
    }).subscribe(confirmed => {
      if (!confirmed) return;
      this.photoBusy = true;
      this.avatarService.remove(this.loggedInUser._id).subscribe({
        next: () => {
          this.photoBusy = false;
          if (this.profileData) this.profileData.avatarVersion = 0;
          this.notificationService.openSucessSnackBar('Photo removed');
        },
        error: err => {
          this.photoBusy = false;
          this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not remove photo');
        }
      });
    });
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }
}
