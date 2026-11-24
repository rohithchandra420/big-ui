import { EarlyCheckinStatus, Shopcart, Ticket, TicketEmailStatus, TicketKind } from '../models/ticket.model';
import { FESTIVAL, STAY, ADDON } from '../core/pass-categories';

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

/** True for Festival Pass items (category FESTIVAL), false for Tent/addon items. */
export function isFestivalPass(item: Pick<Shopcart, 'category' | 'item_name'>): boolean {
    if (item.category) return item.category === FESTIVAL;
    return LEGACY_FESTIVAL_PASS_NAMES.includes(item.item_name);
}

/** A Tent Pass (takes beds). An add-on never is; a legacy pass with no category is when it isn't a Festival Pass. */
export function isTentPass(item: Pick<Shopcart, 'category' | 'item_name'>): boolean {
    if (item.category) return item.category === STAY;
    return !isFestivalPass(item);
}

// ── Early Check-In (EC1, see EARLY_CHECKIN_CONTEXT.md) ──

/** The details every Festival Pass must have. The ONE list in the app: the
 *  Bookings "Festival details" count uses it now, the Early Check-In form
 *  (EC3) will too. Add a field here and both follow.
 *  KEEP IN STEP with big-api `utils/festivalDetails.js` (it picks which
 *  bookings get the Early Check-In email). */
export const FESTIVAL_DETAIL_FIELDS = ['name', 'phone_no', 'email', 'gender'] as const;

export type FestivalDetailField = typeof FESTIVAL_DETAIL_FIELDS[number];

/** True when a pass has every field of FESTIVAL_DETAIL_FIELDS filled. */
export function festivalDetailsFilled(item: Partial<Pick<Shopcart, FestivalDetailField>>): boolean {
    return FESTIVAL_DETAIL_FIELDS.every(f => {
        const v = item[f];
        return v !== null && v !== undefined && String(v).trim() !== '';
    });
}

export interface FestivalDetailsCount {
    /** Active Festival Passes with every detail filled. */
    filled: number;
    /** Active Festival Passes in the booking. */
    total: number;
}

/** "2 / 4": how many of a booking's active Festival Passes have every detail filled.
 *  A switched-off pass (isActive false) is not counted. */
export function festivalDetailsCount(ticket: Pick<Ticket, 'shopcart'> | null | undefined): FestivalDetailsCount {
    const passes = (ticket?.shopcart || []).filter(i => i.isActive !== false && isFestivalPass(i));
    return { filled: passes.filter(festivalDetailsFilled).length, total: passes.length };
}

/** The booking has at least one active Festival Pass with a detail missing. */
export function festivalDetailsMissing(ticket: Pick<Ticket, 'shopcart'> | null | undefined): boolean {
    const c = festivalDetailsCount(ticket);
    return c.filled < c.total;
}

// ── Early Check-In email (EC2) ──

/** What the Bookings "Early Check-In" column shows: the stored status, plus
 *  'expired' = sent, link end date passed, not submitted. */
export type EarlyCheckinView = EarlyCheckinStatus | 'expired';

const EARLY_CHECKIN_LABELS: Record<EarlyCheckinView, string> = {
    not_sent: 'Not sent',
    sending: 'Sending…',
    sent: 'Sent',
    submitted: 'Submitted',
    expired: 'Expired',
    failed: 'Failed',
    no_email: 'No email'
};

const EARLY_CHECKIN_BADGES: Record<EarlyCheckinView, string> = {
    not_sent: 'bx',
    sending: 'bb',
    sent: 'bb',
    submitted: 'bg',
    expired: 'ba',
    failed: 'br',
    no_email: 'ba'
};

/** Fixed order for the Bookings "Early Check-In" filter (a constant list, see the *ngFor rule). */
export const EARLY_CHECKIN_FILTER_OPTIONS: { value: EarlyCheckinView; label: string }[] =
    (['not_sent', 'sending', 'sent', 'submitted', 'expired', 'failed', 'no_email'] as EarlyCheckinView[])
        .map(value => ({ value, label: EARLY_CHECKIN_LABELS[value] }));

