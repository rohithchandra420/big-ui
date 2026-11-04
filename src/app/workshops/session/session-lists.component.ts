import { Component, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { Subject, Subscription, debounceTime, filter } from 'rxjs';
import { NotificationService } from '../../core/notification.service';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { BandLookup } from '../../box-office/box-office.service';
import { BoxOfficeQrscannerPopupComponent, QrScannerData } from '../../box-office/registration/qrscanner-popup/qrscanner-popup.component';
import { WorkshopService } from '../workshop.service';
import { DoorAnswer, EntryPass, PersonRef, SessionLists, WorkshopEntry } from '../workshops.model';
import { effectiveCutoff, effectiveRegCloses, localTime } from '../planner.utils';

type Tab = 'list' | 'door';
type Action = 'add' | 'door';

/** What the last scan / pick turned into, shown as the big card. */
interface Outcome {
  tone: 'ok' | 'info' | 'wait' | 'bad';
  icon: string;
  title: string;
  detail: string;
  name?: string;
  warnings?: string[];
  /** Walk-in / waitlisted: the entry staff can let in. */
  letIn?: WorkshopEntry;
  letInLabel?: string;
  /** A replaced band: staff check the person, then continue with its owner. */
  flag?: { band: BandLookup; ref: PersonRef; action: Action };
}

/**
 * Workshops › a session's lists and door (release 3: W5 pre-registration,
 * W6 the door). The Workshop team only (WorkshopRunGuard; the server checks
 * too). Find a person by scanning their wrist band or by searching; the
 * server applies the rules and says what happened.
 */
@Component({
  selector: 'app-session-lists',
  templateUrl: './session-lists.component.html',
  styleUrls: ['./session-lists.component.css']
})
export class SessionListsComponent implements OnInit, OnDestroy {
  sessionId = '';
  data: SessionLists | null = null;
  loading = false;
  loadError = '';
  tab: Tab = 'list';
  busy = false;

  // Lists, stored (not built in a getter) for the *ngFor.
  pre: WorkshopEntry[] = [];
  wait: WorkshopEntry[] = [];
  walkin: WorkshopEntry[] = [];
  groups: { key: string; title: string; rows: WorkshopEntry[]; empty: string }[] = [];

  search = '';
  results: EntryPass[] = [];
  searching = false;
  searched = false;
  private search$ = new Subject<string>();

  outcome: Outcome | null = null;
  private sub = new Subscription();

  constructor(
    private route: ActivatedRoute,
    private workshops: WorkshopService,
    private dialog: MatDialog,
    private notify: NotificationService,
    private gate: GateFeedbackService
  ) {}

  ngOnInit() {
    this.sessionId = this.route.snapshot.paramMap.get('id') || '';
    const t = this.route.snapshot.queryParamMap?.get('tab');
    if (t === 'door') this.tab = 'door';
    this.sub.add(this.search$.pipe(debounceTime(300)).subscribe(q => this.runSearch(q)));
    this.load();
  }

  ngOnDestroy() {
    this.sub.unsubscribe();
  }

  async load() {
    this.loading = true;
    this.loadError = '';
    try {
      this.data = await this.workshops.getLists(this.sessionId);
      const e = this.data.entries;
      this.pre = e.filter(x => x.list === 'pre');
      this.wait = e.filter(x => x.list === 'wait');
      this.walkin = e.filter(x => x.list === 'walkin');
      this.groups = [
        { key: 'pre', title: 'Pre-registration list', rows: this.pre, empty: 'Nobody on the list yet' },
        { key: 'wait', title: 'Waitlist', rows: this.wait, empty: 'Nobody waiting' },
        { key: 'walkin', title: 'Walk-ins', rows: this.walkin, empty: 'No walk-ins' }
      ];
    } catch (err: any) {
      this.loadError = err?.status === 404 ? 'This session was not found.' : 'Could not load the lists.';
    } finally {
      this.loading = false;
    }
  }

  get s() { return this.data?.session; }
  get when(): string {
    const s = this.s;
    if (!s) return '';
    const d = new Date(s.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    return `${d} · ${localTime(new Date(s.start))}–${localTime(new Date(s.end))} · ${s.venue?.name}`;
  }
  get cutoffPassed(): boolean {
    return !!this.s && new Date() >= effectiveCutoff(this.s);
  }
  /** Registration close / cut-off as in force (defaults filled in). */
  get regCloses(): Date | null { return this.s ? effectiveRegCloses(this.s) : null; }
  get cutoff(): Date | null { return this.s ? effectiveCutoff(this.s) : null; }
  /** Nobody is let in while the door is closed (the server refuses too). */
  get doorClosed(): boolean { return !!this.data && !this.data.doorOpen; }

  /** The Door tab's line: who can go in right now. */
  get doorNote(): string {
    const s = this.s;
    if (!s || !this.data) return '';
    if (s.doorManual === false) return `Entry closed by staff${s.doorManualAt ? ' at ' + this.time(s.doorManualAt) : ''}: nobody else is let in. Open it from the session in the Planner.`;
    if (new Date() >= new Date(s.end)) return 'The session has ended: entry is closed.';
    if (this.doorClosed) return `Entry opens at ${this.time(this.regCloses)}, when registration closes.`;
    return this.cutoffPassed ? `Cut-off ${this.time(this.cutoff)} has passed: everyone can go in, the waitlist and walk-ins too.`
      : `Entry open for the list. Cut-off ${this.time(this.cutoff)}: then the waitlist and walk-ins go in.`;
  }

  time(iso: string | Date | null | undefined): string { return iso ? localTime(new Date(iso)) : ''; }

  setTab(t: Tab) {
    this.tab = t;
    this.outcome = null;
  }

  // ── finding a person ───────────────────────────────────────

  onSearch(q: string) {
    this.search = q;
    if (q.trim().length < 2) { this.results = []; this.searched = false; return; }
    this.search$.next(q.trim());
  }

  private async runSearch(q: string) {
    if (!this.s) return;
    this.searching = true;
    try {
      this.results = (await this.workshops.searchPasses(String(this.s.event), q)).passes;
    } catch {
      this.results = [];
    } finally {
      this.searching = false;
      this.searched = true;
    }
  }

  pick(p: EntryPass) {
    this.results = [];
    this.search = '';
    this.searched = false;
    this.act({ passId: p._id });
  }

  scan() {
    this.gate.unlock();
    const data: QrScannerData = { mode: 'raw', title: this.tab === 'door' ? 'Door: Scan Wrist Band' : 'Add to list: Scan Wrist Band' };
    this.dialog.open(BoxOfficeQrscannerPopupComponent, { width: '90%', maxWidth: '480px', data })
      .afterClosed().pipe(filter((raw): raw is string => typeof raw === 'string' && !!raw))
      .subscribe(raw => this.act({ raw }));
  }

  /** Add to the list (List tab) or check at the door (Door tab). */
  act(ref: PersonRef, action: Action = this.tab === 'door' ? 'door' : 'add') {
    action === 'door' ? this.checkDoor(ref) : this.addToList(ref);
  }

  /** Replaced band: staff checked the person — continue with its owner. */
  continueFlagged() {
    const f = this.outcome?.flag;
    if (!f) return;
    this.act({ ...f.ref, confirmReplaced: true }, f.action);
  }

  dismiss() {
    this.outcome = null;
  }

  // ── List (W5) ──────────────────────────────────────────────

  private async addToList(ref: PersonRef) {
    if (this.busy) return;
    this.busy = true;
    try {
      const res = await this.workshops.addToList(this.sessionId, ref);
      const name = res.entry.pass?.name || 'Added';
      this.gate.found();
      this.outcome = res.list === 'pre'
        ? { tone: 'ok', icon: 'how_to_reg', name, title: 'Added to the list', detail: `Number ${this.pre.length + 1} on the list.`, warnings: res.warnings }
        : { tone: 'wait', icon: 'hourglass_top', name, title: 'List full: added to the waitlist', detail: 'They move up automatically when someone leaves the list.', warnings: res.warnings };
      await this.load();
    } catch (err: any) {
      this.failed(err, ref, 'add');
    } finally {
      this.busy = false;
    }
  }

  async remove(e: WorkshopEntry) {
    if (this.busy) return;
    this.busy = true;
    try {
      const res = await this.workshops.removeFromList(this.sessionId, e._id);
      this.notify.openSucessSnackBar(res.promoted.length
        ? `${e.pass?.name || 'Removed'}. ${res.promoted.join(', ')} moved up from the waitlist.`
        : `${e.pass?.name || 'Removed'} removed`);
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not remove');
    } finally {
      this.busy = false;
    }
  }

  // ── Door (W6) ──────────────────────────────────────────────

  private async checkDoor(ref: PersonRef) {
    if (this.busy) return;
    this.busy = true;
    try {
      this.showDoor(await this.workshops.door(this.sessionId, ref));
      await this.load();
    } catch (err: any) {
      this.failed(err, ref, 'door');
    } finally {
      this.busy = false;
    }
  }

  async letIn(e: WorkshopEntry) {
    if (this.busy) return;
    this.busy = true;
    try {
      this.showDoor(await this.workshops.letIn(this.sessionId, e._id));
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not let them in');
      if (err?.error?.door) await this.load();
    } finally {
      this.busy = false;
    }
  }

  private showDoor(a: DoorAnswer) {
    const name = a.entry.pass?.name || '';
    switch (a.result) {
      case 'admitted':
        this.gate.found();
        this.outcome = { tone: 'ok', icon: 'check_circle', name, title: 'Let in', warnings: a.warnings,
          detail: a.entry.list === 'pre' ? 'On the list. Attendance marked.' : a.entry.list === 'wait' ? 'From the waitlist. Attendance marked.' : 'Walk-in. Attendance marked.' };
        break;
      case 'already':
        this.gate.found();
        this.outcome = { tone: 'info', icon: 'task_alt', name, title: 'Already in', detail: `Attended at ${this.time(a.entry.attendedAt)}.` };
        break;
      case 'waitlisted':
        this.gate.notFound();
        this.outcome = { tone: 'wait', icon: 'hourglass_top', name, title: 'On the waitlist: please wait',
          detail: 'The waitlist goes in after the cut-off.', letIn: a.entry, letInLabel: 'Let in anyway' };
        break;
      case 'late':
        this.gate.notFound();
        this.outcome = { tone: 'wait', icon: 'schedule', name, title: 'Came after the cut-off',
          detail: 'They lost their place on the list and are now a walk-in at the end.', letIn: a.entry, letInLabel: 'Let in now' };
        break;
      default:
        this.gate.notFound();
        this.outcome = { tone: 'wait', icon: 'person_add', name, title: 'Not on a list: added as a walk-in',
          detail: a.afterCutoff ? 'The cut-off has passed: walk-ins can go in.' : 'Let them in now, or keep them waiting at the end of the line.',
          letIn: a.entry, letInLabel: 'Let in now' };
    }
  }

  // ── errors ─────────────────────────────────────────────────

  private failed(err: any, ref: PersonRef, action: Action) {
    const body = err?.error || {};
    if (err?.status === 409 && body.state === 'replaced') {
      this.gate.notFound();
      const band: BandLookup = { state: 'replaced', code: '', owner: body.owner, currentCode: body.currentCode, reason: body.reason } as BandLookup;
      this.outcome = { tone: 'bad', icon: 'gpp_maybe', title: 'Replaced band', detail: body.message, flag: { band, ref, action } };
      return;
    }
    if (err?.status === 409 && body.door) {
      // The door closed (or isn't open yet) since the page loaded: refresh so the page says so.
      this.gate.notFound();
      this.outcome = { tone: 'bad', icon: 'door_front', title: 'Entry closed',
        detail: body.door.byHand ? 'Entry was closed by staff: nobody else is let in.' : body.message };
      this.load();
      return;
    }
    if (!err?.status || err.status >= 500) {
      this.gate.error();
      this.outcome = { tone: 'bad', icon: 'wifi_off', title: 'Could not check', detail: 'Connection problem. Try again.' };
      return;
    }
    this.gate.notFound();
    const title = body.state === 'unknown' ? 'Unknown band' : body.state === 'not_admitted' ? 'Not admitted at the gate'
      : body.state === 'staff' ? 'Staff band' : 'Not added';
    this.outcome = { tone: 'bad', icon: 'block', title, detail: body.message || 'Something went wrong' };
  }

  trackId(_: number, x: { _id: string }) { return x._id; }
  trackKey(_: number, g: { key: string }) { return g.key; }
}
