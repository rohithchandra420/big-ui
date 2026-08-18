import { isFestivalPass, isSpotRegistration, passChips, passChipsTyped, passSummary } from './box-office.utils';
import { Shopcart, Ticket } from '../models/ticket.model';

describe('box-office.utils', () => {
  describe('isFestivalPass()', () => {
    it('is true when category is festival', () => {
      expect(isFestivalPass({ category: 'festival' } as Shopcart)).toBeTrue();
    });

    it('is false when category is tent or addon', () => {
      expect(isFestivalPass({ category: 'tent' } as Shopcart)).toBeFalse();
      expect(isFestivalPass({ category: 'addon' } as Shopcart)).toBeFalse();
    });

    it('falls back to the legacy item_name match when category is missing (legacy Tickets module items)', () => {
      expect(isFestivalPass({ item_name: 'Festival Ticket' } as Shopcart)).toBeTrue();
      expect(isFestivalPass({ item_name: 'Weekend pass' } as Shopcart)).toBeTrue();
      expect(isFestivalPass({ item_name: 'Day Pass' } as Shopcart)).toBeTrue();
      expect(isFestivalPass({ item_name: 'Shared Tent' } as Shopcart)).toBeFalse();
      expect(isFestivalPass({ item_name: 'Solo Tent' } as Shopcart)).toBeFalse();
    });

    it('prefers category over item_name when both are present', () => {
      expect(isFestivalPass({ category: 'tent', item_name: 'Festival Ticket' } as Shopcart)).toBeFalse();
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
