import { LOCALE_ID, NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CustomMaterialModule } from './core/material.module';
import { AppRoutingModule } from './core/app-routing.module';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';

import { NgxScannerQrcodeModule, LOAD_WASM } from 'ngx-scanner-qrcode';

import { CalendarModule, DateAdapter, MOMENT } from 'angular-calendar';
import { adapterFactory } from 'angular-calendar/date-adapters/date-fns';
import { SchedulerModule } from 'angular-calendar-scheduler';

import { MatCardModule } from '@angular/material/card';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatRippleModule } from '@angular/material/core';
import { MatDialogModule } from '@angular/material/dialog';
//import { NgChartsModule } from 'ng2-charts';

import { AppComponent } from './app.component';
import { HeaderComponent } from './header/header.component';
import { HomeComponent } from './home/home.component';
import { LoginComponent } from './login/login.component';
import { RegistrationComponent } from './registration/registration.component';
import { DashboardComponent } from './dashboard/dashboard.component';
import { AuthService } from './core/auth.service';
import { AuthGuard } from './core/auth-guard.service';
import { ErrorPageComponent } from './error-page/error-page.component';
import { AdminComponent } from './admin/admin.component';
import { AuthInterceptorService } from './core/auth-interceptor.service';
import { AlertComponent } from './alert/alert.component';
import { TicketsComponent } from './tickets/tickets.component';
import { TicketsService } from './tickets/tickets.service';
import { NotificationService } from './core/notification.service';
import { TicketDetailsComponent } from './tickets/ticket.details/ticket.details.component';
import { QrscannerPopupComponent } from './tickets/qrscanner-popup/qrscanner-popup.component';
import { DashboardService } from './dashboard/dashboard.service';
import { AccomodationComponent } from './accomodation/accomodation.component';
import { AccomodationService } from './accomodation/accomodation.service';
import { UtcToLocalTimePipe } from './pipes/utc-to-local-time.pipe';
import { TentDetailsPopUp } from './tickets/ticket.details/tent.details.popup/tent.details.popup.component';
import { OccupantPopupComponent } from './accomodation/occupant-popup/occupant-popup.component';
import { AdminMenuComponent } from './admin/admin-menu/admin-menu.component';
import { UserRegisteryComponent } from './admin/user-registery/user-registery.component';
import { TicketRegisteryComponent } from './admin/ticket-registery/ticket-registery.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { CalendarComponent } from './calendar/calendar.component';
import { TaskPoolComponent } from './calendar/support/task-pool.component';

import * as moment from 'moment';
import { CalendarService } from './calendar/calendar.service';
import { HasPermissionDirective } from './directives/has-permission.directive';

// #QRCode Scanner: Necessary to solve the problem of losing internet connection
LOAD_WASM().subscribe()

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    AlertComponent,
    HomeComponent,
    LoginComponent,
    RegistrationComponent,
    DashboardComponent,
    ErrorPageComponent,
    AdminComponent,
    TicketsComponent,
    TicketDetailsComponent,
    QrscannerPopupComponent,
    AccomodationComponent,
    UtcToLocalTimePipe,
    TentDetailsPopUp,
    OccupantPopupComponent,
    AdminMenuComponent,
    UserRegisteryComponent,
    TicketRegisteryComponent,
    CalendarComponent,
    TaskPoolComponent,
    HasPermissionDirective
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    CustomMaterialModule,
    AppRoutingModule,
    ReactiveFormsModule,
    HttpClientModule,
    NgxScannerQrcodeModule,
    MatSnackBarModule,
    MatCardModule,
    MatTableModule,
    MatPaginatorModule,
    MatRippleModule,
    MatDialogModule,
    MatMenuModule,
    MatIconModule,

    CalendarModule.forRoot({
      provide: DateAdapter,
      useFactory: adapterFactory,
    }),
    SchedulerModule.forRoot({
      locale: 'en',
      headerDateFormat: 'daysRange',
      logEnabled: true,
    }),
  ],
  providers: [
    AuthService, 
    AuthGuard,
    TicketsService, 
    NotificationService,
    DashboardService,
    AccomodationService,
    CalendarService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptorService, multi: true },
    { provide: LOCALE_ID, useValue: 'en-US' },
    { provide: MOMENT, useValue: moment },
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
