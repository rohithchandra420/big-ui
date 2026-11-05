import { Component, OnInit, OnDestroy } from '@angular/core';
import { AuthService } from './core/auth.service';
import { BreakpointObserver } from '@angular/cdk/layout';
import { Subscription, combineLatest } from 'rxjs';
import { EventService } from './core/event.service';
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
    private breakpointObserver: BreakpointObserver,
    private eventService: EventService
  ) {}

  /** Open sidebar automatically on desktop when authenticated; close on mobile/logged-out */
  /**
   * Staff list (STAFF_LIST_CONTEXT.md): a Team Lead / Volunteer who isn't on
   * the staff list of any current event sees why their event pages are empty.
   */
  noEventNotice = false;
  private staffSub?: Subscription;

  get sidenavOpen(): boolean {
    return this.isAuthenticated && !this.isMobile;
  }

  ngOnInit() {
    this.authService.autoLogin();

    this.authSub = this.authService.user.subscribe(user => {
      this.isAuthenticated = !!user;
    });

    this.staffSub = combineLatest([this.authService.user, this.eventService.events, this.eventService.eventsLoaded])
      .subscribe(([user, events, loaded]) => {
        const role = (user as any)?.role || '';
        this.noEventNotice = !!user && loaded && !events.length && !['DEV', 'DIR', 'ADMIN'].includes(role);
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
    this.staffSub?.unsubscribe();
  }

  openSnackBar(message: string, action: string) {
    this._snackBar.open(message, action, {
      duration: 2000,
      horizontalPosition: this.horizontalPosition,
      verticalPosition: this.verticalPosition
    });
  }
}
