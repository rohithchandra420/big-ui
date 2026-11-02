import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { NotificationService } from '../../../core/notification.service';
import { ConfirmationService } from '../../../shared/confirm-dialog/confirmation.service';
import { WorkshopService } from '../../workshop.service';
import { SessionInput, WorkshopSchedule, WorkshopSession } from '../../workshops.model';
import { PlannerDay, RegState, localDate, localTime, overlapsOf, regState, toInstant } from '../../planner.utils';

type PanelMode = 'view' | 'edit' | 'create';

/** Where a new session starts when it's added from an empty slot on the calendar. */
export interface SessionPrefill { venue?: string; day: string; start?: string; end?: string; }

/**
 * Content of the Planner's slide-in panel (the .panel shell is in
 * WorkshopPlannerComponent): view a session (with the registration switch),
 * edit it, or add one. `session` null = add.
 */
@Component({
  selector: 'app-session-panel',
  templateUrl: './session-panel.component.html',
  styleUrls: ['./session-panel.component.css']
})
export class SessionPanelComponent implements OnChanges {
  @Input() session: WorkshopSession | null = null;
  @Input() prefill: SessionPrefill | null = null;
  @Input() schedule: WorkshopSchedule | null = null;
  @Input() days: PlannerDay[] = [];
  @Output() closed = new EventEmitter<void>();
  /** After add / save / delete / switch: the planner reloads; id = the session to show (null after a delete). */
  @Output() changed = new EventEmitter<string | null>();

  mode: PanelMode = 'create';
  saving = false;
  /** The server's soft warnings from the last save (overlap, same day, limit, dates). */
  warnings: string[] = [];

  form = new FormGroup({
    workshop: new FormControl('', { nonNullable: true, validators: Validators.required }),
    venue: new FormControl('', { nonNullable: true, validators: Validators.required }),
    day: new FormControl('', { nonNullable: true, validators: Validators.required }),
    start: new FormControl('10:00', { nonNullable: true, validators: Validators.required }),
    end: new FormControl('11:00', { nonNullable: true, validators: Validators.required }),
    regOpens: new FormControl('', { nonNullable: true }),
    regCloses: new FormControl('', { nonNullable: true }),
    cutoff: new FormControl('', { nonNullable: true }),
    limit: new FormControl<number | null>(null, [Validators.min(1), Validators.max(10000)]),
    substitutes: new FormControl('', { nonNullable: true, validators: Validators.maxLength(400) })
  });

  constructor(
    private workshops: WorkshopService,
    private notify: NotificationService,
    private confirm: ConfirmationService
  ) {}

  ngOnChanges(changes: SimpleChanges) {
    if (changes['session'] || changes['prefill']) {
      const prev = changes['session']?.previousValue as WorkshopSession | null | undefined;
      // A refreshed copy of the session being shown keeps the current mode.
      const same = !!prev && !!this.session && prev._id === this.session._id && !changes['prefill'];
      if (!same) this.reset();
    }
  }

  get canManage(): boolean { return !!this.schedule?.canManage; }
  get canRun(): boolean { return !!this.schedule?.canRun; }

  get title(): string {
    if (this.mode === 'create') return 'New session';
    if (this.mode === 'edit') return 'Edit session';
    return this.session?.workshop?.title || 'Session';
  }

  get state(): RegState | null { return this.session ? regState(this.session) : null; }

  get overlaps(): WorkshopSession[] {
    return this.session && this.schedule ? overlapsOf(this.session, this.schedule.sessions) : [];
  }

  /** Who runs it: the substitutes for this session, otherwise the workshop's facilitators. */
  get facilitators(): string[] {
    const s = this.session;
    if (!s) return [];
    return s.facilitatorsOverride?.length ? s.facilitatorsOverride : (s.workshop?.facilitators || []);
  }

