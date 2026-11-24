import { isFestivalPass, isSpotRegistration, passChips, passChipsTyped, passSummary, ticketEmailStatus, ticketEmailLabel, ticketEmailBadge, lookupErrorMessage, bookingIdOf, paymentMethodLabel, hasExtraBed, FESTIVAL_DETAIL_FIELDS, festivalDetailsFilled, festivalDetailsCount, festivalDetailsMissing, earlyCheckinStatus, earlyCheckinLabel, earlyCheckinBadge, EARLY_CHECKIN_FILTER_OPTIONS, bedGroups, bedsMismatch, groupPassTypes, linkRoots } from './box-office.utils';
import { Shopcart, Ticket } from '../models/ticket.model';

describe('box-office.utils', () => {
  describe('External Booking Import helpers', () => {
    it('bookingIdOf() gives the reference, else the order number', () => {
      expect(bookingIdOf({ reference: 'TST4-ABCD', order_id: null as any })).toBe('TST4-ABCD');
      expect(bookingIdOf({ order_id: 812 } as Ticket)).toBe('812');
      expect(bookingIdOf({ order_id: null as any } as Ticket)).toBe('');
      expect(bookingIdOf(null)).toBe('');
    });

    it('paymentMethodLabel() names the payment method of imported bookings only', () => {
      expect(paymentMethodLabel({ kind: 'online' })).toBe('Online');
      expect(paymentMethodLabel({ kind: 'offline' })).toBe('Offline');
      expect(paymentMethodLabel({ kind: 'guest_list' })).toBe('Guest list');
      expect(paymentMethodLabel({ kind: null })).toBe('');
      expect(paymentMethodLabel({} as Ticket)).toBe('');
    });

    it('hasExtraBed() spots an active Extra bed add-on by name or code', () => {
      const t = (items: Partial<Shopcart>[]) => ({ shopcart: items as Shopcart[] });
      expect(hasExtraBed(t([{ category: 'addon_pass', passTypeName: 'Extra bed', isActive: true }]))).toBeTrue();
      expect(hasExtraBed(t([{ category: 'addon_pass', passTypeName: 'Add-on', externalCode: 'terra_extra_bed', isActive: true }]))).toBeTrue();
      expect(hasExtraBed(t([{ category: 'addon_pass', passTypeName: 'Extra bed', isActive: false }]))).toBeFalse();
      expect(hasExtraBed(t([{ category: 'stay_pass', passTypeName: 'Extra bed room', isActive: true }]))).toBeFalse();
      expect(hasExtraBed(t([{ category: 'addon_pass', passTypeName: 'Car Pass', isActive: true }]))).toBeFalse();
      expect(hasExtraBed(null)).toBeFalse();
    });
  });

  describe('isFestivalPass()', () => {
    it('is true when category is festival', () => {
      expect(isFestivalPass({ category: 'festival_pass' } as Shopcart)).toBeTrue();
    });

    it('is false when category is tent or addon', () => {
      expect(isFestivalPass({ category: 'stay_pass' } as Shopcart)).toBeFalse();
      expect(isFestivalPass({ category: 'addon_pass' } as Shopcart)).toBeFalse();
    });

    it('falls back to the legacy item_name match when category is missing (legacy Tickets module items)', () => {
      expect(isFestivalPass({ item_name: 'Festival Ticket' } as Shopcart)).toBeTrue();
      expect(isFestivalPass({ item_name: 'Weekend pass' } as Shopcart)).toBeTrue();
      expect(isFestivalPass({ item_name: 'Day Pass' } as Shopcart)).toBeTrue();
      expect(isFestivalPass({ item_name: 'Shared Tent' } as Shopcart)).toBeFalse();
      expect(isFestivalPass({ item_name: 'Solo Tent' } as Shopcart)).toBeFalse();
    });

    it('prefers category over item_name when both are present', () => {
      expect(isFestivalPass({ category: 'stay_pass', item_name: 'Festival Ticket' } as Shopcart)).toBeFalse();
    });
  });

  describe('isSpotRegistration()', () => {
    it('is true when transaction_id has the SPOT- prefix', () => {
      expect(isSpotRegistration({ transaction_id: 'SPOT-1785076470772' } as Ticket)).toBeTrue();
    });

    it('is false for a normal online transaction_id', () => {
      expect(isSpotRegistration({ transaction_id: 'TXN12345' } as Ticket)).toBeFalse();
    });

    it('is false when transaction_id is missing', () => {
      expect(isSpotRegistration({} as Ticket)).toBeFalse();
    });
  });

  describe('passSummary()', () => {
    it('returns an em-dash for an empty/undefined shopcart', () => {
      expect(passSummary(undefined)).toBe('—');
      expect(passSummary([])).toBe('—');
    });

    it('groups item names with counts', () => {
      const shopcart = [
        { item_name: 'Festival Ticket' } as Shopcart,
        { item_name: 'Camping' } as Shopcart,
        { item_name: 'Camping' } as Shopcart,
      ];
      expect(passSummary(shopcart)).toBe('Festival Ticket, Camping ×2');
    });
  });

  describe('passChips()', () => {
    it('returns an empty array for an empty/undefined shopcart', () => {
      expect(passChips(undefined)).toEqual([]);
      expect(passChips([])).toEqual([]);
    });

    it('groups item names with counts as separate chip strings', () => {
      const shopcart = [
        { item_name: 'Festival Ticket' } as Shopcart,
        { item_name: 'Camping' } as Shopcart,
        { item_name: 'Camping' } as Shopcart,
      ];
      expect(passChips(shopcart)).toEqual(['Festival Ticket', 'Camping ×2']);
    });
  });

  describe('passChipsTyped()', () => {
    it('returns an empty array for an empty/undefined shopcart', () => {
      expect(passChipsTyped(undefined)).toEqual([]);
      expect(passChipsTyped([])).toEqual([]);
    });

    it('tags each grouped chip with whether it is a Festival Pass', () => {
      const shopcart = [
        { item_name: 'Festival Ticket' } as Shopcart,
        { item_name: 'Camping' } as Shopcart,
        { item_name: 'Camping' } as Shopcart,
      ];
      expect(passChipsTyped(shopcart)).toEqual([
        { label: 'Festival Ticket', festival: true },
        { label: 'Camping ×2', festival: false },
      ]);
    });
  });
});

