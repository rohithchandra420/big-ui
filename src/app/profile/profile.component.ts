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
import { EventService } from '../core/event.service';
import { PHONE_PATTERN } from '../core/phone';

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

  savingFood = false;
  savingGender = false;
  savingPhone = false;
  /** What is typed in the Phone box; null until the person types (the saved number shows). */
  phoneDraft: string | null = null;
  readonly genders = ['Male', 'Female', 'Prefer not to say'];
  myStays: { _id: string; from: string; to: string; unit: string; type: string; icon: string; area: { _id: string; name: string } | null; movedInAt: string | null; movedOutAt: string | null }[] = [];
  private eventSub?: Subscription;
  mealQr = '';
  mealQrBusy = false;

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
    private confirmationService: ConfirmationService,
    private eventService: EventService
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
        this.loadMealQr();
        if (!this.eventSub) this.eventSub = this.eventService.activeEvent.subscribe(ev => this.loadMyStay(ev?._id));
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

  /** Hospitality: Veg / Non-veg for the kitchen count (missing = Veg). */
  get foodPreference(): 'veg' | 'non-veg' {
    return this.profileData?.foodPreference === 'non-veg' ? 'non-veg' : 'veg';
  }

  setFood(pref: 'veg' | 'non-veg') {
    if (pref === this.foodPreference || this.savingFood) return;
    this.savingFood = true;
    this.profileService.setFoodPreference(pref).subscribe({
      next: () => {
        this.profileData = { ...this.profileData, foodPreference: pref };
        this.savingFood = false;
        this.notificationService.openSucessSnackBar(pref === 'veg' ? 'You are down as Veg' : 'You are down as Non-veg');
      },
      error: () => {
        this.savingFood = false;
        this.notificationService.openErrorSnackBar('Could not save your food preference');
      }
    });
  }

  /** Hospitality H2: shown at the Serving desk. */
  loadMealQr() {
    this.profileService.getMealQr().subscribe({ next: r => this.mealQr = r.image, error: () => this.mealQr = '' });
  }

  newMealQr() {
    this.confirmationService.confirm({
      title: 'Get a New Meal QR',
      message: 'Your current meal QR (and any screenshot of it) will stop working at the Serving desk.',
      confirmText: 'Get a new QR'
    }).subscribe(ok => {
      if (!ok) return;
      this.mealQrBusy = true;
      this.profileService.resetMealQr().subscribe({
        next: r => { this.mealQr = r.image; this.mealQrBusy = false; this.notificationService.openSucessSnackBar('New meal QR ready'); },
        error: () => { this.mealQrBusy = false; this.notificationService.openErrorSnackBar('Could not make a new meal QR'); }
      });
    });
  }

  get phoneText(): string { return this.phoneDraft ?? this.profileData?.phone ?? ''; }
  get phoneChanged(): boolean { return this.phoneDraft !== null && this.phoneDraft.trim() !== (this.profileData?.phone || ''); }
  get phoneValid(): boolean { const p = this.phoneText.trim(); return !p || PHONE_PATTERN.test(p); }

  savePhone() {
    if (!this.phoneChanged || !this.phoneValid || this.savingPhone) return;
    this.savingPhone = true;
    this.profileService.setPhone(this.phoneText.trim()).subscribe({
      next: res => { this.profileData = { ...this.profileData, phone: res.phone }; this.phoneDraft = null; this.savingPhone = false; this.notificationService.openSucessSnackBar('Saved'); },
      error: () => { this.savingPhone = false; this.notificationService.openErrorSnackBar('Could not save your phone number'); }
    });
  }

  setGender(g: string) {
    if (g === this.profileData?.gender || this.savingGender) return;
    this.savingGender = true;
    this.profileService.setGender(g).subscribe({
      next: () => { this.profileData = { ...this.profileData, gender: g }; this.savingGender = false; this.notificationService.openSucessSnackBar('Saved'); },
      error: () => { this.savingGender = false; this.notificationService.openErrorSnackBar('Could not save your gender'); }
    });
  }

  /** Hospitality H6: where you sleep at the event picked in the sidebar. */
  private loadMyStay(eventId: string | undefined) {
    this.myStays = [];
    if (!eventId) return;
    this.profileService.getMyStay(eventId).subscribe({ next: r => this.myStays = r.stays, error: () => this.myStays = [] });
  }
  stayDate(d: string) { return new Date(d + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' }); }
  trackStay(_: number, s: { _id: string }) { return s._id; }

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
    this.eventSub?.unsubscribe();
  }
}
