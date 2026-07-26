import { Shopcart, Ticket } from '../models/ticket.model';

// Same list used across ticket.js/boxOffice.js/tenting.js on the backend —
// kept in sync manually, matching how the backend already repeats this list.
export const FESTIVAL_PASS_NAMES = ['Festival Ticket', 'Weekend pass', 'Day Pass'];

// Same item_name options as the old BoxOfficeComponent's "Register Participant"
// shopcart dropdown (box-office.component.html) — reused as-is for Spot Registration.
export const ALL_ITEM_NAMES = [
    'Festival Ticket',
    'Weekend pass',
    'Day Pass',
    'PYOT (Pitch Your Own Tent)',
    'Shared Tent',
    'Solo Tent',
    'Family Tent',
    'Glamping Tent For 1 Person.',
    'Glamping Tent with Private Washroom.',
    'Deluxe room near Shoolagiri',
    'Car/Caravan Pass',
    'Ola electric scooter',
];

/** True for Festival Ticket/Weekend pass/Day Pass items, false for Tent Pass items. */
export function isFestivalPass(itemName: string): boolean {
    return FESTIVAL_PASS_NAMES.includes(itemName);
}

// Spot Registration has no dedicated "source" field on Ticket — instead the backend
// (see boxOffice.js's /createTicket) auto-generates transaction_id as `SPOT-<timestamp>`
// whenever a walk-in registration omits one. That prefix doubles as the source marker,
// avoiding a schema migration for a field that's otherwise unused elsewhere.
export function isSpotRegistration(ticket: Ticket): boolean {
    return !!ticket.transaction_id?.startsWith('SPOT-');
}

function groupPasses(shopcart: Shopcart[] | undefined): { name: string; count: number }[] {
    if (!shopcart?.length) {
        return [];
    }
    const counts = new Map<string, number>();
    shopcart.forEach(item => counts.set(item.item_name, (counts.get(item.item_name) ?? 0) + 1));
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
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
    return groupPasses(shopcart).map(({ name, count }) => ({
        label: count > 1 ? `${name} ×${count}` : name,
        festival: isFestivalPass(name)
    }));
}