describe('Ticket Email status helpers (Email epic)', () => {
  it('reads a missing status as not sent', () => {
    expect(ticketEmailStatus(null)).toBe('not_sent');
    expect(ticketEmailStatus({ ticketEmail: undefined } as any)).toBe('not_sent');
    expect(ticketEmailStatus({ ticketEmail: { status: 'failed' } })).toBe('failed');
  });

  it('labels and colours every status', () => {
    expect(['not_sent', 'sending', 'sent', 'failed', 'no_email'].map(s => ticketEmailLabel(s as any)))
      .toEqual(['Not sent', 'Sending…', 'Sent', 'Failed', 'No email']);
    expect(ticketEmailBadge('sent')).toBe('bg');
    expect(ticketEmailBadge('failed')).toBe('br');
    expect(ticketEmailBadge('no_email')).toBe('ba');
  });

  describe('lookupErrorMessage()', () => {
    const fallback = 'fallback';
    it('names a network failure', () => {
      expect(lookupErrorMessage({ status: 0 }, fallback)).toContain('Could not reach the server');
    });
    it('names an expired session', () => {
      expect(lookupErrorMessage({ status: 401 }, fallback)).toContain('session has expired');
    });
    it('names missing access', () => {
      expect(lookupErrorMessage({ status: 403 }, fallback)).toContain('do not have access');
    });
    it('names a server problem instead of showing its raw text', () => {
      expect(lookupErrorMessage({ status: 500, error: 'Search failed' }, fallback)).toContain('server ran into a problem');
    });
    it('keeps a specific reason from big-api for 4xx', () => {
      expect(lookupErrorMessage({ status: 404, error: { message: 'No booking matches this QR code' } }, fallback))
        .toBe('No booking matches this QR code');
    });
    it('reads validation errors', () => {
      expect(lookupErrorMessage({ status: 400, error: { errors: [{ msg: 'eventId is required' }] } }, fallback))
        .toBe('eventId is required');
    });
    it('falls back when there is nothing specific', () => {
      expect(lookupErrorMessage({ status: 418 }, fallback)).toBe(fallback);
    });
  });
});