/** A booking's Early Check-In status; missing reads as not sent. `now` for tests. */
export function earlyCheckinStatus(ticket: Pick<Ticket, 'earlyCheckin'> | null | undefined, now = Date.now()): EarlyCheckinView {
    const ec = ticket?.earlyCheckin;
    const status = ec?.status || 'not_sent';
    if (status === 'sent' && ec?.expiresAt && new Date(ec.expiresAt).getTime() < now) return 'expired';
    return status;
}

export function earlyCheckinLabel(status: EarlyCheckinView): string {
    return EARLY_CHECKIN_LABELS[status] || EARLY_CHECKIN_LABELS.not_sent;
}

export function earlyCheckinBadge(status: EarlyCheckinView): string {
    return EARLY_CHECKIN_BADGES[status] || 'bx';
}

// Spot Registration has no dedicated "source" field on Ticket — instead the backend
// (see boxOffice.js's /createTicket) auto-generates transaction_id as `SPOT-<timestamp>`
// whenever a walk-in registration omits one. That prefix doubles as the source marker,
// avoiding a schema migration for a field that's otherwise unused elsewhere.
export function isSpotRegistration(ticket: Ticket): boolean {
    return !!ticket.transaction_id?.startsWith('SPOT-');
}

// ── External Booking Import (I2) ──

/** Booking ID: the sales system's reference, else the order number. */
export function bookingIdOf(ticket: Pick<Ticket, 'reference' | 'order_id'> | null | undefined): string {
    if (!ticket) return '';
    return ticket.reference || String(ticket.order_id ?? '');
}

const PAYMENT_METHOD_LABELS: Record<TicketKind, string> = { online: 'Online', offline: 'Offline', guest_list: 'Guest list' };

/** "Online" / "Offline" / "Guest list" for an imported booking; '' otherwise. */
export function paymentMethodLabel(ticket: Pick<Ticket, 'kind'> | null | undefined): string {
    return ticket?.kind ? (PAYMENT_METHOD_LABELS[ticket.kind] || '') : '';
}

/** Where a booking came from (I6): the sales system import, a Spot Registration, else Bulk Upload. */
export function bookingSourceLabel(ticket: Pick<Ticket, 'source' | 'transaction_id'> | null | undefined): string {
    if (!ticket) return '';
    if (ticket.source === 'external') return 'Sales system';
    return isSpotRegistration(ticket as Ticket) ? 'Spot registration' : 'Bulk Upload';
}

const EXTRA_BED = /extra[\s_-]*bed/i;

/** The booking has an "Extra bed" add-on (no bed of its own: shown as a tag on its Tent Pass). */
export function hasExtraBed(ticket: Pick<Ticket, 'shopcart'> | null | undefined): boolean {
    return (ticket?.shopcart || []).some(i => i.category === ADDON && i.isActive !== false
        && (EXTRA_BED.test(i.passTypeName || i.item_name || '') || EXTRA_BED.test(i.externalCode || '')));
}

// Display name for a pass item — passTypeName (new Box Office flow) with a
// fallback to item_name (legacy Tickets module items).
function displayName(item: Shopcart): string {
    return item.passTypeName || item.item_name;
}

