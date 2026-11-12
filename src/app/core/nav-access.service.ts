import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Subscription } from 'rxjs';

import { AuthService } from './auth.service';
import { EmailService } from './email.service';
import { SosService } from './sos.service';
import { UatResetService } from './uat-reset.service'; // UAT-RESET: remove before Production
import { User } from './user.model';
import { NAV_SECTIONS, NavSection, NavTab, SectionKey } from './nav-sections';

const TOP_ROLES = ['DEV', 'DIR', 'ADMIN'];
const ADMIN_MENU_ROLES = ['DEV', 'DIR', 'ADMIN', 'TL'];

/**
 * Who sees which sidebar link and tab (Navigation Tabs). These are the same
 * checks the sidebar had before — moved here so the sidebar and the section
 * tabs can never disagree. They only hide links: every page keeps its own
 * route guard and the server keeps its own rules.
 */
@Injectable({ providedIn: 'root' })
export class NavAccessService implements OnDestroy {
  private user: User | null = null;
  private userId = '';

  /** Answered by the server (same rule as sending email). */
  canSeeEmailReport = false;
  canSeeUatReset = false; // UAT-RESET: remove before Production
  /** PH4b: SOS page link. A stream too, so the sidebar can start its count. */
  readonly sos$ = new BehaviorSubject<boolean>(false);
  /** Bumped whenever an answer above arrives, so lists built from it can be rebuilt. */
  readonly changed$ = new BehaviorSubject<number>(0);

  private sub: Subscription;

  constructor(
    private authService: AuthService,
    private emailService: EmailService,
    private sosService: SosService,
    private uatReset: UatResetService // UAT-RESET: remove before Production
  ) {
    this.sub = this.authService.user.subscribe(user => this.onUser(user));
  }

  get canSeeSos(): boolean { return this.sos$.value; }

  private get role(): string { return this.user?.role || ''; }

  private onUser(user: User | null): void {
    this.user = user;
    const id = user?._id || '';
    if (id !== this.userId) {
      this.userId = id;
      this.canSeeEmailReport = false;
      this.canSeeUatReset = false; // UAT-RESET: remove before Production
      this.sos$.next(false);
      if (id) {
        this.sosService.canSee().subscribe(ok => {
          if (this.userId === id) { this.sos$.next(ok); this.bump(); }
        });
        // refresh=true: never reuse the previous user's cached answer
        this.emailService.getConfig(true).subscribe(c => {
          if (this.userId === id) { this.canSeeEmailReport = !!c.canViewReport; this.bump(); }
        });
        // UAT-RESET: remove before Production
        if (user?.role === 'DEV') {
          this.uatReset.available().subscribe(ok => {
            if (this.userId === id) { this.canSeeUatReset = ok; this.bump(); }
          });
        }
      }
    }
    this.bump();
  }

  private bump(): void { this.changed$.next(this.changed$.value + 1); }

  /** Box Office is visible to admin roles, or users with the permission/department access. */
  get canSeeBoxOffice(): boolean {
    if (!this.user) return false;
    if (TOP_ROLES.includes(this.role)) return true;
    return this.authService.hasPermission(this.user, 'box-office:read') ||
           this.authService.hasDepartmentAccess(this.user, 'Box Office');
  }

  /** Accommodation Setup creates real inventory — admin roles only (ACCOMMODATION_CONTEXT.md #9). */
  get canSeeAccommodationSetup(): boolean {
    return TOP_ROLES.includes(this.role);
  }

  /** Inventory (view) uses the Box Office rule: tent inventory is Box Office's concern too. */
  get canSeeAccommodationInventory(): boolean {
    return this.canSeeBoxOffice;
  }

  /** Workshops › Setup: the Plan group (same rule as the server). */
  get canSeeWorkshopSetup(): boolean { return this.authService.canPlanWorkshops(this.user); }

  /** Workshops › Reports: the Workshop team and workshop:read. */
  get canSeeWorkshopReports(): boolean { return this.authService.canReadWorkshops(this.user); }

  /** Hospitality: DEV/DIR/ADMIN, the Hospitality TL, hospitality:manage. */
  get canSeeHospitality(): boolean { return this.authService.canManageHospitality(this.user); }

  /** Medical Desk: DEV, DIR, the Medical department, medical grants — never ADMIN. */
  get canSeeMedical(): boolean { return this.authService.canUseMedical(this.user); }

  get canSeeAdminMenu(): boolean { return ADMIN_MENU_ROLES.includes(this.role); }

  /** Departments, Events, Announcements, Public Page. */
  get canSeeAdminTopPages(): boolean { return TOP_ROLES.includes(this.role); }

  /** May this person see the tab for this route? */
  canSeeTab(path: string): boolean {
    if (!this.user) return false;
    switch (path) {
      case '/box-office/bookings':
      case '/box-office/registration': return this.canSeeBoxOffice;
      case '/accommodation/inventory': return this.canSeeAccommodationInventory;
      case '/accommodation/setup': return this.canSeeAccommodationSetup;
      case '/workshops': return true;
      case '/workshops/reports': return this.canSeeWorkshopReports;
      case '/workshops/setup': return this.canSeeWorkshopSetup;
      case '/hospitality':
      case '/hospitality/desk':
      case '/hospitality/guests':
      case '/hospitality/report':
      case '/hospitality/stay':
      case '/hospitality/setup': return this.canSeeHospitality;
      case '/medical':
      case '/medical/records':
      case '/medical/report': return this.canSeeMedical;
      case '/admin/user': return this.canSeeAdminMenu;
      case '/admin/departments':
      case '/admin/events':
      case '/admin/announcements':
      case '/admin/public-page': return this.canSeeAdminTopPages;
      // Both sat inside the Admin group before, so they keep needing an Admin-menu role.
      case '/admin/email-report': return this.canSeeAdminMenu && this.canSeeEmailReport;
      case '/admin/uat-reset': return this.canSeeAdminMenu && this.canSeeUatReset; // UAT-RESET: remove before Production
    }
    return false;
  }

  visibleTabs(section: NavSection): NavTab[] {
    return section.tabs.filter(t => this.canSeeTab(t.path));
  }

  canSeeSection(key: SectionKey): boolean {
    const s = NAV_SECTIONS.find(x => x.key === key);
    return !!s && this.visibleTabs(s).length > 0;
  }

  ngOnDestroy(): void { this.sub?.unsubscribe(); }
}
