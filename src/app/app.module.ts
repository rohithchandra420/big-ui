import { LOCALE_ID, NgModule, isDevMode } from '@angular/core';
import { ServiceWorkerModule } from '@angular/service-worker';
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
import { DashboardComponent } from './dashboard/dashboard.component';
import { AuthService } from './core/auth.service';
import { AuthGuard } from './core/auth-guard.service';
import { GuestGuard } from './core/guest-guard.service';
import { ErrorPageComponent } from './error-page/error-page.component';
import { AdminComponent } from './admin/admin.component';
import { AuthInterceptorService } from './core/auth-interceptor.service';
import { AlertComponent } from './alert/alert.component';
import { NotificationService } from './core/notification.service';
import { DashboardService } from './dashboard/dashboard.service';
import { AccomodationService } from './accomodation/accomodation.service';
import { UtcToLocalTimePipe } from './pipes/utc-to-local-time.pipe';
import { AdminMenuComponent } from './admin/admin-menu/admin-menu.component';
import { UserRegisteryComponent } from './admin/user-registery/user-registery.component';
import { UserFormComponent } from './admin/user-registery/user-form/user-form.component';
import { BulkUsersComponent } from './admin/user-registery/bulk-users/bulk-users.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule, MatIconRegistry } from '@angular/material/icon';

import * as moment from 'moment';
import { HasPermissionDirective } from './directives/has-permission.directive';
import { TooltipDirective } from './directives/tooltip.directive';
import { ProfileComponent } from './profile/profile.component';
import { DepartmentsComponent } from './admin/departments/departments.component';
import { DepartmentDetailComponent } from './admin/departments/department-detail/department-detail.component';
import { DepartmentDeleteDialogComponent } from './admin/departments/department-delete-dialog/department-delete-dialog.component';
import { BookingsComponent } from './box-office/bookings/bookings.component';
import { RegistrationComponent } from './box-office/registration/registration.component';
import { BookingFoundComponent } from './box-office/registration/booking-found/booking-found.component';
import { CounterFormComponent } from './box-office/registration/counter-form/counter-form.component';
import { BoxOfficeQrscannerPopupComponent } from './box-office/registration/qrscanner-popup/qrscanner-popup.component';
import { AllocateTentComponent } from './box-office/registration/allocate-tent/allocate-tent.component';
import { AttendeeListComponent } from './box-office/attendee-list/attendee-list.component';
import { TicketEditFormComponent } from './box-office/ticket-edit-form/ticket-edit-form.component';
import { SpotRegistrationComponent } from './box-office/registration/spot-registration/spot-registration.component';
import { BulkUploadComponent } from './box-office/bookings/bulk-upload/bulk-upload.component';
import { MyDepartmentComponent } from './my-department/my-department.component';
import { EventsComponent } from './admin/events/events.component';
import { EventDetailComponent } from './admin/events/event-detail/event-detail.component';
import { EmailReportComponent } from './admin/email-report/email-report.component';
import { EventCreateDialogComponent } from './admin/events/event-create-dialog/event-create-dialog.component';
import { AccommodationSetupComponent } from './accommodation/setup/accommodation-setup.component';
import { AccommodationInventoryComponent } from './accommodation/inventory/accommodation-inventory.component';
import { AppSelectComponent } from './shared/app-select/app-select.component';
import { AppOptionComponent } from './shared/app-select/app-option.component';
import { ConfirmDialogComponent } from './shared/confirm-dialog/confirm-dialog.component';
import { UserAvatarComponent } from './shared/user-avatar/user-avatar.component';
import { BandAlertComponent } from './shared/band-alert/band-alert.component';
import { BoxOfficeStatusComponent } from './box-office/box-office-status/box-office-status.component';
import { RichTextEditorComponent } from './shared/rich-text-editor/rich-text-editor.component';
import { TicketEmailDialogComponent } from './box-office/email/ticket-email-dialog/ticket-email-dialog.component';
import { CustomEmailDialogComponent } from './box-office/email/custom-email-dialog/custom-email-dialog.component';
import { EmailProgressComponent } from './box-office/email/email-progress/email-progress.component';
import { PwaStatusComponent } from './shared/pwa-status/pwa-status.component';
import { SectionHeaderComponent } from './shared/section-header/section-header.component';
import { SlidePanelComponent } from './shared/slide-panel/slide-panel.component';
import { TentFieldsComponent } from './accommodation/fields/tent-fields.component';
import { TentFieldComponent } from './accommodation/fields/tent-field.component';
import { FieldGridComponent } from './accommodation/fields/field-grid.component';
import { FieldPickerDialogComponent } from './accommodation/fields/field-picker-dialog.component';
import { NotificationSettingsComponent } from './profile/notification-settings/notification-settings.component';
import { AnnouncementsComponent } from './admin/announcements/announcements.component';
import { PublicPageComponent } from './admin/public-page/public-page.component';
import { SosComponent } from './sos/sos.component';
import { PublicPhotosComponent } from './admin/public-page/public-photos/public-photos.component';
import { UatResetComponent } from './admin/uat-reset/uat-reset.component'; // UAT-RESET: remove before Production
import { VenueMapComponent } from './venue-map/venue-map.component';
import { WorkshopSetupComponent } from './workshops/setup/workshop-setup.component';
import { WorkshopSetupPanelComponent } from './workshops/setup/setup-panel/setup-panel.component';
import { WorkshopPlannerComponent } from './workshops/planner/workshop-planner.component';
import { SessionPanelComponent } from './workshops/planner/session-panel/session-panel.component';
import { SessionListsComponent } from './workshops/session/session-lists.component';
import { WorkshopReportsComponent } from './workshops/reports/workshop-reports.component';
import { HospitalityTodayComponent } from './hospitality/today/hospitality-today.component';
import { HospitalitySetupComponent } from './hospitality/setup/hospitality-setup.component';
import { HospitalityDeskComponent } from './hospitality/desk/hospitality-desk.component';
import { ExpectedListComponent } from './hospitality/expected-list/expected-list.component';
import { HospitalityGuestsComponent } from './hospitality/guests/hospitality-guests.component';
import { HospitalityReportComponent } from './hospitality/report/hospitality-report.component';
import { HospitalityStayComponent } from './hospitality/stay/hospitality-stay.component';
import { MedicalLockComponent } from './medical/lock/medical-lock.component';
import { MedicalDeskComponent } from './medical/desk/medical-desk.component';
import { MedicalRecordsComponent } from './medical/records/medical-records.component';
import { MedicalPatientComponent } from './medical/patient/medical-patient.component';
import { MedicalReportComponent } from './medical/report/medical-report.component';
import { WashMonitorComponent } from './wash/monitor/wash-monitor.component';
import { WashSetupComponent } from './wash/setup/wash-setup.component';
import { WashStockComponent } from './wash/stock/wash-stock.component';
import { WashReportComponent } from './wash/report/wash-report.component';
import { VolunteersComponent } from './volunteers/volunteers.component';
import { VolunteerNeedComponent } from './volunteers/volunteer-need/volunteer-need.component';
import { BillboardComponent } from './billboard/billboard.component';
import { EmailActionsComponent } from './box-office/email/email-actions/email-actions.component';
import { EmailHistoryComponent } from './box-office/email/email-history/email-history.component';
// ImageCropperComponent / PhotoPickerDialogComponent are standalone — no
// declaration needed here; AvatarService.changePhoto() opens the picker.