describe('Festival Pass details (Early Check-In EC1)', () => {
  const full = { category: 'festival_pass', isActive: true, name: 'Odile Ferrant', phone_no: '9000000031', email: 'odile@example.test', gender: 'female' } as any;

  it('needs name, phone, email and gender', () => {
    expect(FESTIVAL_DETAIL_FIELDS).toEqual(['name', 'phone_no', 'email', 'gender']);
    expect(festivalDetailsFilled(full)).toBeTrue();
    expect(festivalDetailsFilled({ ...full, gender: null })).toBeFalse();
    expect(festivalDetailsFilled({ ...full, email: '  ' })).toBeFalse();
    expect(festivalDetailsFilled({ ...full, phone_no: undefined })).toBeFalse();
  });

  it('counts active Festival Passes only (no Tent / add-on, no switched-off pass)', () => {
    const ticket = { shopcart: [
      full,
      { ...full, name: '' },
      { ...full, isActive: false, name: '' },
      { category: 'stay_pass', isActive: true } as any,
      { category: 'addon_pass', isActive: true } as any,
    ] } as Ticket;
    expect(festivalDetailsCount(ticket)).toEqual({ filled: 1, total: 2 });
    expect(festivalDetailsMissing(ticket)).toBeTrue();
  });

  it('a booking with every pass filled, or with no Festival Pass, is not missing anything', () => {
    expect(festivalDetailsMissing({ shopcart: [full] } as Ticket)).toBeFalse();
    expect(festivalDetailsCount({ shopcart: [{ category: 'stay_pass', isActive: true } as any] } as Ticket)).toEqual({ filled: 0, total: 0 });
    expect(festivalDetailsMissing({ shopcart: [] } as any)).toBeFalse();
    expect(festivalDetailsCount(null)).toEqual({ filled: 0, total: 0 });
  });
});

describe('Early Check-In email status (EC2)', () => {
  const now = new Date('2026-12-01T10:00:00Z').getTime();

  it('reads a missing status as not sent', () => {
    expect(earlyCheckinStatus({} as Ticket, now)).toBe('not_sent');
    expect(earlyCheckinStatus(null, now)).toBe('not_sent');
  });

  it('shows a sent link past its end date as Expired, never a submitted one', () => {
    const sent = (expiresAt: string, status: any = 'sent') => ({ earlyCheckin: { status, expiresAt } }) as Ticket;
    expect(earlyCheckinStatus(sent('2026-12-05T00:00:00Z'), now)).toBe('sent');
    expect(earlyCheckinStatus(sent('2026-11-30T00:00:00Z'), now)).toBe('expired');
    expect(earlyCheckinStatus(sent('2026-11-30T00:00:00Z', 'submitted'), now)).toBe('submitted');
  });

  it('has a label and badge for every filter option', () => {
    expect(EARLY_CHECKIN_FILTER_OPTIONS.map(o => o.value)).toEqual(['not_sent', 'sending', 'sent', 'submitted', 'expired', 'failed', 'no_email']);
    expect(earlyCheckinLabel('expired')).toBe('Expired');
    expect(earlyCheckinBadge('submitted')).toBe('bg');
    expect(earlyCheckinBadge('failed')).toBe('br');
  });
});

