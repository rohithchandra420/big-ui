import { Component, OnDestroy, OnInit } from "@angular/core";
import { AuthService } from "../core/auth.service";
import { User } from "../core/user.model";
import { Subscription } from "rxjs";

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.css']
})

export class HeaderComponent implements OnInit, OnDestroy {
    userRole: string = '';
    userName: string = '';
    private userSub!: Subscription;

    isAuthenticated = false;
    private currentUser: User | null = null;

    constructor(private authService: AuthService) {}

    get canSeeBoxOffice(): boolean {
        if (!this.currentUser) return false;
        if (['DEV', 'DIR', 'ADMIN'].includes(this.userRole)) return true;
        return this.authService.hasPermission(this.currentUser, 'box-office:read') ||
               this.authService.hasDepartmentAccess(this.currentUser, 'Box Office');
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