/** The pass name to show for one pass item (same rule as the Passes column). */
export function passDisplayName(item: Pick<Shopcart, 'passTypeName' | 'item_name'>): string {
    return item.passTypeName || item.item_name || '';
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

// ── Beds vs people (2026-11-24) ──

/** One group of linked bookings: the booking, every booking it links to and
 *  every booking linking to it (followed through chains). The same group,
 *  and so the same totals, belongs to every booking in it. */
export interface BedGroup {
    /** Active Festival Passes in the group. */
    people: number;
    /** Beds of the active Stay Passes in the group (an add-on adds none). */
    beds: number;
    /** Booking IDs of the bookings in the group, this one included. */
    bookingIds: string[];
    /** Linked references not found among the event's bookings (not in BiG yet). */
    missingRefs: string[];
}

/** Group totals per booking _id. Links are matched by the sales system
 *  reference (`linkedReferences` -> `reference`), both ways. Passes switched
 *  off (isActive false) are left out. */
export function bedGroups(bookings: Ticket[]): Map<string, BedGroup> {
    const { rootOf, missing } = linkRoots(bookings);
    const groups = new Map<string, BedGroup>();
    bookings.forEach(b => {
        const root = rootOf.get(b._id)!;
        let g = groups.get(root);
        if (!g) { g = { people: 0, beds: 0, bookingIds: [], missingRefs: [] }; groups.set(root, g); }
        for (const i of b.shopcart || []) {
            if (!i || i.isActive === false) continue;
            if (isFestivalPass(i)) g.people++;
            else if (isTentPass(i)) g.beds += i.beds || 1;
        }
        g.bookingIds.push(bookingIdOf(b));
        missing.get(b._id)?.forEach(ref => { if (!g!.missingRefs.includes(ref)) g!.missingRefs.push(ref); });
    });
    const out = new Map<string, BedGroup>();
    bookings.forEach(b => out.set(b._id, groups.get(rootOf.get(b._id)!)!));
    return out;
}

/** Linked-booking groups: each booking _id -> its group's root _id, plus the
 *  linked references not found among the bookings (per booking). Links match
 *  `linkedReferences` -> `reference`, both ways, through chains. */
export function linkRoots(bookings: Ticket[]): { rootOf: Map<string, string>; missing: Map<string, Set<string>> } {
    const byRef = new Map<string, Ticket>();
    bookings.forEach(b => { if (b.reference) byRef.set(b.reference, b); });
    const parent = new Map<string, string>();
    const find = (id: string): string => {
        let r = id;
        while (parent.get(r) !== r) r = parent.get(r)!;
        let c = id;
        while (parent.get(c) !== r) { const n = parent.get(c)!; parent.set(c, r); c = n; }
        return r;
    };
    bookings.forEach(b => parent.set(b._id, b._id));
    const missing = new Map<string, Set<string>>();
    bookings.forEach(b => (b.linkedReferences || []).forEach(ref => {
        const target = byRef.get(ref);
        if (!target || target._id === b._id) {
            if (!target) { if (!missing.has(b._id)) missing.set(b._id, new Set()); missing.get(b._id)!.add(ref); }
            return;
        }
        const a = find(b._id), t = find(target._id);
        if (a !== t) parent.set(a, t);
    }));
    const rootOf = new Map<string, string>();
    bookings.forEach(b => rootOf.set(b._id, find(b._id)));
    return { rootOf, missing };
}

/** B-083: per booking _id, the pass type ids held by it AND its linked
 *  bookings (switched-off passes included, like the Passes column). */
export function groupPassTypes(bookings: Ticket[]): Map<string, Set<string>> {
    const { rootOf } = linkRoots(bookings);
    const byRoot = new Map<string, Set<string>>();
    bookings.forEach(b => {
        const root = rootOf.get(b._id)!;
        if (!byRoot.has(root)) byRoot.set(root, new Set());
        const set = byRoot.get(root)!;
        for (const i of b.shopcart || []) if (i?.passType) set.add(String(i.passType));
    });
    const out = new Map<string, Set<string>>();
    bookings.forEach(b => out.set(b._id, byRoot.get(rootOf.get(b._id)!)!));
    return out;
}

/** People and beds differ (either way). A group with no passes at all never does. */
export function bedsMismatch(g: BedGroup | null | undefined): boolean {
    return !!g && g.people !== g.beds;
}
