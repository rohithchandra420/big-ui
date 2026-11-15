import { agoText, dueAtOf, HOUR, parseWashQr, stateOf, usedPercent } from './wash.utils';

describe('wash.utils', () => {
  const now = new Date('2026-11-13T10:00:00Z');
  const ago = (h: number) => new Date(now.getTime() - h * HOUR).toISOString();
  const base = { kind: 'water' as const, status: 'ok' as const, intervalHours: 3, lastDoneAt: null as string | null };

  it('is not started before the first one, then follows the clock', () => {
    expect(stateOf(base, now)).toBe('not_started');
    expect(dueAtOf(base)).toBeNull();
    expect(stateOf({ ...base, lastDoneAt: ago(1) }, now)).toBe('ok');
    expect(stateOf({ ...base, lastDoneAt: ago(2.6) }, now)).toBe('due_soon');
    expect(stateOf({ ...base, lastDoneAt: ago(3.2) }, now)).toBe('overdue');
  });

  it('lets out of order and empty (water only) win', () => {
    expect(stateOf({ ...base, lastDoneAt: ago(1), status: 'out_of_order' }, now)).toBe('out_of_order');
    expect(stateOf({ ...base, lastDoneAt: ago(1), status: 'empty' }, now)).toBe('empty');
    expect(stateOf({ ...base, kind: 'toilets', lastDoneAt: ago(1), status: 'empty' }, now)).toBe('ok');
  });

  it('reads a WASH sticker link and nothing else', () => {
    const id = 'a1b2c3d4e5f6a1b2c3d4e5f6';
    expect(parseWashQr(`https://rchomeproject.in/wash?f=${id}&k=0123456789abcdef`)).toEqual({ id, token: '0123456789abcdef' });
    expect(parseWashQr(`/wash?f=${id}&k=0123456789abcdef`)).toEqual({ id, token: '0123456789abcdef' });
    expect(parseWashQr(`https://rchomeproject.in/wash?f=${id}`)).toBeNull();
    expect(parseWashQr('/wash?f=&k=')).toBeNull();
    expect(parseWashQr('BAND-12345')).toBeNull();
    expect(parseWashQr(null)).toBeNull();
  });

  it('gives the share of the interval used and a readable "ago"', () => {
    expect(usedPercent(base, now)).toBe(0);
    expect(usedPercent({ ...base, lastDoneAt: ago(1.5) }, now)).toBe(50);
    expect(usedPercent({ ...base, lastDoneAt: ago(4) }, now)).toBe(100);
    expect(agoText(ago(0.5), now)).toBe('30 min ago');
    expect(agoText(ago(2), now)).toBe('2 h ago');
    expect(agoText(ago(2.25), now)).toBe('2 h 15 min ago');
  });
});
