import { Component, OnDestroy, OnInit } from '@angular/core';
import { User } from '../core/user.model';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { AuthService } from '../core/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit, OnDestroy {
  username: string;
  password: string;
  showSpinner: boolean;
  user: User;
  private errorSub: Subscription;
  loginError;



  constructor(private http: HttpClient, private authService: AuthService) {

  }


  ngOnInit() {
    this.showSpinner = true;
    this.errorSub = this.authService.loginErrorMessageEmitter.subscribe(errorMessage => {
      debugger;
      this.loginError = errorMessage;
    })
  }

  // login(): void {
  //   if (this.username == 'admin') {
  //     //this.router.navigate(["user"]);
  //     this.user = new User("Admin", "Ad1", "God");
  //     this.showSpinner = false;
  //     debugger;
  //     this.navigateToHome();
  //   } else {
  //     alert("Invalid credentials");
  //     this.showSpinner = true;
  //   }
  // }

  // navigateToHome(): void {
  //   this.router.navigate(['/dashboard']);
  // }

  login() {
    console.log(this.username, this.password);
    let loginData = {
      "email": this.username,
      "password": this.password
    }
    this.authService.logIn(loginData);

  }

  logout() {
    this.authService.logOut();
  }

  ngOnDestroy() {
    this.errorSub.unsubscribe();
  }

  signUp() {
    let userDetails = {
      "name": "Admin",
      "gender": "M",
      "email": "Admin123@gmail.com",
      "password": "Admin@123",
      "bookingId": "TestBookingId1",
      "ticketId": "TicketID1"
    };
    this.authService.signUp(userDetails)
  }


}
