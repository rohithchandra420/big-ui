import { Shopcart, Ticket } from '../models/ticket.model';

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
