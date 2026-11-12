import { Component, EventEmitter, OnDestroy, OnInit, Output } from "@angular/core";
import { AuthService } from "../core/auth.service";
import { EventService } from "../core/event.service";
import { AvatarService } from "../core/avatar.service";
import { BillboardService } from "../core/billboard.service";
import { SosService } from "../core/sos.service";
import { NavAccessService } from "../core/nav-access.service";
import { NavHistoryService } from "../core/nav-history.service";
import { NAV_SECTIONS, NavSection, SectionKey, matchUrl } from "../core/nav-sections";
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
    /** PH4b: count of open SOS alerts on the SOS link. */
    openSos = 0;
    private sosTimer?: ReturnType<typeof setInterval>;
    private sosCountSub?: Subscription;
    private sosSeeSub?: Subscription;
    /** Red count on the Billboard link (BillboardService keeps it fresh). */
    unreadNotes = 0;
    readonly appVersion = environment.version;

    /** Navigation Tabs (NAV_TABS_CONTEXT.md): one sidebar item per section. */
    readonly sections = NAV_SECTIONS;
    /** Where each section item goes (the tab used last there), rebuilt after every navigation. */
    sectionLinks: Partial<Record<SectionKey, string>> = {};
    activeSection: SectionKey | null = null;

    private userSub!: Subscription;
    private unreadSub!: Subscription;
    private eventsSub!: Subscription;
    private activeEventSub!: Subscription;
    private routeSub!: Subscription;
    private accessSub!: Subscription;

    /** Main stays a collapsible group (user, 2026-11-03), remembered in this browser. */
    openGroups: Partial<Record<NavGroup, boolean>> = readOpenGroups();

    events: EventItem[] = [];
    activeEvent: EventItem | null = null;

    constructor(
        private authService: AuthService,
        private eventService: EventService,
        private avatarService: AvatarService,
        private billboardService: BillboardService,
        private router: Router,
        private sosService: SosService,
        public nav: NavAccessService,
        private navHistory: NavHistoryService
    ) {}

    /** SOS page link: answered by the server, kept in NavAccessService. */
    get canSeeSos(): boolean {
        return this.nav.canSeeSos;
    }

    /** The open-SOS count: refreshed every 30 s while this person can see SOS. */
    private watchSos(): void {
        clearInterval(this.sosTimer);
        if (!this.canSeeSos) return;
        const refresh = () => {
            const eventId = this.activeEvent?._id;
            if (eventId) this.sosService.list(eventId).subscribe({ next: r => this.sosService.open$.next(r.open), error: () => {} });
        };
        refresh();
        this.sosTimer = setInterval(refresh, 30000);
    }

    /** Main starts open. */
    isOpen(group: NavGroup): boolean {
        return this.openGroups[group] ?? group === 'main';
    }

    toggleGroup(group: NavGroup) {
        this.openGroups = { ...this.openGroups, [group]: !this.isOpen(group) };
        writeOpenGroups(this.openGroups);
    }

    /** The Main group always opens when you're on one of its pages. */
    private openGroupOf(url: string) {
        const g = groupOfUrl(url);
        if (g && !this.isOpen(g)) {
            this.openGroups = { ...this.openGroups, [g]: true };
            writeOpenGroups(this.openGroups);
        }
    }

    trackBySection = (_: number, s: NavSection) => s.key;

    private refreshSections(url: string) {
        this.activeSection = matchUrl(url)?.section.key ?? null;
        const links: Partial<Record<SectionKey, string>> = {};
        for (const s of this.sections) links[s.key] = this.navHistory.sectionLink(s);
        this.sectionLinks = links;
    }

    /** Notify parent so it can close the mobile drawer */
    onNavClick(): void {
        this.navItemClicked.emit();
    }

    ngOnInit() {
        this.userSub = this.authService.user.subscribe(user => {
            this.userName = user ? user.name : 'Guest';
            this.isAuthenticated = !!user;
            this.userRole = user ? user.role : '';

            const id = user?._id || '';
            if (id !== this.userId) {
                this.userId = id;
                this.avatarVersion = 0;
                this.openSos = 0;
                if (id) {
                    this.avatarService.fetchVersion(id).subscribe(v => {
                        if (this.userId === id) this.avatarVersion = v;
                    });
                }
            }
        });
        this.sosSeeSub = this.nav.sos$.subscribe(() => this.watchSos());
        this.accessSub = this.nav.changed$.subscribe(() => this.refreshSections(this.router.url));
        this.eventsSub = this.eventService.events.subscribe(events => this.events = events);
        this.activeEventSub = this.eventService.activeEvent.subscribe(event => this.activeEvent = event);
        this.unreadSub = this.billboardService.unread$.subscribe(n => this.unreadNotes = n);
        this.sosCountSub = this.sosService.open$.subscribe(n => this.openSos = n);
        this.openGroupOf(this.router.url);
        this.refreshSections(this.router.url);
        this.routeSub = this.router.events.pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
            .subscribe(e => {
                this.openGroupOf(e.urlAfterRedirects);
                this.refreshSections(e.urlAfterRedirects);
            });
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
        this.sosCountSub?.unsubscribe();
        this.sosSeeSub?.unsubscribe();
        this.accessSub?.unsubscribe();
        clearInterval(this.sosTimer);
        this.routeSub?.unsubscribe();
    }

    onLogOut() {
        this.authService.logOut();
    }
}
