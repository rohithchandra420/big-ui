import { passBookingId, passBookingLabel } from './workshops.model';

describe('workshops.model Booking ID helpers', () => {
  it('passBookingId() gives the Booking ID, else the order number as text', () => {
    expect(passBookingId({ bookingId: 'BLM-7Q2X', order_id: 702 })).toBe('BLM-7Q2X');
    expect(passBookingId({ bookingId: null, order_id: 88 })).toBe('88');
    expect(passBookingId({ order_id: null })).toBe('');
    expect(passBookingId(null)).toBe('');
  });

  it('passBookingLabel() says "Booking <id>", else "Order <n>"', () => {
    expect(passBookingLabel({ bookingId: 'BLM-7Q2X', order_id: 702 })).toBe('Booking BLM-7Q2X');
    expect(passBookingLabel({ order_id: 88 })).toBe('Order 88');
    expect(passBookingLabel(undefined)).toBe('');
  });
});
