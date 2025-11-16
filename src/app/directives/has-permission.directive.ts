import { Directive, Input, TemplateRef, ViewContainerRef, OnInit } from '@angular/core';
import { AuthService } from '../core/auth.service';
import { User } from '../core/user.model';

@Directive({ selector: '[hasPermission]' })

export class HasPermissionDirective {
    private user!: User;
    private permission!: string;

    constructor(
        private templateRef: TemplateRef<any>,
        private viewContainer: ViewContainerRef,
        private authService: AuthService
    ) {}

    @Input() 
    set hasPermission(value: { user: User; permission: string }) {
        this.user = value.user;
        this.permission = value.permission;
        this.updateView();
    }

    private updateView() {
        this.viewContainer.clear();

        const canShow = this.authService.hasPermission(this.user, this.permission);
        console.log("canSHow:", canShow);

        if(canShow) {
            this.viewContainer.createEmbeddedView(this.templateRef);
        }

    }
}