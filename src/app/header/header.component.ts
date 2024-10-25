import { Component, OnDestroy, OnInit } from "@angular/core";
import { AuthService } from "../core/auth.service";
import { Subscription } from "rxjs";

@Component({
    selector: 'app-header',
    templateUrl: './header.component.html',
    styleUrls: ['./header.component.css']
})

export class HeaderComponent implements OnInit, OnDestroy{
    userRole;
    private logSub: Subscription;
    private userSub: Subscription;

    isAuthenticated = false;

    constructor(private authService: AuthService) {}
    
    ngOnInit() {
        // this.logSub = this.authService.userLoggedInEmitter.subscribe( isLoggedIn => {
        //     this.userRole = isLoggedIn;
        //     console.log(this.userRole);
        // });

        this.userSub = this.authService.user.subscribe(user => {
            this.isAuthenticated = !user ? false : true;
            this.userRole = user ? user.role : '';
            console.log(this.userRole);
        });
    }

    ngOnDestroy() {
        this.logSub.unsubscribe();
        this.userSub.unsubscribe();
    }

    onLogOut() {
        this.authService.logOut();
    }
}