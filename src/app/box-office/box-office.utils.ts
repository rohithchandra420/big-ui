import { Shopcart, Ticket, TicketEmailStatus } from '../models/ticket.model';

// Introducing Events (see INTRODUCING_EVENTS_CONTEXT.md) — replaces the old
// hardcoded FESTIVAL_PASS_NAMES/ALL_ITEM_NAMES lists. Which passes exist and
// what category they belong to is now data (PassType, via EventService),
// not code. isFestivalPass() below reads item.category, set by the backend
// on every ShopCart item created through the current Box Office flow.
//
// Falls back to the old FESTIVAL_PASS_NAMES name-match only when category
// is missing — covers ShopCart items created through the legacy Tickets
// module (ticket.js/excelUpload.js, deliberately left untouched, decision
// #3), which never gets category populated. Remove this fallback once that
// legacy path is ever retired.
const LEGACY_FESTIVAL_PASS_NAMES = ['Festival Ticket', 'Weekend pass', 'Day Pass'];

/** True for Festival Pass items (category 'festival'), false for Tent/addon items. */
export function isFestivalPass(item: Pick<Shopcart, 'category' | 'item_name'>): boolean {
    if (item.category) return item.category === 'festival';
    return LEGACY_FESTIVAL_PASS_NAMES.includes(item.item_name);
}

// Spot Registration has no dedicated "source" field on Ticket — instead the backend
// (see boxOffice.js's /createTicket) auto-generates transaction_id as `SPOT-<timestamp>`
// whenever a walk-in registration omits one. That prefix doubles as the source marker,
// avoiding a schema migration for a field that's otherwise unused elsewhere.
export function isSpotRegistration(ticket: Ticket): boolean {
    return !!ticket.transaction_id?.startsWith('SPOT-');
}

// Display name for a pass item — passTypeName (new Box Office flow) with a
// fallback to item_name (legacy Tickets module items).
function displayName(item: Shopcart): string {
    return item.passTypeName || item.item_name;
}

function groupPasses(shopcart: Shopcart[] | undefined): { name: string; festival: boolean; count: number }[] {
    if (!shopcart?.length) {
        return [];
    }
    const counts = new Map<string, { festival: boolean; count: number }>();
    shopcart.forEach(item => {
        const name = displayName(item);
        const existing = counts.get(name);
        counts.set(name, { festival: isFestivalPass(item), count: (existing?.count ?? 0) + 1 });
    });
    return Array.from(counts.entries()).map(([name, { festival, count }]) => ({ name, festival, count }));
}

/** Groups shopcart item names with counts, e.g. ["Festival Ticket", "Camping ×2"]. */
export function passChips(shopcart: Shopcart[] | undefined): string[] {
    return groupPasses(shopcart).map(({ name, count }) => count > 1 ? `${name} ×${count}` : name);
}

/** Same grouping as passChips(), joined into one line, e.g. "Festival Ticket, Camping ×2". */
export function passSummary(shopcart: Shopcart[] | undefined): string {
    const chips = passChips(shopcart);
    return chips.length ? chips.join(', ') : '—';
}

export interface PassChip {
    label: string;
    festival: boolean;
}

/** Same grouping as passChips(), tagged with pass type so callers can color/icon the chip by type. */
export function passChipsTyped(shopcart: Shopcart[] | undefined): PassChip[] {
    return groupPasses(shopcart).map(({ name, count, festival }) => ({
        label: count > 1 ? `${name} ×${count}` : name,
        festival
    }));
}

// ── Ticket Email status (Email epic, see EMAIL_CONTEXT.md) ──────────────

const TICKET_EMAIL_LABELS: Record<TicketEmailStatus, string> = {
    not_sent: 'Not sent',
    sending: 'Sending…',
    sent: 'Sent',
    // Set by the Brevo webhook: the address doesn't work (hard bounce/blocked/invalid)
    bounced: 'Bounced',
    failed: 'Failed',
    no_email: 'No email'
};

const TICKET_EMAIL_BADGES: Record<TicketEmailStatus, string> = {
    not_sent: 'bx',
    sending: 'bb',
    sent: 'bg',
    bounced: 'br',
    failed: 'br',
    no_email: 'ba'
};

/** Fixed order for the Bookings "Ticket Email" filter. A constant list — never
 *  rebuild it in a getter (see the *ngFor / <app-option> identity rule). */
export const TICKET_EMAIL_FILTER_OPTIONS: { value: TicketEmailStatus; label: string }[] =
    (['not_sent', 'sending', 'sent', 'bounced', 'failed', 'no_email'] as TicketEmailStatus[])
        .map(value => ({ value, label: TICKET_EMAIL_LABELS[value] }));

/** A booking's Ticket Email status; anything missing reads as not sent. */
export function ticketEmailStatus(ticket: Pick<Ticket, 'ticketEmail'> | null | undefined): TicketEmailStatus {
    return ticket?.ticketEmail?.status || 'not_sent';
}

export function ticketEmailLabel(status: TicketEmailStatus): string {
    return TICKET_EMAIL_LABELS[status] || TICKET_EMAIL_LABELS.not_sent;
}

/** Global .badge colour class for a status. */
export function ticketEmailBadge(status: TicketEmailStatus): string {
    return TICKET_EMAIL_BADGES[status] || 'bx';
}

/**
 * Gate lookups (Look Up, QR scan): turns a failed request into a message that
 * says what actually went wrong, so staff can tell "no such booking" apart
 * from "no internet" or "server problem". A specific reason from big-api
 * (e.g. "This QR code is not valid") wins for 4xx responses.
 */
export function lookupErrorMessage(err: any, fallback: string): string {
  const status = err?.status;
  if (status === 0) return 'Could not reach the server. Check the internet connection and try again.';
  if (status === 401) return 'Your session has expired. Please sign in again.';
  if (status === 403) return 'You do not have access to look up bookings.';
  if (status >= 500) return 'The server ran into a problem. Please try again in a moment.';
  const body = err?.error;
  if (typeof body?.message === 'string' && body.message) return body.message;
  if (Array.isArray(body?.errors) && body.errors[0]?.msg) return body.errors[0].msg;
  return fallback;
}
