import { EmailDeliveryStatus, EmailLogEntry } from '../../models/email.model';

// Delivery status (from Brevo's webhook) — labels/badges shared by the
// booking Email history and the Email Report page.

const DELIVERY_LABELS: Record<EmailDeliveryStatus, string> = {
  deferred: 'Delayed',
  delivered: 'Delivered',
  spam: 'Marked spam',
  bounced: 'Bounced',
  blocked: 'Blocked',
  invalid: 'Invalid address',
  error: 'Delivery error'
};

const DELIVERY_BADGES: Record<EmailDeliveryStatus, string> = {
  deferred: 'ba',
  delivered: 'bg',
  spam: 'br',
  bounced: 'br',
  blocked: 'br',
  invalid: 'br',
  error: 'br'
};

/** The delivery status worth showing, or null (not sent / nothing heard yet). */
export function deliveryStatus(e: EmailLogEntry): EmailDeliveryStatus | null {
  return e.status === 'sent' ? (e.delivery?.status || null) : null;
}

export function deliveryLabel(status: EmailDeliveryStatus): string {
  return DELIVERY_LABELS[status] || status;
}

export function deliveryBadge(status: EmailDeliveryStatus): string {
  return DELIVERY_BADGES[status] || 'bx';
}

/** Reason worth showing under a bad outcome (bounce message etc.). */
export function deliveryProblem(e: EmailLogEntry): string {
  const status = deliveryStatus(e);
  if (!status || status === 'delivered') return '';
  return e.delivery?.reason || '';
}
