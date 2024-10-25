import { Component, OnInit } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Workshop } from '../core/workshop.model';
import { AdminService } from './admin.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})

export class AdminComponent implements OnInit {
  addWorkshopForm: FormGroup;  
  formData = new FormData();
  file: File = null;

  registerForm: FormGroup;
  genders = ['male', 'female'];

  constructor(private adminService: AdminService) {
    this.registerForm = new FormGroup({
      'userName': new FormControl(null, Validators.required),
      'email': new FormControl(null, [Validators.required, Validators.email]),
      'password': new FormControl(null, [Validators.required, this.ticketValidator]),
      'confirmPassword': new FormControl(null, [Validators.required, this.passwordMatchValidator])
    });
  }

  ngOnInit() {
    
  }

  ticketValidator(control: FormControl): {[s: string]:boolean} {
    debugger;
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
    let workshopDetails: Workshop = {
      workshopName: this.addWorkshopForm.controls.workshopName.value,
      workshopVenue: this.addWorkshopForm.controls.workshopVenue.value,
      startsAt: this.addWorkshopForm.controls.startsAt.value,
      registrationTime: this.addWorkshopForm.controls.registrationTime.value,
    };

    this.adminService.addWorkshop(workshopDetails).subscribe(res=> {
      console.log(res);
    }, error=> {

    })   
  }

  uploadWorkshopImage() {
    this.adminService.addWorkshopImage(this.formData).subscribe(res=> {

    }, error => {

    });
  }

  onChange(event) { 
    let file = event.target.files[0]; 
    this.formData.append("workshop", file);
    console.log(this.formData);
  }

}
