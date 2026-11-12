import { Component, HostListener, OnDestroy, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Subscription, firstValueFrom } from 'rxjs';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { MedicalService } from '../medical.service';
import {
  ADULT_AGE, AUDIT_LABEL, AuditEntry, GENDERS, Gender, KIND_LABEL, MedicalPatient, MedicalVisit, Medicine,
  OUTCOMES, OUTCOME_LABEL, Outcome, PatientReport, SEVERITIES, SEVERITY_BADGE, SEVERITY_LABEL, VisitInput, Vitals
} from '../medical.model';

interface HeaderForm {
  name: string; phone: string; email: string; age: number | null; gender: Gender | null;
  allergies: string; conditions: string; guardianName: string; guardianPhone: string; guardianContacted: boolean;
}

/** "YYYY-MM-DDTHH:mm" in local time, for <input type="datetime-local">. */
export function toLocalInput(value: string | Date | null): string {
  if (!value) return '';
  const d = new Date(value);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
const fromLocalInput = (value: string): string | null => (value ? new Date(value).toISOString() : null);
const numOrNull = (v: any): number | null => (v === null || v === undefined || String(v).trim() === '' ? null : Number(v));

/** Readings worth a second look (shown in amber) — a hint for staff, not a diagnosis. */
export function vitalWarnings(v: Vitals | null | undefined): Set<keyof Vitals> {
  const out = new Set<keyof Vitals>();
  if (!v) return out;
  if (v.temperature != null && (v.temperature >= 38 || v.temperature < 35)) out.add('temperature');
  if (v.pulse != null && (v.pulse > 120 || v.pulse < 50)) out.add('pulse');
  if (v.bpSys != null && (v.bpSys >= 140 || v.bpSys < 90)) out.add('bpSys');
  if (v.bpDia != null && (v.bpDia >= 90 || v.bpDia < 60)) out.add('bpDia');
  if (v.spo2 != null && v.spo2 < 94) out.add('spo2');
  return out;
}

const emptyVisit = (): VisitInput & { atLocal: string; followUpAtLocal: string } => ({
  atLocal: toLocalInput(new Date()), followUpAtLocal: '',
  alsoAttended: '', complaint: '', diagnosis: '', medicines: [{ name: '', dose: '', qty: '' }], notes: '',
  vitals: { temperature: null, pulse: null, bpSys: null, bpDia: null, spo2: null },
  severity: null, outcome: null, hospital: '', followUp: { needed: false, at: null, note: '', done: false }
});

/** One patient's report: details, allergies, visit timeline and the new-visit form (MEDICAL_CONTEXT.md). */
@Component({
  selector: 'app-medical-patient',
  templateUrl: './medical-patient.component.html'
})
export class MedicalPatientComponent implements OnInit, OnDestroy {
  readonly severities = SEVERITIES;
  readonly outcomes = OUTCOMES;
  readonly genders = GENDERS;
  readonly kindLabel = KIND_LABEL;
  readonly sevLabel = SEVERITY_LABEL;
  readonly sevBadge = SEVERITY_BADGE;
  readonly outLabel = OUTCOME_LABEL;
  readonly auditLabel = AUDIT_LABEL;
  readonly adultAge = ADULT_AGE;

  id = '';
  report: PatientReport | null = null;
  loading = true;
  saving = false;

  header: HeaderForm | null = null;
  form: (VisitInput & { atLocal: string; followUpAtLocal: string }) | null = null;
  editingVisitId: string | null = null;
  suggestions: string[] = [];
  audit: AuditEntry[] | null = null;
  warnings = new Map<string, Set<keyof Vitals>>();
  /** The SOS message, when opened from "Start medical visit" (first new visit starts with it). */
  private sosMessage: string | null = null;

  // Email report (password-protected PDF)
  /** The side panel: Edit details, Email report or Audit log (null = closed). */
  panel: 'edit' | 'email' | 'audit' | null = null;
  emailTo = '';
  ownPassword = false;
  emailPassword = '';
  tester = '';
  safeMode = false;
  sending = false;

  private sub?: Subscription;
  private suggestTimer: any = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private medical: MedicalService,
    private notify: NotificationService,
    private confirmation: ConfirmationService
  ) {}

  ngOnInit(): void {
    const st = typeof history !== 'undefined' ? history.state?.sos : null;
    if (st) this.sosMessage = String(st.message || '').trim() || 'SOS';
    this.sub = this.route.paramMap.subscribe(p => {
      this.id = p.get('id') || '';
      this.form = null;
      this.panel = null;
      this.header = null;
      this.audit = null;
      this.load();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    clearTimeout(this.suggestTimer);
  }

  get patient(): MedicalPatient | null { return this.report?.patient || null; }
  get visits(): MedicalVisit[] { return this.report?.visits || []; }
  get isMinor(): boolean { return this.patient?.age != null && this.patient.age < ADULT_AGE; }
  get headerMinor(): boolean { const a = numOrNull(this.header?.age); return a !== null && a < ADULT_AGE; }

  async load(): Promise<void> {
    this.loading = true;
    try {
      this.report = await this.medical.report(this.id);
      this.rebuildWarnings();
      if (!this.visits.length && !this.form) this.newVisit();
    } catch (err: any) {
      this.report = null;
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not load the report');
    } finally {
      this.loading = false;
    }
  }

  private rebuildWarnings(): void {
    this.warnings = new Map(this.visits.map(v => [v._id, vitalWarnings(v.vitals)]));
  }

  // ── Report details ──

  editHeader(): void {
    const p = this.patient!;
    this.header = {
      name: p.name, phone: p.phone, email: p.email, age: p.age, gender: p.gender, allergies: p.allergies, conditions: p.conditions,
      guardianName: p.guardian?.name || '', guardianPhone: p.guardian?.phone || '', guardianContacted: !!p.guardian?.contacted
    };
    this.panel = 'edit';
  }

  async saveHeader(): Promise<void> {
    if (!this.header || !this.patient || this.saving) return;
    const h = this.header;
    this.saving = true;
    try {
      const data: any = {
        phone: h.phone.trim(), age: numOrNull(h.age), gender: h.gender, allergies: h.allergies.trim(), conditions: h.conditions.trim(),
        guardian: { name: h.guardianName.trim(), phone: h.guardianPhone.trim(), contacted: h.guardianContacted }
      };
      if (this.patient.kind === 'walkin') { data.name = h.name.trim(); data.email = h.email.trim(); }
      const { patient } = await this.medical.updateReport(this.patient._id, data);
      this.report = { ...this.report!, patient };
      this.closePanel();
      this.notify.openSucessSnackBar('Report details saved');
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save');
    } finally {
      this.saving = false;
    }
  }

  async setGuardianContacted(contacted: boolean): Promise<void> {
    const p = this.patient;
    if (!p) return;
    try {
      const { patient } = await this.medical.updateReport(p._id, { guardian: { ...p.guardian, contacted } });
      this.report = { ...this.report!, patient };
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not save');
    }
  }

  async deleteReport(): Promise<void> {
    const p = this.patient;
    if (!p) return;
    const ok = await firstValueFrom(this.confirmation.confirm({
      title: 'Delete this report?', danger: true, confirmText: 'Delete report',
      message: `${p.name}'s report and all ${p.visitCount} visits will be deleted. This can't be undone.`
    }));
    if (!ok) return;
    try {
      await this.medical.deleteReport(p._id);
      this.notify.openSucessSnackBar('Report deleted');
      this.router.navigate(['/medical/records']);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not delete');
    }
  }

  // ── Visit form ──

  newVisit(): void {
    this.editingVisitId = null;
    this.form = emptyVisit();
    if (this.sosMessage) {
      this.form.complaint = `SOS: ${this.sosMessage}`.slice(0, 500);
      this.sosMessage = null;
    }
  }

  editVisit(v: MedicalVisit): void {
    this.editingVisitId = v._id;
    this.form = {
      atLocal: toLocalInput(v.at), followUpAtLocal: toLocalInput(v.followUp?.at || null),
      alsoAttended: v.alsoAttended, complaint: v.complaint, diagnosis: v.diagnosis, notes: v.notes, hospital: v.hospital,
      medicines: v.medicines.length ? v.medicines.map(m => ({ ...m })) : [{ name: '', dose: '', qty: '' }],
      vitals: { ...v.vitals }, severity: v.severity, outcome: v.outcome,
      followUp: { needed: !!v.followUp?.needed, at: v.followUp?.at || null, note: v.followUp?.note || '', done: !!v.followUp?.done }
    };
    setTimeout(() => document.getElementById('md-visit-form')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  cancelForm(): void {
    this.form = null;
    this.editingVisitId = null;
  }

  addMedicine(): void {
    if (this.form && this.form.medicines.length < 20) this.form.medicines.push({ name: '', dose: '', qty: '' });
  }

  removeMedicine(i: number): void {
    this.form?.medicines.splice(i, 1);
    if (this.form && !this.form.medicines.length) this.addMedicine();
  }

  suggest(q: string): void {
    clearTimeout(this.suggestTimer);
    const ev = this.report?.event?._id;
    if (!ev || q.trim().length < 1) return;
    this.suggestTimer = setTimeout(async () => {
      try { this.suggestions = (await this.medical.medicines(ev, q.trim())).medicines; } catch { /* suggestions are optional */ }
    }, 250);
  }

  get needsHospital(): boolean { return this.form?.outcome === 'referred' || this.form?.outcome === 'ambulance'; }
  get formReady(): boolean { return !!this.form && !!this.form.complaint.trim() && !!this.form.severity && !!this.form.outcome; }

  async saveVisit(): Promise<void> {
    if (!this.form || !this.patient || !this.formReady || this.saving) return;
    const f = this.form;
    const data: VisitInput = {
      at: fromLocalInput(f.atLocal) || undefined,
      alsoAttended: f.alsoAttended.trim(), complaint: f.complaint.trim(), diagnosis: f.diagnosis.trim(), notes: f.notes.trim(),
      hospital: this.needsHospital ? f.hospital.trim() : '',
      medicines: f.medicines.filter((m: Medicine) => m.name.trim()).map(m => ({ name: m.name.trim(), dose: m.dose.trim(), qty: String(m.qty || '').trim() })),
      vitals: {
        temperature: numOrNull(f.vitals.temperature), pulse: numOrNull(f.vitals.pulse),
        bpSys: numOrNull(f.vitals.bpSys), bpDia: numOrNull(f.vitals.bpDia), spo2: numOrNull(f.vitals.spo2)
      },
      severity: f.severity, outcome: f.outcome,
      followUp: { needed: f.followUp.needed, at: f.followUp.needed ? fromLocalInput(f.followUpAtLocal) : null, note: f.followUp.note.trim(), done: f.followUp.done }
    };
    this.saving = true;
    try {
      const res = this.editingVisitId
        ? await this.medical.updateVisit(this.editingVisitId, data)
        : await this.medical.addVisit(this.patient._id, data);
      this.applyVisit(res.visit, res.patient);
      this.notify.openSucessSnackBar(this.editingVisitId ? 'Visit updated' : 'Visit recorded');
      this.cancelForm();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not save the visit');
    } finally {
      this.saving = false;
    }
  }

  private applyVisit(visit: MedicalVisit, patient: MedicalPatient): void {
    const others = this.visits.filter(v => v._id !== visit._id);
    const visits = [...others, visit].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    this.report = { ...this.report!, patient, visits };
    this.rebuildWarnings();
  }

  // ── Visit actions ──

  async markLeft(v: MedicalVisit): Promise<void> {
    try {
      const res = await this.medical.markLeft(v._id);
      this.applyVisit(res.visit, res.patient);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not save');
    }
  }

  async followUpDone(v: MedicalVisit): Promise<void> {
    try {
      const res = await this.medical.followUpDone(v._id);
      this.applyVisit(res.visit, res.patient);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not save');
    }
  }

  async deleteVisit(v: MedicalVisit): Promise<void> {
    const ok = await firstValueFrom(this.confirmation.confirm({
      title: 'Delete this visit?', danger: true, confirmText: 'Delete visit',
      message: `The visit of ${new Date(v.at).toLocaleString()} (${v.complaint}) will be deleted. This can't be undone.`
    }));
    if (!ok) return;
    try {
      const res = await this.medical.deleteVisit(v._id);
      this.report = { ...this.report!, patient: res.patient, visits: this.visits.filter(x => x._id !== v._id) };
      this.rebuildWarnings();
      this.notify.openSucessSnackBar('Visit deleted');
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not delete');
    }
  }

  // ── Email the report ──

  /** Last 6 digits of the patient's phone (the PDF password), or null. */
  get phoneTail(): string | null {
    const d = String(this.patient?.phone || '').replace(/\D/g, '');
    return d.length >= 6 ? d.slice(-6) : null;
  }

  async openEmail(): Promise<void> {
    this.emailTo = this.patient?.email || '';
    this.ownPassword = !this.phoneTail;
    this.emailPassword = '';
    this.panel = 'email';
    try { this.safeMode = !!(await this.medical.access()).safeMode; } catch { /* the server says it anyway */ }
  }

  get emailReady(): boolean {
    const okTo = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.emailTo.trim());
    const okPw = this.ownPassword ? this.emailPassword.length >= 6 : !!this.phoneTail;
    return okTo && okPw && (!this.safeMode || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.tester.trim())) && !this.sending;
  }

  async sendEmail(): Promise<void> {
    if (!this.patient || !this.emailReady) return;
    this.sending = true;
    try {
      const res = await this.medical.emailReport(this.patient._id, {
        to: this.emailTo.trim(),
        password: this.ownPassword ? this.emailPassword : undefined,
        testRecipient: this.safeMode ? this.tester.trim() : undefined
      });
      this.closePanel();
      this.emailPassword = '';
      this.notify.openSucessSnackBar(res.redirectedTo ? `Test mode: report sent to ${res.redirectedTo}` : `Report sent to ${res.to}. Tell them the password in person or by phone.`);
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || err?.error?.errors?.[0]?.msg || 'Could not send the report');
    } finally {
      this.sending = false;
    }
  }

  get panelOpen(): boolean { return this.panel !== null; }

  closePanel(): void {
    this.panel = null;
    this.header = null;
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.panelOpen) this.closePanel();
  }

  async openAudit(): Promise<void> {
    this.audit = null;
    this.panel = 'audit';
    const ev = this.report?.event?._id;
    if (!ev || !this.patient) return;
    try {
      this.audit = (await this.medical.audit(ev, this.patient._id)).entries;
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || 'Could not load the audit log');
    }
  }

  warn(v: MedicalVisit, key: keyof Vitals): boolean { return !!this.warnings.get(v._id)?.has(key); }
  hasVitals(v: MedicalVisit): boolean { return !!v.vitals && Object.values(v.vitals).some(x => x !== null && x !== undefined); }
  pickSeverity(s: any): void { if (this.form) this.form.severity = s; }
  pickOutcome(o: Outcome): void { if (this.form) this.form.outcome = o; }

  trackVisit = (_: number, v: MedicalVisit) => v._id;
  trackIndex = (i: number) => i;
  trackEntry = (_: number, e: AuditEntry) => e._id;
}
