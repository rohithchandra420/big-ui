import { NgModule, inject } from "@angular/core";
import { ActivatedRouteSnapshot, CanActivateChildFn, CanActivateFn, Router, RouterModule, RouterStateSnapshot, Routes, UrlTree } from "@angular/router";

import { DashboardComponent } from "../dashboard/dashboard.component";
import { HomeComponent } from "../home/home.component";
import { LoginComponent } from "../login/login.component";
import { Observable } from "rxjs";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth-guard.service";
import { GuestGuard } from "./guest-guard.service";
import { ErrorPageComponent } from "../error-page/error-page.component";
import { AuthResolver } from "./auth-resolver.service";
import { AdminComponent } from "../admin/admin.component";
import { UserRegisteryComponent } from "../admin/user-registery/user-registery.component";
import { AuthPermissionGuard } from "./auth-permission-guard.service";
import { ProfileComponent } from "../profile/profile.component";
import { DepartmentsComponent } from "../admin/departments/departments.component";
import { BookingsComponent } from "../box-office/bookings/bookings.component";
import { RegistrationComponent } from "../box-office/registration/registration.component";
import { BookingFoundComponent } from "../box-office/registration/booking-found/booking-found.component";
import { MyDepartmentComponent } from "../my-department/my-department.component";
import { EventsComponent } from "../admin/events/events.component";
import { EventDetailComponent } from "../admin/events/event-detail/event-detail.component";
import { EmailReportComponent } from "../admin/email-report/email-report.component";
import { AnnouncementsComponent } from "../admin/announcements/announcements.component";
import { PublicPageComponent } from "../admin/public-page/public-page.component";
import { SosComponent } from "../sos/sos.component";
import { SosGuard } from "./sos.guard";
import { UatResetComponent } from "../admin/uat-reset/uat-reset.component"; // UAT-RESET: remove before Production
import { BillboardComponent } from "../billboard/billboard.component";
import { VenueMapComponent } from "../venue-map/venue-map.component";
import { WorkshopSetupComponent } from "../workshops/setup/workshop-setup.component";
import { WorkshopPlannerComponent } from "../workshops/planner/workshop-planner.component";
import { SessionListsComponent } from "../workshops/session/session-lists.component";
import { WorkshopReadGuard, WorkshopRunGuard } from "../workshops/workshop-run.guard";
import { WorkshopReportsComponent } from "../workshops/reports/workshop-reports.component";
import { HospitalityTodayComponent } from "../hospitality/today/hospitality-today.component";
import { HospitalitySetupComponent } from "../hospitality/setup/hospitality-setup.component";
import { HospitalityGuard } from "../hospitality/hospitality.guard";
import { HospitalityDeskComponent } from "../hospitality/desk/hospitality-desk.component";
import { HospitalityGuestsComponent } from "../hospitality/guests/hospitality-guests.component";
import { HospitalityReportComponent } from "../hospitality/report/hospitality-report.component";
import { HospitalityStayComponent } from "../hospitality/stay/hospitality-stay.component";
import { MedicalGuard } from "../medical/medical.guard";
import { MedicalDeskComponent } from "../medical/desk/medical-desk.component";
import { MedicalRecordsComponent } from "../medical/records/medical-records.component";
import { MedicalPatientComponent } from "../medical/patient/medical-patient.component";
import { MedicalReportComponent } from "../medical/report/medical-report.component";
import { WashGuard } from "../wash/wash.guard";
import { WashMonitorComponent } from "../wash/monitor/wash-monitor.component";
import { WashSetupComponent } from "../wash/setup/wash-setup.component";
import { WashStockComponent } from "../wash/stock/wash-stock.component";
import { WashReportComponent } from "../wash/report/wash-report.component";
import { EmailAccessGuard } from "./email-access.guard";
import { AccommodationSetupComponent } from "../accommodation/setup/accommodation-setup.component";
import { AccommodationInventoryComponent } from "../accommodation/inventory/accommodation-inventory.component";
import { TentFieldsComponent } from "../accommodation/fields/tent-fields.component";
import { TentFieldComponent } from "../accommodation/fields/tent-field.component";

