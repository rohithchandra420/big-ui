import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Workshop } from '../core/workshop.model';
import { AdminService } from './admin.service';
import { User } from '../core/user.model';
import { NotificationService } from '../core/notification.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})

export class AdminComponent implements OnInit {
  addWorkshopForm: FormGroup;  
  formData = new FormData();
  file: File = null;

  userFrom: FormGroup;
  genders = ['male', 'female'];

  constructor(private adminService: AdminService, private notificationService: NotificationService) {
    this.userFrom = new FormGroup({
      'userName': new FormControl(null, Validators.required),
      'email': new FormControl(null, [Validators.required, Validators.email]),
      'password': new FormControl(null, [Validators.required, this.ticketValidator]),
      'confirmPassword': new FormControl(null, [Validators.required, this.passwordMatchValidator]),
      'role': new FormControl('', Validators.required)
    });
  }

  ngOnInit() {
    
  }

  ticketValidator(control: FormControl): {[s: string]:boolean} {
    if(control.value < 1) {
      return {'inValidNoOfTickets': true};
    }
    return null;
  }

  passwordMatchValidator(form: FormGroup) {
    const password = form.get('password')?.value;
    const confirmPassword = form.get('confirmPassword')?.value;

    return form.get('password')?.value === form.get('confirmPassword')?.value
      ? null : { mismatch: true };
  }

  onSubmit() {
    let userDetails = {
      name: this.userFrom.controls.userName.value,
      email: this.userFrom.controls.email.value,
      password: this.userFrom.controls.password.value,
      role: this.userFrom.controls.role.value      
    }

    console.log(userDetails);
    this.adminService.createUser(userDetails).subscribe((res) => {
      this.notificationService.openSucessSnackBar("User " + res.name + " created Successfully");
    }, (error) => {
      this.notificationService.openErrorSnackBar("Could not create User");
    })
    //const userDetails = new User()

      
  }

  onChange(event) { 
    let file = event.target.files[0]; 
    this.formData.append("workshop", file);
    console.log(this.formData);
  }

}
