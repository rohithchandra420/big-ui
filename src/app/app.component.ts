import { Component, OnInit } from '@angular/core';
import { ActivatedRouteSnapshot } from '@angular/router';
import { AuthService } from './core/auth.service';

import {MatSnackBar, MatSnackBarHorizontalPosition, MatSnackBarVerticalPosition} from '@angular/material/snack-bar'; 

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit{
  title = 'big-app-ui';
  horizontalPosition: MatSnackBarHorizontalPosition = 'right';
  verticalPosition: MatSnackBarVerticalPosition = 'top';  

  constructor(private authService: AuthService, private _snackBar: MatSnackBar) {
    //localStorage.clear();
  }

  ngOnInit() {
    this.authService.autoLogin();
  }

  openSnackBar(message: string, action: string) { 
    this._snackBar.open(message, action, { 
      duration: 2000, 
      horizontalPosition: this.horizontalPosition,
      verticalPosition: this.verticalPosition
    }); 
  } 
  
}


