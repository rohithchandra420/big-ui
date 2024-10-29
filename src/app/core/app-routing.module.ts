import { NgModule, inject } from "@angular/core";
import { ActivatedRouteSnapshot, CanActivateChildFn, CanActivateFn, Router, RouterModule, RouterStateSnapshot, Routes, UrlTree } from "@angular/router";

import { DashboardComponent } from "../dashboard/dashboard.component";
import { HomeComponent } from "../home/home.component";
import { LoginComponent } from "../login/login.component";
import { RegistrationComponent } from "../registration/registration.component";
import { Observable } from "rxjs";
import { AuthService } from "./auth.service";
import { AuthGuard } from "./auth-guard.service";
import { ErrorPageComponent } from "../error-page/error-page.component";
import { AuthResolver } from "./auth-resolver.service";
import { AdminComponent } from "../admin/admin.component";
import { TicketsComponent } from "../tickets/tickets.component";

const profileGuard: CanActivateFn = (
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot,
):  | Observable<boolean | UrlTree>
    | Promise<boolean | UrlTree>
    | boolean
    | UrlTree => {
        const currentUser = inject(AuthService).isAuthenticated();

        //Redirect to Another Route
        if(!currentUser) {
            return inject(Router).createUrlTree(["/", "login"]);
        }

        //const profileId = route.params["id"];
        
        //Grants or deny access to this route
        
        return true;
    }

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
    { path: '', component: HomeComponent },
    { path: 'login', component: LoginComponent },
    // {
    //     path: 'admin', canActivate:[authGuard], resolve: {userDetails: AuthResolver} , component: AdminComponent, children: [
    //         // { path: 'dashboard', component: DashboardComponent },
    //         { path: 'register', component: RegistrationComponent }
    //     ]
    // },
    { path: 'home', redirectTo: '', pathMatch: 'full'},
    { path: 'register', canActivate:[AuthGuard] ,component: RegistrationComponent },
    { path: 'dashboard', canActivate:[AuthGuard] ,component: DashboardComponent },
    { path: 'tickets', canActivate:[AuthGuard] ,component: TicketsComponent },
    { path: 'admin', canActivate:[AuthGuard] ,component: AdminComponent },
    { path: 'error', component: ErrorPageComponent, data: {message: 'Page Under Construction'}},
    { path: '**', redirectTo: 'error' },

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