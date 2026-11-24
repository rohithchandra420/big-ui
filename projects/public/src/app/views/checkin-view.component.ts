import { Component, Input, OnDestroy, OnInit } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Subscription } from 'rxjs';
import { I18nService, TPipe, WordKey } from '../core/i18n';
import { CheckinAnswer, CheckinApiService, CheckinGender, CheckinPage, CheckinPass, CheckinProblem } from '../core/checkin-api.service';

// Early Check-In page (EC3, EARLY_CHECKIN_CONTEXT.md): opened from the link in
// the Early Check-In email (`/live/#check-in/<link>`). Shows only this form —
// no navigation, nothing else of the public page, and it works while the
// Public Page is switched off. One submission per link.

/** One pass being filled in. */
export interface CheckinDraft {
  id: string;
  passType: string;
  locked: boolean;
  name: string;
  phone_no: string;
  email: string;
  gender: CheckinGender | null;
}

export type FieldKey = 'name' | 'phone_no' | 'email' | 'gender';

/** Same rules as big-api routers/checkin.js (and User.cleanPhone). */
export function cleanPhone(v: string): string | null {
  const s = String(v || '').replace(/[\s\-().]/g, '');
  return /^\+?\d{7,15}$/.test(s) ? s : null;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The problem with one field of a pass, or null. */
export function fieldError(d: CheckinDraft, field: string, nameMin = 2, nameMax = 60): WordKey | null {
  if (d.locked) return null;
  switch (field) {
    case 'name': {
      const n = d.name.trim().replace(/\s+/g, ' ');
      if (!n) return 'ci.err.required';
      return n.length < nameMin || n.length > nameMax ? 'ci.err.name' : null;
    }
    case 'phone_no':
      if (!d.phone_no.trim()) return 'ci.err.required';
      return cleanPhone(d.phone_no) ? null : 'ci.err.phone';
    case 'email': {
      const e = d.email.trim();
      if (!e) return 'ci.err.required';
      return e.length <= 254 && EMAIL_RE.test(e) ? null : 'ci.err.email';
    }
    case 'gender':
      return d.gender ? null : 'ci.err.gender';
    default:
      return null;
  }
}

const GENDER_ICON: Record<CheckinGender, string> = { 'Male': 'man', 'Female': 'woman', 'Prefer not to say': 'person' };
const GENDER_WORD: Record<CheckinGender, WordKey> = { 'Male': 'ci.g.male', 'Female': 'ci.g.female', 'Prefer not to say': 'ci.g.none' };
const PROBLEM: Record<CheckinProblem, { icon: string; title: WordKey; text: WordKey }> = {
  invalid: { icon: 'link_off', title: 'ci.invalid.title', text: 'ci.invalid.text' },
  expired: { icon: 'hourglass_disabled', title: 'ci.expired.title', text: 'ci.expired.text' },
  used: { icon: 'task_alt', title: 'ci.used.title', text: 'ci.used.text' },
  busy: { icon: 'hourglass_top', title: 'ci.busy.title', text: 'ci.busy.text' },
  offline: { icon: 'wifi_off', title: 'ci.offline.title', text: 'ci.offline.text' },
  error: { icon: 'error', title: 'ci.error.title', text: 'ci.error.text' },
};

@Component({
  selector: 'pub-checkin',
  standalone: true,
  imports: [NgIf, NgFor, TPipe],
  templateUrl: './checkin-view.component.html',
})
export class CheckinViewComponent implements OnInit, OnDestroy {
  /** The link's secret (from the address hash), or null when it is malformed. */
  @Input() token: string | null = null;

  phase: 'loading' | 'form' | 'review' | 'sending' | 'done' | 'problem' = 'loading';
  page: CheckinPage | null = null;
  drafts: CheckinDraft[] = [];
  problem: CheckinProblem = 'invalid';
  /** A message from the server for a refused submit (shown above the button). */
  sendError: string | null = null;
  /** Show every field's error (after a first try to continue). */
  tried = false;
  touched = new Set<string>();
  doneCount = 0;

  private sub?: Subscription;

  constructor(private api: CheckinApiService, private i18n: I18nService) {}

  ngOnInit(): void { this.load(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  load(): void {
    if (!this.token) { this.showProblem('invalid'); return; }
    this.phase = 'loading';
    this.sub?.unsubscribe();
    this.sub = this.api.open(this.token).subscribe(a => this.take(a));
  }

  private take(a: CheckinAnswer): void {
    if (a.state === 'open') {
      this.page = a;
      this.drafts = a.passes.map((p: CheckinPass) => ({
        id: p.id, passType: p.passType, locked: p.locked,
        name: p.name || '', phone_no: p.phone_no || '', email: p.email || '', gender: p.gender || null
      }));
      this.phase = 'form';
    } else if (a.state === 'submitted') {
      this.doneCount = a.count;
      this.phase = 'done';
      // The link is used up: take its secret out of the address bar and history.
      history.replaceState(null, '', location.pathname + location.search);
    } else {
      this.showProblem(a.problem, a.message);
    }
  }

  private showProblem(p: CheckinProblem, message?: string): void {
    // A refused submit (bad field, changed booking) keeps the form on screen.
    if (p === 'error' && (this.phase === 'sending' || this.phase === 'review') && this.page) {
      this.phase = 'form';
      this.sendError = message || this.i18n.t('ci.error.text');
      return;
    }
    this.problem = p;
    this.phase = 'problem';
  }

  // ---------- Form ----------

  get fields(): string[] { return this.page?.fields || []; }
  get genders(): CheckinGender[] { return this.page?.genders || []; }
  get openDrafts(): CheckinDraft[] { return this.drafts.filter(d => !d.locked); }
  get readyCount(): number { return this.openDrafts.filter(d => this.ready(d)).length; }

  ready(d: CheckinDraft): boolean {
    return this.fields.every(f => !fieldError(d, f, this.page?.nameMin, this.page?.nameMax));
  }

  error(d: CheckinDraft, field: string): WordKey | null {
    if (!this.tried && !this.touched.has(d.id + field)) return null;
    return fieldError(d, field, this.page?.nameMin, this.page?.nameMax);
  }

  touch(d: CheckinDraft, field: string): void { this.touched.add(d.id + field); }

  pickGender(d: CheckinDraft, g: CheckinGender): void {
    d.gender = g;
    this.touch(d, 'gender');
  }

  genderIcon(g: CheckinGender): string { return GENDER_ICON[g] || 'person'; }
  genderWord(g: CheckinGender): string { return this.i18n.t(GENDER_WORD[g] || 'ci.g.none'); }
  fieldLabel(f: string): string {
    const key = `ci.f.${f}` as WordKey;
    const t = this.i18n.t(key);
    return t === key ? f : t;
  }
  inputType(f: string): string { return f === 'email' ? 'email' : f === 'phone_no' ? 'tel' : 'text'; }
  autocomplete(f: string, first: boolean): string {
    if (!first) return 'off';
    return f === 'email' ? 'email' : f === 'phone_no' ? 'tel' : f === 'name' ? 'name' : 'off';
  }
  value(d: CheckinDraft, f: string): string { return (d as unknown as Record<string, string>)[f] ?? ''; }
  setValue(d: CheckinDraft, f: string, v: string): void { (d as unknown as Record<string, string>)[f] = v; }

  /** Continue: check everything, then show the summary to confirm. */
  review(): void {
    this.tried = true;
    this.sendError = null;
    const bad = this.openDrafts.find(d => !this.ready(d));
    if (bad) {
      document.getElementById('ci-pass-' + bad.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    this.phase = 'review';
    window.scrollTo({ top: 0 });
  }

  back(): void { this.phase = 'form'; }

  send(): void {
    if (!this.token || this.phase !== 'review') return;
    this.phase = 'sending';
    this.sendError = null;
    const passes = this.openDrafts.map(d => ({ id: d.id, name: d.name, phone_no: d.phone_no, email: d.email, gender: d.gender }));
    this.sub?.unsubscribe();
    this.sub = this.api.submit(this.token, passes).subscribe(a => this.take(a));
  }

  // ---------- Words ----------

  get problemView() { return PROBLEM[this.problem]; }

  dateLabel(iso: string | null): string {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
  }

  get datesLabel(): string {
    const e = this.page?.event;
    if (!e?.startDate) return '';
    const a = this.dateLabel(e.startDate), b = this.dateLabel(e.endDate);
    return b && b !== a ? `${a} – ${b}` : a;
  }

  trackDraft(_: number, d: CheckinDraft): string { return d.id; }
  trackStr(_: number, s: string): string { return s; }
}
