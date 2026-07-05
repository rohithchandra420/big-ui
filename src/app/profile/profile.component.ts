import { Component, OnInit, OnDestroy } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProfileService } from './profile.service';
import { Subscription, lastValueFrom } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { NotificationService } from '../core/notification.service';

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
  profilePreview: string = 'assets/default-user.png';

  memberDepartments: string[] = [];
  permissionEntries: PermissionEntry[] = [];
  readonly superuserRoles = ['DEV', 'DIR'];

  get isSuperuser(): boolean {
    return this.superuserRoles.includes(this.loggedInRole);
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
