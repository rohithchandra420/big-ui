import { Component, ElementRef, HostListener, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { BillboardNote, BillboardNoteType, BillboardService } from '../core/billboard.service';

interface NoteStyle { icon: string; label: string; }

/**
 * Billboard (PWA, see PWA_CONTEXT.md): every announcement the signed-in user
 * received, as post-it notes. Tapping a note opens it as a large post-it;
 * `?n=<id>` (the link a push notification opens) opens that note directly.
 */
@Component({
  selector: 'app-billboard',
  templateUrl: './billboard.component.html',
  styleUrls: ['./billboard.component.css']
})
export class BillboardComponent implements OnInit, OnDestroy {
  readonly TYPES: Record<BillboardNoteType, NoteStyle> = {
    general:  { icon: 'campaign',             label: 'General' },
    urgent:   { icon: 'emergency_home',       label: 'Urgent' },
    schedule: { icon: 'event_repeat',         label: 'Schedule' },
    weather:  { icon: 'thunderstorm',         label: 'Weather' },
    reminder: { icon: 'notifications_active', label: 'Reminder' },
    task:     { icon: 'task_alt',             label: 'Task' },
    email:    { icon: 'mark_email_read',      label: 'Emails sent' },
    meal:     { icon: 'restaurant',           label: 'Meals' }
  };
  private readonly ROLE_LABELS: Record<string, string> = {
    DEV: 'Developers', DIR: 'Directors', ADMIN: 'Admins', TL: 'Team Leads', VOL: 'Volunteers'
  };

  notes: BillboardNote[] = [];
  hasMore = false;
  loading = true;
  loadingMore = false;
  loadError = false;
  tab: 'all' | 'unread' = 'all';
  unread = 0;
  open: BillboardNote | null = null;

  @ViewChild('closeBtn') closeBtn?: ElementRef<HTMLButtonElement>;
  private subs = new Subscription();

  constructor(private billboard: BillboardService, private route: ActivatedRoute, private router: Router) {}

  ngOnInit(): void {
    this.subs.add(this.billboard.unread$.subscribe(n => this.unread = n));
    // Each ?n= (also a push tapped while the page is already open) reloads, so a
    // brand-new note is there to open.
    // Closing a note drops ?n=, which needs no reload.
    this.subs.add(this.route.queryParamMap.subscribe(p => {
      const n = p.get('n');
      if (n || !this.notes.length) this.load(n);
    }));
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
  }

  get shown(): BillboardNote[] {
    return this.tab === 'unread' ? this.notes.filter(n => !n.read) : this.notes;
  }

  async load(openId: string | null = null): Promise<void> {
    this.loading = !this.notes.length;
    this.loadError = false;
    try {
      const page = await this.billboard.list();
      this.notes = page.notes;
      this.hasMore = page.hasMore;
      this.billboard.refreshUnread();
      const target = openId && this.notes.find(n => n._id === openId);
      if (target) this.openNote(target);
    } catch {
      this.loadError = true;
    } finally {
      this.loading = false;
    }
  }

  async showOlder(): Promise<void> {
    const last = this.notes[this.notes.length - 1];
    if (!last || this.loadingMore) return;
    this.loadingMore = true;
    try {
      const page = await this.billboard.list(last._id);
      this.notes = [...this.notes, ...page.notes];
      this.hasMore = page.hasMore;
    } catch {
      this.loadError = true;
    } finally {
      this.loadingMore = false;
    }
  }

  openNote(note: BillboardNote): void {
    this.open = note;
    if (!note.read) {
      note.read = true;
      this.billboard.markRead(note._id).catch(() => { note.read = false; });
    }
    setTimeout(() => this.closeBtn?.nativeElement.focus());
  }

  @HostListener('document:keydown.escape')
  closeNote(): void {
    if (!this.open) return;
    this.open = null;
    // Drop ?n= so a refresh doesn't open it again.
    if (this.route.snapshot.queryParamMap.has('n')) {
      this.router.navigate([], { relativeTo: this.route, queryParams: { n: null }, queryParamsHandling: 'merge', replaceUrl: true });
    }
  }

  async markAllRead(): Promise<void> {
    const unreadNotes = this.notes.filter(n => !n.read);
    unreadNotes.forEach(n => n.read = true);
    try {
      await this.billboard.markAllRead();
    } catch {
      unreadNotes.forEach(n => n.read = false);
    }
  }

  /** "Team Leads, Volunteers in Operations"; "Only you" for BiG's own private
   *  notes ("Emails sent", Hospitality's Remind-TL tasks — no roles or departments). */
  audience(n: BillboardNote): string {
    if (n.type === 'email' || (!n.roles.length && !n.departments.length && n.type !== 'meal')) return 'Only you';
    const who = n.roles.length ? n.roles.map(r => this.ROLE_LABELS[r] ?? r).join(', ') : 'Everyone';
    return n.departments.length ? `${who} in ${n.departments.join(', ')}` : who;
  }

  trackById(_: number, n: BillboardNote): string {
    return n._id;
  }
}
