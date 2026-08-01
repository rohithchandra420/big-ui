import { Component, EventEmitter, OnDestroy, OnInit, Output } from "@angular/core";
import { AuthService } from "../core/auth.service";
import { User } from "../core/user.model";
import { Subscription } from "rxjs";
import { environment } from "src/environments/environment.development";

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.css']
})
export class HeaderComponent implements OnInit, OnDestroy {

    /** Emitted on every nav item click — parent uses this to close mobile drawer */
    @Output() navItemClicked = new EventEmitter<void>();

    userRole: string = '';
    userName: string = '';
    isAuthenticated = false;
    readonly appVersion = environment.version;

    private currentUser: User | null = null;
    private userSub!: Subscription;

    readonly adminMenuRoles   = ['DEV', 'DIR', 'ADMIN', 'TL'];
    readonly ticketManagerRoles = ['DEV', 'DIR', 'ADMIN'];
    readonly manageDeptsRoles = ['DEV', 'DIR', 'ADMIN'];

    constructor(private authService: AuthService) {}

    /** Box Office is visible to admin roles, or users with the permission/department access */
    get canSeeBoxOffice(): boolean {
        if (!this.currentUser) return false;
        if (['DEV', 'DIR', 'ADMIN'].includes(this.userRole)) return true;
        return this.authService.hasPermission(this.currentUser, 'box-office:read') ||
               this.authService.hasDepartmentAccess(this.currentUser, 'Box Office');
    }

    get canSeeAdminMenu(): boolean {
        return this.adminMenuRoles.includes(this.userRole);
    }

    get canSeeTicketRegistry(): boolean {
        return this.ticketManagerRoles.includes(this.userRole);
    }

    get canSeeManageDepts(): boolean {
        return this.manageDeptsRoles.includes(this.userRole);
    }

    /** Notify parent so it can close the mobile drawer */
    onNavClick(): void {
        this.navItemClicked.emit();
    }

    ngOnInit() {
        this.userSub = this.authService.user.subscribe(user => {
            this.currentUser = user;
            this.userName = user ? user.name : 'Guest';
            this.isAuthenticated = !!user;
            this.userRole = user ? user.role : '';
        });
    }

    ngOnDestroy() {
        this.userSub?.unsubscribe();
    }

    onLogOut() {
        this.authService.logOut();
    }
}
