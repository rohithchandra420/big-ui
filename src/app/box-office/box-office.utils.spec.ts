import { isFestivalPass, isSpotRegistration, passChips, passChipsTyped, passSummary } from './box-office.utils';
import { Shopcart, Ticket } from '../models/ticket.model';

describe('box-office.utils', () => {
  describe('isFestivalPass()', () => {
    it('is true for Festival Ticket/Weekend pass/Day Pass', () => {
      expect(isFestivalPass('Festival Ticket')).toBeTrue();
      expect(isFestivalPass('Weekend pass')).toBeTrue();
      expect(isFestivalPass('Day Pass')).toBeTrue();
    });

    it('is false for tent pass types', () => {
      expect(isFestivalPass('Shared Tent')).toBeFalse();
      expect(isFestivalPass('Solo Tent')).toBeFalse();
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
