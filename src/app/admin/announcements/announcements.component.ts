import { Component, OnInit } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Announcement, AnnouncementType, PushService } from '../../core/push.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { AdminService } from '../admin.service';
import { AuthService } from '../../core/auth.service';

export const TITLE_MAX = 60;
export const MESSAGE_MAX = 240;

export interface TypeOption {
  value: AnnouncementType;
  label: string;
  /** Material Symbols name, shown on the tile, in the preview and on the phone (Android/desktop). */
  icon: string;
  /** Start of the title on the phone (same as the server's) — iPhone shows no per-type icon, so the type is in words. */
  prefix: string;
  short: string;   // under the tile
  badge: string;   // short name on history cards
  hint: string;    // under the type row once selected
}

/**
 * Admin → Announcements (PWA Phase 2): DEV/DIR/ADMIN send a push notification
 * to roles and/or departments (home department), pick a type, and can send a
 * past one again. The server enforces who may send; the route guard only keeps
 * others off the page.
 */
@Component({
  selector: 'app-announcements',
  templateUrl: './announcements.component.html',
  styleUrls: ['./announcements.component.css']
})
export class AnnouncementsComponent implements OnInit {
  private readonly allRoles = [
    { value: 'VOL', label: 'Volunteers' },
    { value: 'TL', label: 'Team Leads' },
    { value: 'ADMIN', label: 'Admins' },
    { value: 'DIR', label: 'Directors' },
    { value: 'DEV', label: 'Developers' }
  ];
  /** Developers is only offered to a Developer (the server enforces the same rule). Stored list for *ngFor. */
  roleOptions = this.allRoles.filter(r => r.value !== 'DEV');
  isDev = false;
  readonly typeOptions: TypeOption[] = [
    { value: 'general', label: 'General', icon: 'campaign', prefix: '', short: 'Everyday updates', badge: 'General',
      hint: 'Everyday updates.' },
    { value: 'urgent', label: 'Urgent / Safety', icon: 'emergency_home', prefix: 'Urgent: ', short: 'Stays on screen', badge: 'Urgent',
      hint: 'Stays on screen until dismissed, and reaches people who muted announcements. Emergencies only.' },
    { value: 'schedule', label: 'Schedule change', icon: 'event_repeat', prefix: 'Schedule change: ', short: 'Times & shifts', badge: 'Schedule',
      hint: 'Gate times, shifts, moved sessions.' },
    { value: 'weather', label: 'Weather', icon: 'thunderstorm', prefix: 'Weather: ', short: 'Rain, heat, wind', badge: 'Weather',
      hint: 'Rain, heat or wind warnings.' },
    { value: 'reminder', label: 'Reminder', icon: 'notifications_active', prefix: 'Reminder: ', short: 'Quiet nudge', badge: 'Reminder',
      hint: 'Quiet: a phone that already shows a reminder won\'t sound again.' },
    { value: 'task', label: 'Task', icon: 'task_alt', prefix: 'Task: ', short: 'Something to do', badge: 'Task',
      hint: 'Something staff need to do. Tracking (seen / done) is coming later.' }
  ];
  readonly titleMax = TITLE_MAX;
  readonly messageMax = MESSAGE_MAX;

  type: AnnouncementType = 'general';
  title = '';
  message = '';
  roles = new Set<string>();
  departments = new Set<string>();
  sending = false;

  /** Stored list (stable identities for *ngFor). */
  departmentOptions: { _id: string; name: string }[] = [];

  history: Announcement[] = [];
  /** history after search + filters — a stored list, rebuilt by applyFilters(). */
  visibleHistory: Announcement[] = [];
  loadingHistory = true;
  resendingId: string | null = null;

  // Sent-announcements filters ('' = all)
  search = '';
  filterType = '';
  filterDept = '';
  filterRole = '';

  constructor(
    private push: PushService,
    private admin: AdminService,
    private notifications: NotificationService,
    private confirm: ConfirmationService,
    private auth: AuthService
  ) { }

  ngOnInit(): void {
    this.isDev = this.auth.currentUser?.role === 'DEV';
    this.roleOptions = this.isDev ? this.allRoles : this.allRoles.filter(r => r.value !== 'DEV');
    this.loadHistory();
    this.admin.getDepartments().subscribe({
      next: d => this.departmentOptions = [...d].sort((a, b) => a.name.localeCompare(b.name)),
      error: () => this.departmentOptions = []
    });
  }

  async loadHistory(): Promise<void> {
    this.loadingHistory = true;
    try {
      this.history = await this.push.listAnnouncements();
    } catch {
      this.history = [];
    } finally {
      this.loadingHistory = false;
      this.applyFilters();
    }
  }

  get hasFilters(): boolean {
    return !!(this.search.trim() || this.filterType || this.filterDept || this.filterRole);
  }

  /** Search (title + message) and the Type / Department / Role filters, all together. */
  applyFilters(): void {
    const q = this.search.trim().toLowerCase();
    this.visibleHistory = this.history.filter(a =>
      (!q || a.title.toLowerCase().includes(q) || a.message.toLowerCase().includes(q)) &&
      (!this.filterType || (a.type || 'general') === this.filterType) &&
      (!this.filterDept || (a.departments || []).some(d => d._id === this.filterDept)) &&
      (!this.filterRole || (a.roles || []).includes(this.filterRole))
    );
  }

  clearFilters(): void {
    this.search = '';
    this.filterType = '';
    this.filterDept = '';
    this.filterRole = '';
    this.applyFilters();
  }

  trackByValue(_: number, item: { value: string }): string {
    return item.value;
  }

  toggleRole(role: string, on: boolean): void {
    on ? this.roles.add(role) : this.roles.delete(role);
  }

