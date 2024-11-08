import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CustomMaterialModule } from './core/material.module';
import { AppRoutingModule } from './core/app-routing.module';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { NgxScannerQrcodeModule, LOAD_WASM } from 'ngx-scanner-qrcode';

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
    OccupantPopupComponent
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
    MatDialogModule
  ],
  providers: [
    AuthService, 
    AuthGuard,
    TicketsService, 
    NotificationService,
    DashboardService,
    AccomodationService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptorService, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
