// Email epic (see EMAIL_CONTEXT.md) — shapes returned by big-api's /emails routes.

export type EmailType = 'ticket' | 'custom' | 'test';
export type EmailLogStatus = 'queued' | 'sending' | 'sent' | 'failed' | 'skipped';
export type TicketEmailMode = 'unsent' | 'all';
/** What Brevo reported after sending (webhook). Null = nothing heard yet. */
export type EmailDeliveryStatus = 'deferred' | 'delivered' | 'spam' | 'bounced' | 'blocked' | 'invalid' | 'error';

export interface EmailDelivery {
  status: EmailDeliveryStatus | null;
  reason?: string | null;
  statusAt?: string | null;
  deliveredAt?: string | null;
  /** Approximate: Apple Mail pre-loads images; some apps block them. */
  firstOpenedAt?: string | null;
  openCount?: number;
  firstClickedAt?: string | null;
  clickCount?: number;
  lastEventAt?: string | null;
  /** Only on the single-email endpoint. */
  events?: { event: string; at: string; reason?: string | null }[];
}

/** GET /emails/config. Only the four access flags are present for people who can't send. */
export interface EmailConfig {
  /** Can send at least one kind of email (Ticket Email). */
  canSend: boolean;
  /** DEV/DIR/ADMIN, a Box Office TL, or anyone with Box Office Manage. */
  canSendTicket?: boolean;
  /** DEV/DIR/ADMIN only. */
  canSendCustom?: boolean;
  /** Admin > Email Report — DEV/DIR/ADMIN only. */
  canViewReport?: boolean;
  /** Test mode: every email goes only to a tester address typed when sending. */
  safeMode?: boolean;
  dailyCap?: number;
  usedToday?: number;
  remainingToday?: number | null;
  from?: string;
  placeholders?: string[];
}

/** Progress of a background send. */
export interface EmailBatch {
  id: string;
  type: 'ticket' | 'custom';
  total: number;
  done: number;
  sent: number;
  failed: number;
  skipped: number;
  finished: boolean;
  startedAt: string;
  finishedAt: string | null;
}

export interface EmailLogEntry {
  _id: string;
  type: EmailType;
  status: EmailLogStatus;
  event?: { _id: string; name: string } | string | null;
  ticket?: string | null;
  orderId?: number | null;
  recipientName?: string;
  to: string;
  redirectedTo?: string | null;
  subject: string;
  /** Only on the single-email endpoint (custom/test emails). */
  body?: string | null;
  includeTicket?: boolean;
  sentBy?: { _id: string; name: string; email?: string } | string;
  batchId?: string | null;
  error?: string | null;
  sentAt?: string | null;
  createdAt: string;
  delivery?: EmailDelivery | null;
}

export interface EmailLogPage {
  items: EmailLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  /** Ignores the status/delivery filters (those are the report's cards). */
  summary: {
    byStatus: Partial<Record<EmailLogStatus, number>>;
    byType: Partial<Record<EmailType, number>>;
    /** Sent emails by delivery outcome; 'none' = nothing heard back; 'bounced' = bounced+blocked+invalid. */
    byDelivery?: Partial<Record<EmailDeliveryStatus | 'none', number>>;
    opened?: number;
  };
  /** Everyone who has ever sent, for the "Sent by" filter. */
  senders?: { _id: string; name: string }[];
}

export interface EmailLogQuery {
  type?: EmailType | '';
  status?: EmailLogStatus | '';
  event?: string;
  sentBy?: string;
  ticket?: string;
  /** 'bounced' covers bounced/blocked/invalid; 'opened' and 'none' (nothing heard back) are report views. */
  delivery?: EmailDeliveryFilter | '';
  from?: string;
  to?: string;
  q?: string;
  page?: number;
  pageSize?: number;
}

export type EmailDeliveryFilter = 'delivered' | 'bounced' | 'deferred' | 'spam' | 'error' | 'opened' | 'none';

export interface EmailPreview {
  to: string;
  subject: string;
  html: string;
}

export interface CustomEmailContent {
  subject: string;
  bodyHtml: string;
  includeTicket: boolean;
}