  toggleDepartment(id: string, on: boolean): void {
    on ? this.departments.add(id) : this.departments.delete(id);
  }

  get allRolesSelected(): boolean {
    return this.roleOptions.every(r => this.roles.has(r.value));
  }
  toggleAllRoles(): void {
    this.roles = this.allRolesSelected ? new Set() : new Set(this.roleOptions.map(r => r.value));
  }

  get allDepartmentsSelected(): boolean {
    return this.departmentOptions.length > 0 && this.departmentOptions.every(d => this.departments.has(d._id));
  }
  toggleAllDepartments(): void {
    this.departments = this.allDepartmentsSelected ? new Set() : new Set(this.departmentOptions.map(d => d._id));
  }

  typeIcon(type: AnnouncementType): string {
    return this.typeOptions.find(t => t.value === type)?.icon ?? 'campaign';
  }

  get typeOption(): TypeOption {
    return this.typeOptions.find(t => t.value === this.type) ?? this.typeOptions[0];
  }

  get hasAudience(): boolean {
    return this.roles.size > 0 || this.departments.size > 0;
  }

  get canSend(): boolean {
    const t = this.title.trim(), m = this.message.trim();
    return !this.sending && !!t && !!m && t.length <= TITLE_MAX && m.length <= MESSAGE_MAX && this.hasAudience;
  }

  /** Roles in the fixed (server) order. */
  private orderedRoles(roles: Iterable<string>): string[] {
    const set = new Set(roles);
    return ['DEV', 'DIR', 'ADMIN', 'TL', 'VOL'].filter(r => set.has(r));
  }

  roleLabels(roles: string[]): string {
    return roles.map(r => this.allRoles.find(o => o.value === r)?.label ?? r).join(', ');
  }

  /** A past announcement that went to Developers can only be re-sent by a Developer. */
  canResend(a: Announcement): boolean {
    return this.isDev || !(a.roles || []).includes('DEV');
  }

  /** "Volunteers in Box Office", "Everyone in Box Office, Operations", "Team Leads, Volunteers". */
  audienceText(roles: string[], deptNames: string[]): string {
    const who = roles.length ? this.roleLabels(roles) : 'Everyone';
    return deptNames.length ? `${who} in ${deptNames.join(', ')}` : who;
  }

  get audiencePreview(): string {
    if (!this.hasAudience) return 'Pick at least one role or department';
    const names = this.departmentOptions.filter(d => this.departments.has(d._id)).map(d => d.name);
    return this.audienceText(this.orderedRoles(this.roles), names);
  }

  historyAudience(a: Announcement): string {
    return this.audienceText(a.roles || [], (a.departments || []).map(d => d.name));
  }

  trackById(_: number, item: { _id: string }): string {
    return item._id;
  }

  typeLabel(type: AnnouncementType): string {
    return this.typeOptions.find(t => t.value === type)?.label ?? 'General';
  }

  typeBadge(type: AnnouncementType): string {
    return this.typeOptions.find(t => t.value === type)?.badge ?? 'General';
  }

  async send(): Promise<void> {
    if (!this.canSend) return;
    const roles = this.orderedRoles(this.roles);
    const ok = await firstValueFrom(this.confirm.confirm({
      title: this.type === 'urgent' ? 'Send an URGENT announcement?' : 'Send announcement?',
      message: `"${this.typeOption.prefix}${this.title.trim()}" goes to ${this.audiencePreview} on every phone with BiG notifications on. It can't be recalled.`,
      confirmText: 'Send',
      danger: this.type === 'urgent'
    }));
    if (!ok) return;

    this.sending = true;
    try {
      const sent = await this.push.sendAnnouncement({
        type: this.type, title: this.title.trim(), message: this.message.trim(),
        roles, departments: [...this.departments]
      });
      this.reportSent(sent);
      this.resetForm();
      this.history = [sent, ...this.history];
      this.applyFilters();
    } catch (err: any) {
      this.notifications.openErrorSnackBar(this.errorText(err, 'Could not send the announcement'));
    } finally {
      this.sending = false;
    }
  }

  async sendAgain(a: Announcement): Promise<void> {
    const ok = await firstValueFrom(this.confirm.confirm({
      title: 'Send again?',
      message: `"${a.title}" goes again to ${this.historyAudience(a)}, as a new notification.`,
      confirmText: 'Send again',
      danger: a.type === 'urgent'
    }));
    if (!ok) return;
    this.resendingId = a._id;
    try {
      const sent = await this.push.resendAnnouncement(a._id);
      this.reportSent(sent);
      this.history = [sent, ...this.history];
      this.applyFilters();
    } catch (err: any) {
      this.notifications.openErrorSnackBar(this.errorText(err, 'Could not send it again'));
    } finally {
      this.resendingId = null;
    }
  }

  /** Fills the form with a past announcement so it can be changed before sending. */
  copyToForm(a: Announcement): void {
    this.type = a.type || 'general';
    this.title = a.title;
    this.message = a.message;
    // Keep only roles this person can pick (Developers drops out for non-Developers).
    this.roles = new Set((a.roles || []).filter(r => this.roleOptions.some(o => o.value === r)));
    this.departments = new Set((a.departments || []).map(d => d._id));
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  private resetForm(): void {
    this.type = 'general';
    this.title = '';
    this.message = '';
    this.roles = new Set();
    this.departments = new Set();
  }

  private reportSent(sent: Announcement): void {
    this.notifications.openSucessSnackBar(
      sent.delivered ? `Sent to ${sent.delivered} device${sent.delivered === 1 ? '' : 's'}` : 'Sent — but nobody in that audience has notifications on yet');
  }

  private errorText(err: any, fallback: string): string {
    return err?.error?.message || err?.error?.errors?.[0]?.msg || fallback;
  }
}