  get dayLabel(): string {
    const s = this.session;
    if (!s) return '';
    const d = localDate(new Date(s.start));
    const day = this.days.find(x => x.date === d);
    return day ? `${day.label} (${day.sub})` : new Date(s.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  time(iso: string | null): string { return iso ? localTime(new Date(iso)) : ''; }

  reset() {
    this.saving = false;
    this.warnings = [];
    if (this.session) {
      this.mode = 'view';
    } else {
      this.mode = 'create';
      this.fill();
    }
  }

  edit() {
    if (!this.session) return;
    this.fill();
    this.mode = 'edit';
  }

  /** Put the session (or the prefill for a new one) into the form. */
  private fill() {
    const s = this.session;
    const sc = this.schedule;
    if (s) {
      this.form.reset({
        workshop: s.workshop?._id || '', venue: s.venue?._id || '', day: localDate(new Date(s.start)),
        start: this.time(s.start), end: this.time(s.end),
        regOpens: this.time(s.regOpensAt), regCloses: this.time(s.regClosesAt), cutoff: this.time(s.cutoffAt),
        limit: s.preRegLimit, substitutes: (s.facilitatorsOverride || []).join(', ')
      });
      return;
    }
    const p = this.prefill;
    const venue = p?.venue || sc?.venues[0]?._id || '';
    this.form.reset({
      workshop: sc?.workshops[0]?._id || '', venue, day: p?.day || this.days[0]?.date || localDate(new Date()),
      start: p?.start || '10:00', end: p?.end || '11:00',
      regOpens: '', regCloses: '', cutoff: '', limit: null, substitutes: ''
    });
  }

  /** Live, before saving: the same soft checks the server runs. */
  get draftWarnings(): string[] {
    const sc = this.schedule;
    const v = this.form.getRawValue();
    if (!sc || !v.day || !v.start || !v.end || v.end <= v.start) return [];
    const out: string[] = [];
    const start = toInstant(v.day, v.start), end = toInstant(v.day, v.end);
    const clash = overlapsOf({ _id: this.session?._id || '', start, end, venue: { _id: v.venue } }, sc.sessions)[0];
    if (clash) out.push(`Overlaps "${clash.workshop?.title}" in this venue (${this.time(clash.start)}–${this.time(clash.end)})`);
    const same = sc.sessions.filter(o => o._id !== this.session?._id && o.workshop?._id === v.workshop &&
      o.status === 'scheduled' && localDate(new Date(o.start)) === v.day);
    if (same.length) out.push(`This workshop already runs that day at ${same.map(o => this.time(o.start)).join(', ')}`);
    const cap = sc.venues.find(x => x._id === v.venue)?.capacity;
    if (cap && v.limit && v.limit > cap) out.push(`The limit is above the venue's capacity (${cap})`);
    return out;
  }

  /** Hard rules, checked before sending (the server checks them too). */
  private problem(v: { start: string; end: string; regOpens: string; regCloses: string; cutoff: string }): string | null {
    if (v.end <= v.start) return 'The end must be after the start';
    if (v.regOpens && v.regCloses && v.regCloses <= v.regOpens) return 'Registration must close after it opens';
    if (v.regCloses && v.regCloses > v.end) return 'Registration must close by the end of the session';
    if (v.cutoff && (v.cutoff < v.start || v.cutoff > v.end)) return 'The cut-off must be during the session';
    return null;
  }

  // ── closing ────────────────────────────────────────────────

  @HostListener('document:keydown.escape')
  onEscape() {
    if (!this.saving) this.cancel();
  }

  /** Cancel: Edit goes back to the details; New / view close the panel. */
  cancel() {
    if (this.mode === 'edit') this.mode = 'view';
    else this.closed.emit();
  }

  close() {
    this.closed.emit();
  }

  // ── saving ─────────────────────────────────────────────────

  async save() {
    const sc = this.schedule;
    if (!sc || this.saving) return;
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const problem = this.problem(v);
    if (problem) { this.notify.openErrorSnackBar(problem); return; }

    const at = (t: string) => t ? toInstant(v.day, t) : null;
    const data: SessionInput = {
      workshop: v.workshop, venue: v.venue, start: toInstant(v.day, v.start), end: toInstant(v.day, v.end),
      regOpensAt: at(v.regOpens), regClosesAt: at(v.regCloses), cutoffAt: at(v.cutoff),
      preRegLimit: v.limit ? Number(v.limit) : null,
      facilitatorsOverride: v.substitutes.split(',').map(x => x.trim()).filter(Boolean).slice(0, 10)
    };
    this.saving = true;
    try {
      const res = this.session
        ? await this.workshops.updateSession(this.session._id, data)
        : await this.workshops.addSession(sc.event._id, data);
      this.saving = false;
      this.notify.openSucessSnackBar(this.session ? 'Session saved' : 'Session added');
      this.changed.emit(res.session._id);
      this.mode = 'view';
      this.warnings = res.warnings || [];
    } catch (err: any) {
      this.saving = false;
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not save the session');
    }
  }

  remove() {
    const s = this.session;
    if (!s || this.saving) return;
    this.confirm.confirm({
      title: 'Delete session',
      message: `Delete "${s.workshop?.title}" at ${s.venue?.name}, ${this.time(s.start)}–${this.time(s.end)}? This can't be undone.`,
      confirmText: 'Delete',
      danger: true
    }).subscribe(async ok => {
      if (!ok) return;
      this.saving = true;
      try {
        await this.workshops.deleteSession(s._id);
        this.saving = false;
        this.notify.openSucessSnackBar('Session deleted');
        this.changed.emit(null);
        this.closed.emit();
      } catch (err: any) {
        this.saving = false;
        this.notify.openErrorSnackBar(err?.error?.message || 'Could not delete the session');
      }
    });
  }

  /** The registration switch: open / close by hand, or follow the times again. */
  async setRegistration(open: boolean | null) {
    const s = this.session;
    if (!s || this.saving || s.regManual === open) return;
    this.saving = true;
    try {
      await this.workshops.setRegistration(s._id, open);
      this.saving = false;
      this.notify.openSucessSnackBar(open === null ? 'Registration follows the times again'
        : open ? 'Pre-registration opened' : 'Pre-registration closed');
      this.changed.emit(s._id);
    } catch (err: any) {
      this.saving = false;
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not change registration');
    }
  }

  trackId(_: number, x: { _id: string }) { return x._id; }
  trackDay(_: number, d: PlannerDay) { return d.date; }
}