describe('Beds vs people with linked bookings (bedGroups)', () => {
  const fest = (extra: any = {}) => ({ category: 'festival_pass', isActive: true, item_quantity: 1, ...extra });
  const stay = (beds: number, extra: any = {}) => ({ category: 'stay_pass', isActive: true, item_quantity: 1, beds, ...extra });
  const bk = (id: string, reference: string | undefined, shopcart: any[], linkedReferences?: string[]) =>
    ({ _id: id, reference, shopcart, linkedReferences } as any as Ticket);

  it('counts one booking on its own: Festival Passes vs Stay Pass beds, add-ons and switched-off passes left out', () => {
    const b = bk('a', 'R1', [fest(), fest(), fest({ isActive: false }), stay(1), { category: 'addon_pass', isActive: true }, stay(3, { isActive: false })]);
    const g = bedGroups([b]).get('a')!;
    expect(g.people).toBe(2);
    expect(g.beds).toBe(1);
    expect(g.bookingIds).toEqual(['R1']);
    expect(bedsMismatch(g)).toBe(true);
  });

  it('adds up a booking and the booking it links to; both get the same totals', () => {
    const festOnly = bk('a', 'R1', [fest(), fest(), fest(), fest()]);
    const room = bk('b', 'R2', [stay(4)], ['R1']);
    const groups = bedGroups([festOnly, room]);
    expect(groups.get('a')).toBe(groups.get('b')!);
    expect(groups.get('a')).toEqual(jasmine.objectContaining({ people: 4, beds: 4 }));
    expect(groups.get('a')!.bookingIds.sort()).toEqual(['R1', 'R2']);
    expect(bedsMismatch(groups.get('a'))).toBe(false);
  });

  it('follows chains and several links: C -> B -> A and D -> A all form one group', () => {
    const a = bk('a', 'RA', [fest(), fest()]);
    const b = bk('b', 'RB', [stay(2)], ['RA']);
    const c = bk('c', 'RC', [{ category: 'addon_pass', isActive: true }], ['RB']);
    const d = bk('d', 'RD', [stay(1)], ['RA', 'RX']);
    const groups = bedGroups([a, b, c, d]);
    const g = groups.get('c')!;
    expect(g).toBe(groups.get('a')!);
    expect(g).toBe(groups.get('d')!);
    expect(g.people).toBe(2);
    expect(g.beds).toBe(3);
    expect(g.missingRefs).toEqual(['RX']);
  });

  it('flags a Festival-only booking nothing links to, never a booking with no passes', () => {
    const groups = bedGroups([bk('a', undefined, [fest()]), bk('b', 'R2', [])]);
    expect(bedsMismatch(groups.get('a'))).toBe(true);
    expect(bedsMismatch(groups.get('b'))).toBe(false);
  });

  it('a Stay Pass with no beds set counts as one bed', () => {
    expect(bedGroups([bk('a', 'R1', [fest(), { category: 'stay_pass', isActive: true }])]).get('a')!.beds).toBe(1);
  });
});

describe('Pass types with linked bookings (groupPassTypes, B-083)', () => {
  const bk = (id: string, reference: string | undefined, types: string[], linkedReferences?: string[]) =>
    ({ _id: id, reference, linkedReferences, shopcart: types.map(t => ({ passType: t, isActive: t !== 'off' })) } as any as Ticket);

  it('a booking holds its own pass types and those of every booking linked to it, both ways', () => {
    const a = bk('a', 'R1', ['week']);
    const b = bk('b', 'R2', ['tent'], ['R1']);
    const c = bk('c', 'R3', ['car']);
    const m = groupPassTypes([a, b, c]);
    expect([...m.get('a')!].sort()).toEqual(['tent', 'week']);
    expect(m.get('b')).toBe(m.get('a')!);
    expect([...m.get('c')!]).toEqual(['car']);
  });

  it('counts a switched-off pass, and skips a pass with no type', () => {
    const x = { _id: 'x', shopcart: [{ passType: 'full', isActive: false }, { item_name: 'Legacy', isActive: true }] } as any as Ticket;
    expect([...groupPassTypes([x]).get('x')!]).toEqual(['full']);
  });

  it('linkRoots lists references that are not among the bookings', () => {
    const r = linkRoots([bk('a', 'R1', [], ['R9'])]);
    expect([...r.missing.get('a')!]).toEqual(['R9']);
    expect(r.rootOf.get('a')).toBe('a');
  });
});
