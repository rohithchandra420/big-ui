import { Component, ElementRef, Inject, ViewChild } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

import { Ticket } from '../../../models/ticket.model';
import { CustomEmailContent, EmailBatch, EmailConfig } from '../../../models/email.model';
import { EmailService } from '../../../core/email.service';
import { NotificationService } from '../../../core/notification.service';
import { RichTextEditorComponent } from '../../../shared/rich-text-editor/rich-text-editor.component';
import { isValidEmail, recallTester, rememberTester } from '../email-tester';

export interface CustomEmailDialogData {
  tickets: Ticket[];
  config: EmailConfig;
}

const DEFAULT_PLACEHOLDERS = ['name', 'first_name', 'last_name', 'order_id', 'event'];

/**
 * Write and send a custom email to the selected bookings (Email epic).
 * Banner and footer are added by the server; {placeholders} are filled per
 * recipient; optionally the booking's ticket details + QR are appended.
 * Doesn't touch the Ticket Email status. Closes with the started batch.
 */
@Component({
  selector: 'app-custom-email-dialog',
  templateUrl: './custom-email-dialog.component.html',
  styleUrls: ['../email-dialog.css', './custom-email-dialog.component.css']
})
export class CustomEmailDialogComponent {

  @ViewChild(RichTextEditorComponent) editor?: RichTextEditorComponent;
  @ViewChild('subjectInput') subjectInput?: ElementRef<HTMLInputElement>;

  tab: 'write' | 'preview' = 'write';
  subject = '';
  bodyHtml = '';
  includeTicket = false;
  tester = recallTester();

  sending = false;
  testing = false;
  previewing = false;
  previewHtml: SafeHtml | null = null;
  previewSubject = '';
  previewTo = '';
  error = '';

  /** Where the last placeholder chip click should insert. */
  private lastFocus: 'subject' | 'body' = 'body';

  readonly recipients: Ticket[];
  readonly noEmail: Ticket[];
  readonly placeholders: string[];

  constructor(
    public dialogRef: MatDialogRef<CustomEmailDialogComponent, EmailBatch>,
    @Inject(MAT_DIALOG_DATA) public data: CustomEmailDialogData,
    private emailService: EmailService,
    private notificationService: NotificationService,
    private sanitizer: DomSanitizer
  ) {
    this.recipients = data.tickets.filter(t => isValidEmail(t.email));
    this.noEmail = data.tickets.filter(t => !isValidEmail(t.email));
    this.placeholders = data.config.placeholders?.length ? data.config.placeholders : DEFAULT_PLACEHOLDERS;
  }

  get safeMode(): boolean {
    return !!this.data.config.safeMode;
  }

  get remaining(): number | null {
    const r = this.data.config.remainingToday;
    return r === undefined ? null : r;
  }

  get overCap(): boolean {
    return this.remaining !== null && this.recipients.length > this.remaining;
  }

  get hasMessage(): boolean {
    return this.bodyHtml.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
  }

  get contentValid(): boolean {
    return this.subject.trim().length > 0 && this.subject.length <= 200 && this.hasMessage;
  }

  get testerValid(): boolean {
    return !this.safeMode || isValidEmail(this.tester);
  }

  get canSend(): boolean {
    return this.contentValid && this.recipients.length > 0 && this.testerValid && !this.overCap && !this.sending;
  }

  get sampleTicket(): Ticket | undefined {
    return this.recipients[0] || this.data.tickets[0];
  }

  private content(): CustomEmailContent {
    return { subject: this.subject.trim(), bodyHtml: this.bodyHtml, includeTicket: this.includeTicket };
  }

  // ── Placeholders ──────────────────────────────────────

  focus(target: 'subject' | 'body') {
    this.lastFocus = target;
  }

  insertPlaceholder(name: string) {
    const token = `{${name}}`;
    if (this.lastFocus === 'subject' && this.subjectInput) {
      const input = this.subjectInput.nativeElement;
      const start = input.selectionStart ?? this.subject.length;
      const end = input.selectionEnd ?? this.subject.length;
      this.subject = this.subject.slice(0, start) + token + this.subject.slice(end);
      setTimeout(() => {
        input.focus();
        input.setSelectionRange(start + token.length, start + token.length);
      });
    } else {
      this.editor?.insertText(token);
    }
  }

  // ── Preview / test / send ─────────────────────────────

  showPreview() {
    this.tab = 'preview';
    const ticket = this.sampleTicket;
    if (!ticket?._id) return;
    this.previewing = true;
    this.previewHtml = null;
    this.emailService.preview('custom', ticket._id, this.content()).subscribe({
      next: p => {
        this.previewing = false;
        this.previewSubject = p.subject;
        this.previewTo = p.to;
        // Server-built and server-sanitized; shown in a sandboxed iframe (no scripts).
        this.previewHtml = this.sanitizer.bypassSecurityTrustHtml(p.html);
      },
      error: err => {
        this.previewing = false;
        this.error = err?.error?.message || 'Could not build the preview';
      }
    });
  }

  sendTest() {
    const ticket = this.sampleTicket;
    if (!ticket?._id || !this.contentValid || this.testing) return;
    this.testing = true;
    this.emailService.sendTest('custom', ticket._id, this.content()).subscribe({
      next: res => {
        this.testing = false;
        this.notificationService.openSucessSnackBar(`Test email sent to ${res.to}`);
      },
      error: err => {
        this.testing = false;
        this.notificationService.openErrorSnackBar(err?.error?.message || 'Could not send the test email');
      }
    });
  }

  send() {
    if (!this.canSend) return;
    this.sending = true;
    this.error = '';
    if (this.safeMode) rememberTester(this.tester);
    const ids = this.data.tickets.map(t => t._id!).filter(Boolean);
    this.emailService.sendCustomEmails(ids, this.content(), this.safeMode ? this.tester.trim() : undefined).subscribe({
      next: batch => this.dialogRef.close(batch),
      error: err => {
        this.sending = false;
        this.error = err?.error?.message || 'Could not start sending. Please try again.';
      }
    });
  }

  cancel() {
    this.dialogRef.close();
  }
}
