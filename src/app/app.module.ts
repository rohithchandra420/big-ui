import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { CustomMaterialModule } from './core/material.module';
import { AppRoutingModule } from './core/app-routing.module';
import { HTTP_INTERCEPTORS, HttpClientModule } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';

import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatRippleModule } from '@angular/material/core';
import { MatDialogModule } from '@angular/material/dialog';

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
import { TicketDetailsPopUp } from './tickets/ticket.details.popup/ticket.details.popup';





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
    TicketDetailsPopUp
  ],
  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    FormsModule,
    CustomMaterialModule,
    AppRoutingModule,
    ReactiveFormsModule,
    HttpClientModule,
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
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptorService, multi: true }
  ],
  bootstrap: [AppComponent]
})
export class AppModule { }
