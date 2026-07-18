import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from './core/auth.service';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription } from 'rxjs';
import { MatSnackBar, MatSnackBarHorizontalPosition, MatSnackBarVerticalPosition } from '@angular/material/snack-bar';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'big-app-ui';
  isAuthenticated = false;
  isMobile = false;

  horizontalPosition: MatSnackBarHorizontalPosition = 'right';
  verticalPosition: MatSnackBarVerticalPosition = 'top';

  private authSub!: Subscription;
  private breakpointSub!: Subscription;

  constructor(
    private authService: AuthService,
    private _snackBar: MatSnackBar,
    private breakpointObserver: BreakpointObserver
  ) {}

  /** Open sidebar automatically on desktop when authenticated; close on mobile/logged-out */
  get sidenavOpen(): boolean {
    return this.isAuthenticated && !this.isMobile;
  }

  ngOnInit() {
    this.authService.autoLogin();

    this.authSub = this.authService.user.subscribe(user => {
      this.isAuthenticated = !!user;
    });

    this.breakpointSub = this.breakpointObserver
      .observe(['(max-width: 768px)'])
      .subscribe(result => {
        this.isMobile = result.matches;
      });
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
    this.breakpointSub?.unsubscribe();
  }

  openSnackBar(message: string, action: string) {
    this._snackBar.open(message, action, {
      duration: 2000,
      horizontalPosition: this.horizontalPosition,
      verticalPosition: this.verticalPosition
    });
  }
}