// #QRCode Scanner: Necessary to solve the problem of losing internet connection
LOAD_WASM().subscribe()

@NgModule({
  declarations: [
    AppComponent,
    HeaderComponent,
    AlertComponent,
    HomeComponent,
    LoginComponent,
    DashboardComponent,
    ErrorPageComponent,
    AdminComponent,
    UtcToLocalTimePipe,
    AdminMenuComponent,
    UserRegisteryComponent,
    UserFormComponent,
    BulkUsersComponent,
    HasPermissionDirective,
    TooltipDirective,
    ProfileComponent,
    DepartmentsComponent,
    DepartmentDetailComponent,
    DepartmentDeleteDialogComponent,
    BookingsComponent,
    RegistrationComponent,
    BookingFoundComponent,
    CounterFormComponent,
    BoxOfficeQrscannerPopupComponent,
    AllocateTentComponent,
    AttendeeListComponent,
    TicketEditFormComponent,
    SpotRegistrationComponent,
    BulkUploadComponent,
    MyDepartmentComponent,
    EventsComponent,
    EventDetailComponent,
    EmailReportComponent,
    EventCreateDialogComponent,
    AccommodationSetupComponent,
    AccommodationInventoryComponent,
    AppSelectComponent,
    AppOptionComponent,
    ConfirmDialogComponent,
    UserAvatarComponent,
    BandAlertComponent,
    BoxOfficeStatusComponent,
    RichTextEditorComponent,
    TicketEmailDialogComponent,
    CustomEmailDialogComponent,
    EmailProgressComponent,
    EmailActionsComponent,
    EmailHistoryComponent,
    PwaStatusComponent,
    SectionHeaderComponent,
    SlidePanelComponent,
    TentFieldsComponent,
    TentFieldComponent,
    FieldGridComponent,
    FieldPickerDialogComponent,
    NotificationSettingsComponent,
    AnnouncementsComponent,
    PublicPageComponent,
    SosComponent,
    PublicPhotosComponent,
    UatResetComponent, // UAT-RESET: remove before Production
    BillboardComponent,
    VenueMapComponent,
    WorkshopSetupComponent,
    WorkshopSetupPanelComponent,
    WorkshopPlannerComponent,
    SessionPanelComponent,
    SessionListsComponent,
    WorkshopReportsComponent,
    HospitalityTodayComponent,
    HospitalitySetupComponent,
    HospitalityDeskComponent,
    ExpectedListComponent,
    HospitalityGuestsComponent,
    HospitalityReportComponent,
    HospitalityStayComponent,
    MedicalLockComponent,
    MedicalDeskComponent,
    MedicalRecordsComponent,
    MedicalPatientComponent,
    MedicalReportComponent,
    WashMonitorComponent,
    WashSetupComponent,
    WashStockComponent,
    WashReportComponent,
    VolunteersComponent,
    VolunteerNeedComponent
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
    // PWA: the service worker only runs in production builds (not ng serve),
    // registered once the app has settled so it never slows the first load.
    ServiceWorkerModule.register('ngsw-worker.js', {
      enabled: !isDevMode(),
      registrationStrategy: 'registerWhenStable:30000'
    }),

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
    GuestGuard,
    NotificationService,
    DashboardService,
    AccomodationService,
    { provide: HTTP_INTERCEPTORS, useClass: AuthInterceptorService, multi: true },
    { provide: LOCALE_ID, useValue: 'en-US' },
    { provide: MOMENT, useValue: moment },
  ],
  bootstrap: [AppComponent]
})
export class AppModule {
  // App-wide icon set: every <mat-icon> uses Material Symbols Rounded (loaded in
  // index.html) instead of the older Material Icons. Same icon names.
  constructor(iconRegistry: MatIconRegistry) {
    iconRegistry.setDefaultFontSetClass('material-symbols-rounded');
  }
}
