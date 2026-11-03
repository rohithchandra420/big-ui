import { Component, EventEmitter, OnDestroy, OnInit, Output } from "@angular/core";
import { AuthService } from "../core/auth.service";
import { EventService } from "../core/event.service";
import { AvatarService } from "../core/avatar.service";
import { EmailService } from "../core/email.service";
import { BillboardService } from "../core/billboard.service";
import { User } from "../core/user.model";
import { EventItem } from "../models/event.model";
import { Subscription, filter } from "rxjs";
import { NavigationEnd, Router } from "@angular/router";
import { NavGroup, groupOfUrl, readOpenGroups, writeOpenGroups } from "./nav-groups";
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
    userId = '';
    /** The stored session user doesn't carry avatarVersion, so it's fetched
     *  once per login; changes made this session arrive via AvatarService. */
    avatarVersion = 0;
    isAuthenticated = false;
    /** Admin > Email Report link: same rule as sending (DEV/DIR/ADMIN or a Box
     *  Office TL), answered by the backend via EmailService. */
    canSeeEmailReport = false;
    /** Red count on the Billboard link (BillboardService keeps it fresh). */
    unreadNotes = 0;
    readonly appVersion = environment.version;

    private currentUser: User | null = null;
    private userSub!: Subscription;
    private unreadSub!: Subscription;
    private eventsSub!: Subscription;
    private activeEventSub!: Subscription;
    private routeSub!: Subscription;

    /** Collapsible sidebar groups (user, 2026-11-03): remembered in this browser. */
    openGroups: Partial<Record<NavGroup, boolean>> = readOpenGroups();

    events: EventItem[] = [];
    activeEvent: EventItem | null = null;

    readonly adminMenuRoles   = ['DEV', 'DIR', 'ADMIN', 'TL'];
    readonly manageDeptsRoles = ['DEV', 'DIR', 'ADMIN'];
    readonly manageEventsRoles = ['DEV', 'DIR', 'ADMIN'];

    constructor(
        private authService: AuthService,
        private eventService: EventService,
        private avatarService: AvatarService,
        private emailService: EmailService,
        private billboardService: BillboardService,
        private router: Router
    ) {}

    /** Main starts open; every other group starts closed. */
    isOpen(group: NavGroup): boolean {
        return this.openGroups[group] ?? group === 'main';
    }

    toggleGroup(group: NavGroup) {
        this.openGroups = { ...this.openGroups, [group]: !this.isOpen(group) };
        writeOpenGroups(this.openGroups);
    }

    /** The group holding the page you're on always opens (and stays remembered as open). */
    private openGroupOf(url: string) {
        const g = groupOfUrl(url);
        if (g && !this.isOpen(g)) {
            this.openGroups = { ...this.openGroups, [g]: true };
            writeOpenGroups(this.openGroups);
        }
    }

    /** Box Office is visible to admin roles, or users with the permission/department access */
    get canSeeBoxOffice(): boolean {
        if (!this.currentUser) return false;
        if (['DEV', 'DIR', 'ADMIN'].includes(this.userRole)) return true;
        return this.authService.hasPermission(this.currentUser, 'box-office:read') ||
               this.authService.hasDepartmentAccess(this.currentUser, 'Box Office');
    }

    /** Accommodation Setup creates real inventory — admin roles only, matching
     *  the backend's adminAuth on /createTents. See ACCOMMODATION_CONTEXT.md
     *  decision #9. */
    get canSeeAccommodationSetup(): boolean {
        return ['DEV', 'DIR', 'ADMIN'].includes(this.userRole);
    }

    /** Inventory (view) is broader — same shape as canSeeBoxOffice, reusing
     *  the Box Office permission/department rather than a standalone
     *  "Accommodation" one, since tent inventory is logistically Box Office's
     *  concern too (and AllocateTentComponent already lives in that flow). */
    get canSeeAccommodationInventory(): boolean {
        if (!this.currentUser) return false;
        if (['DEV', 'DIR', 'ADMIN'].includes(this.userRole)) return true;
        return this.authService.hasPermission(this.currentUser, 'box-office:read') ||
               this.authService.hasDepartmentAccess(this.currentUser, 'Box Office');
    }

    /** Workshops › Setup: the Plan group (same rule as the server). */
    get canSeeWorkshopSetup(): boolean {
        return this.authService.canPlanWorkshops(this.currentUser);
    }

    /** Workshops › Reports: the Workshop team and workshop:read. */
    get canSeeWorkshopReports(): boolean {
        return this.authService.canReadWorkshops(this.currentUser);
    }

    /** Hospitality: DEV/DIR/ADMIN, the Hospitality TL, hospitality:manage (same rule as the server). */
    get canSeeHospitality(): boolean {
        return this.authService.canManageHospitality(this.currentUser);
    }

    get canSeeAdminMenu(): boolean {
        return this.adminMenuRoles.includes(this.userRole);
    }

    get canSeeManageDepts(): boolean {
        return this.manageDeptsRoles.includes(this.userRole);
    }

    get canSeeManageEvents(): boolean {
        return this.manageEventsRoles.includes(this.userRole);
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

            const id = user?._id || '';
            if (id !== this.userId) {
                this.userId = id;
                this.avatarVersion = 0;
                this.canSeeEmailReport = false;
                if (id) {
                    this.avatarService.fetchVersion(id).subscribe(v => {
                        if (this.userId === id) this.avatarVersion = v;
                    });
                    // refresh=true: never reuse the previous user's cached answer
                    this.emailService.getConfig(true).subscribe(c => {
                        if (this.userId === id) this.canSeeEmailReport = !!c.canViewReport;
                    });
                }
            }
        });
        this.eventsSub = this.eventService.events.subscribe(events => this.events = events);
        this.activeEventSub = this.eventService.activeEvent.subscribe(event => this.activeEvent = event);
        this.unreadSub = this.billboardService.unread$.subscribe(n => this.unreadNotes = n);
        this.openGroupOf(this.router.url);
        this.routeSub = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
            .subscribe(e => this.openGroupOf(e.urlAfterRedirects));
    }

    onEventChange(eventId: string) {
        const event = this.events.find(e => e._id === eventId);
        if (event) this.eventService.setActiveEvent(event);
    }

    ngOnDestroy() {
        this.userSub?.unsubscribe();
        this.eventsSub?.unsubscribe();
        this.activeEventSub?.unsubscribe();
        this.unreadSub?.unsubscribe();
        this.routeSub?.unsubscribe();
    }

    onLogOut() {
        this.authService.logOut();
    }
}