// const profileGuard: CanActivateFn = (
//     route: ActivatedRouteSnapshot,
//     state: RouterStateSnapshot,
// ):  | Observable<boolean | UrlTree>
//     | Promise<boolean | UrlTree>
//     | boolean
//     | UrlTree => {
//         const currentUser = inject(AuthService).isAuthenticated();

//         //Redirect to Another Route
//         if(!currentUser) {
//             return inject(Router).createUrlTree(["/", "login"]);
//         }

//         //const profileId = route.params["id"];
        
//         //Grants or deny access to this route
        
//         return true;
//     }

// export function featureFlagHuard( ):CanActivateChildFn {
//     return() => {
//         const authService: AuthService = inject(AuthService);
//         if(authService.isAuthenticated()) {
//             return true;
//         } else {
//             return false;
//         }
//     };
// }

const appRoutes: Routes = [
    { path: '', component: DashboardComponent },
    { path: 'login', canActivate: [GuestGuard], component: LoginComponent },
    // {
    //     path: 'admin', canActivate:[authGuard], resolve: {userDetails: AuthResolver} , component: AdminComponent, children: [
    //         // { path: 'dashboard', component: DashboardComponent },
    //         { path: 'register', component: RegistrationComponent }
    //     ]
    // },
    //{ path: 'home', redirectTo: '', pathMatch: 'full'},    
    { path: 'dashboard', redirectTo: '',  pathMatch: 'full'},
    { path: 'profile', canActivate:[AuthGuard] ,component: ProfileComponent },
    { path: 'billboard', canActivate: [AuthGuard], component: BillboardComponent },
    { path: 'sos', canActivate: [AuthGuard, SosGuard], component: SosComponent },
    { path: 'venue-map', canActivate: [AuthGuard], component: VenueMapComponent },
    // Workshops planner — everyone signed in (changes are checked per action, server-side too).
    { path: 'hospitality', canActivate: [AuthGuard, HospitalityGuard], component: HospitalityTodayComponent },
    { path: 'hospitality/desk', canActivate: [AuthGuard, HospitalityGuard], component: HospitalityDeskComponent },
    { path: 'hospitality/guests', canActivate: [AuthGuard, HospitalityGuard], component: HospitalityGuestsComponent },
    { path: 'hospitality/report', canActivate: [AuthGuard, HospitalityGuard], component: HospitalityReportComponent },
    { path: 'hospitality/stay', canActivate: [AuthGuard, HospitalityGuard], component: HospitalityStayComponent },
    { path: 'hospitality/setup', canActivate: [AuthGuard, HospitalityGuard], component: HospitalitySetupComponent },
    // Medical Desk (MEDICAL_CONTEXT.md): DEV, DIR, the Medical department, medical grants — never ADMIN.
    { path: 'medical', canActivate: [AuthGuard, MedicalGuard], component: MedicalDeskComponent },
    { path: 'medical/records', canActivate: [AuthGuard, MedicalGuard], component: MedicalRecordsComponent },
    { path: 'medical/report', canActivate: [AuthGuard, MedicalGuard], component: MedicalReportComponent },
    { path: 'medical/patients/:id', canActivate: [AuthGuard, MedicalGuard], component: MedicalPatientComponent },
    // WASH (WASH_CONTEXT.md): Monitor = the WASH team + wash grants; Setup = DEV/DIR/ADMIN, WASH TL, wash:manage.
    { path: 'wash', canActivate: [AuthGuard, WashGuard], component: WashMonitorComponent },
    { path: 'wash/stock', canActivate: [AuthGuard, WashGuard], component: WashStockComponent },
    { path: 'wash/report', canActivate: [AuthGuard, WashGuard], component: WashReportComponent },
    { path: 'wash/setup', canActivate: [AuthGuard, WashGuard], component: WashSetupComponent, data: { washManage: true } },
    { path: 'workshops', canActivate: [AuthGuard], component: WorkshopPlannerComponent },
    // A session's lists and door — the Workshop team (members, workshop:write, the Plan group).
    { path: 'workshops/sessions/:id', canActivate: [AuthGuard, WorkshopRunGuard], component: SessionListsComponent },
    // Reports (with names) — the Workshop team and workshop:read.
    { path: 'workshops/reports', canActivate: [AuthGuard, WorkshopReadGuard], component: WorkshopReportsComponent },
    // Workshops setup — the Plan group: DEV/DIR/ADMIN, the Workshop TL (automatic
    // workshop:manage via the department key), anyone granted workshop:manage.
    { path: 'workshops/setup', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'], permissions: ['workshop:manage'] }, component: WorkshopSetupComponent },
    { path: 'my-department', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN', 'TL', 'VOL'] }, component: MyDepartmentComponent },
    { path: 'box-office/bookings', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'], permissions: ['box-office:read'], departments: ['Box Office'] }, component: BookingsComponent },
    { path: 'box-office/registration', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'], permissions: ['box-office:read'], departments: ['Box Office'] }, component: RegistrationComponent },
    { path: 'box-office/registration/:id', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'], permissions: ['box-office:read'], departments: ['Box Office'] }, component: BookingFoundComponent },
    // Old spelling, kept as a redirect for anyone with the URL bookmarked —
    // see ACCOMMODATION_CONTEXT.md decision #10. AccomodationComponent
    // itself was deleted in v1.13.0 (legacy cleanup).
    { path: 'accomodation', redirectTo: 'accommodation/inventory', pathMatch: 'full' },
    { path: 'accommodation/setup', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: AccommodationSetupComponent },
    { path: 'accommodation/inventory', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'], permissions: ['box-office:read'], departments: ['Box Office'] }, component: AccommodationInventoryComponent },
    // Tent Fields (Epic B): seen by the Inventory rule; editing is DEV/DIR/ADMIN (checked by the server too)
    { path: 'accommodation/fields', canActivate: [AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'], permissions: ['box-office:read'], departments: ['Box Office'] }, component: TentFieldsComponent },
    { path: 'accommodation/fields/:id', canActivate: [AuthGuard, AuthPermissionGuard], canDeactivate: [(c: TentFieldComponent) => c.canLeave()], data: { roles: ['DEV', 'DIR', 'ADMIN'], permissions: ['box-office:read'], departments: ['Box Office'] }, component: TentFieldComponent },
    { path: 'admin', canActivate:[AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN', 'TL'] }, component: AdminComponent, children: [
        { path: 'user', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN', 'TL'] }, component: UserRegisteryComponent },
        { path: 'departments', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: DepartmentsComponent },
        { path: 'departments/:id', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: DepartmentsComponent }, // opens that department's panel
        { path: 'events', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: EventsComponent },
        { path: 'events/:id', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: EventDetailComponent },
        // DEV/DIR/ADMIN only (decided by the backend via /emails/config)
        { path: 'email-report', canActivate: [EmailAccessGuard], component: EmailReportComponent },
        { path: 'announcements', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: AnnouncementsComponent },
        { path: 'public-page', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: PublicPageComponent },
        { path: 'uat-reset', canActivate: [AuthPermissionGuard], data: { roles: ['DEV'] }, component: UatResetComponent } // UAT-RESET: remove before Production
    ]},
    { path: 'error', component: ErrorPageComponent, data: {message: 'Page Under Construction'}},
    //{ path: '**', redirectTo: 'error' },

    //{ path: '', component: HomeComponent },
    
    // {
    //     path: 'admin', canActivate:[authGuard], resolve: {userDetails: AuthResolver} , component: AdminComponent, children: [
    //         // { path: 'dashboard', component: DashboardComponent },
    //         { path: 'register', component: RegistrationComponent }
    //     ]
    // },

];

@NgModule({
    imports: [        
        RouterModule.forRoot(appRoutes)
    ],
    exports: [
        RouterModule
    ]
})

export class AppRoutingModule {
}