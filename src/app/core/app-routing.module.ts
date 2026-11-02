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
import { BillboardComponent } from "../billboard/billboard.component";
import { VenueMapComponent } from "../venue-map/venue-map.component";
import { WorkshopSetupComponent } from "../workshops/setup/workshop-setup.component";
import { WorkshopPlannerComponent } from "../workshops/planner/workshop-planner.component";
import { SessionListsComponent } from "../workshops/session/session-lists.component";
import { WorkshopRunGuard } from "../workshops/workshop-run.guard";
import { EmailAccessGuard } from "./email-access.guard";
import { AccommodationSetupComponent } from "../accommodation/setup/accommodation-setup.component";
import { AccommodationInventoryComponent } from "../accommodation/inventory/accommodation-inventory.component";

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
    { path: 'venue-map', canActivate: [AuthGuard], component: VenueMapComponent },
    // Workshops planner — everyone signed in (changes are checked per action, server-side too).
    { path: 'workshops', canActivate: [AuthGuard], component: WorkshopPlannerComponent },
    // A session's lists and door — the Workshop team (members, workshop:write, the Plan group).
    { path: 'workshops/sessions/:id', canActivate: [AuthGuard, WorkshopRunGuard], component: SessionListsComponent },
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
    { path: 'admin', canActivate:[AuthGuard, AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN', 'TL'] }, component: AdminComponent, children: [
        { path: 'user', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN', 'TL'] }, component: UserRegisteryComponent },
        { path: 'departments', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: DepartmentsComponent },
        { path: 'departments/:id', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: DepartmentsComponent }, // opens that department's panel
        { path: 'events', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: EventsComponent },
        { path: 'events/:id', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: EventDetailComponent },
        // DEV/DIR/ADMIN only (decided by the backend via /emails/config)
        { path: 'email-report', canActivate: [EmailAccessGuard], component: EmailReportComponent },
        { path: 'announcements', canActivate: [AuthPermissionGuard], data: { roles: ['DEV', 'DIR', 'ADMIN'] }, component: AnnouncementsComponent }
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