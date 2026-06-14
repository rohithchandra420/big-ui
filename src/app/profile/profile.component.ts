import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ProfileService } from './profile.service';
import { Subscription } from "rxjs";
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-profile',
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css']
})
export class ProfileComponent implements OnInit {

  profileForm!: FormGroup;
  private userSub: Subscription;
  isEditMode = false;
  userDetails: any;
  profilePreview: string = 'assets/default-user.png';



  constructor(private fb: FormBuilder, private profileService: ProfileService, private authService: AuthService) {
    this.userSub = this.authService.user.subscribe(user => {
      this.userDetails = user;
      this.loadProfile();
    });
  }

  ngOnInit(): void {
    this.profileForm = this.fb.group({
      name: ['', Validators.required],
      phone: ['', [Validators.required, Validators.pattern(/^[0-9]{10}$/)]],
      email: ['', [Validators.required, Validators.email]],
      role: ['']
    });

    // Later you will patch values from API
    // this.profileForm.patchValue({...})

   
  }

  toggleEdit() {
    this.isEditMode = !this.isEditMode;

    if (this.isEditMode) {
      this.profileForm.enable();
      this.profileForm.get('role')?.disable(); // role should NEVER be editable
    } else {
      this.profileForm.disable();
      this.loadProfile(); // reset values if user cancels
    }
  }

  loadProfile() {
    this.profileService.getProfileDetails(this.userDetails._id).subscribe({
      next: (user) => {

        this.profileForm.patchValue({
          name: user.name,
          phone: user.phone || '',
          email: user.email,
          role: user.role
        });
      },
      error: (err) => {
        console.error(err);
      }
    });
  }

  saveProfile() {
    if (this.profileForm.invalid) {
      this.profileForm.markAllAsTouched();
      return;
    }

    const payload = this.profileForm.getRawValue();

    this.profileService.updateProfile(this.userDetails._id, payload).subscribe({
      next: () => {
        this.isEditMode = false;
        this.profileForm.disable();
        console.log('Profile updated');
      },
      error: (err) => {
        console.error(err);
      }
    });
  }

  onFileSelect(event: any) {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        this.profilePreview = reader.result as string;
      };
      reader.readAsDataURL(file);
    }
  }

  ngOnDestroy() {
    this.userSub.unsubscribe();
  }
}
