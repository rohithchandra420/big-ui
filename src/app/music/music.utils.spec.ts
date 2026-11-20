import { MusicSlot } from './music.model';
import { clashesOf, dayOf, localValue, musicDays, nowInCell, pieceOn, shift, toIso } from './music.utils';

const at = (hhmm: string, day = '2026-12-05') => new Date(`${day}T${hhmm}:00`).toISOString();
const slot = (id: string, act: string, stage: string, start: string, end: string, sc: [string, string] | null = null): MusicSlot => ({
  _id: id, act, stage, start: at(start), end: at(end),
  soundCheckStart: sc ? at(sc[0]) : null, soundCheckEnd: sc ? at(sc[1]) : null
});

describe('music.utils', () => {
  it('lists the event days with labels', () => {
    const days = musicDays(new Date(2026, 11, 5).toISOString(), new Date(2026, 11, 7).toISOString());
    expect(days.map(d => d.date)).toEqual(['2026-12-05', '2026-12-06', '2026-12-07']);
    expect(days[0].sub).toBe('Day 1');
    expect(musicDays(null, null)).toEqual([]);
  });

  it('turns instants into <app-date-time> values and back', () => {
    const iso = at('19:30');
    expect(localValue(iso)).toBe('2026-12-05T19:30');
    expect(toIso('2026-12-05T19:30')).toBe(iso);
    expect(toIso('')).toBeNull();
    expect(localValue(null)).toBe('');
    expect(dayOf(new Date(iso))).toBe('2026-12-05');
    expect(shift(iso, 3600000)).toBe(at('20:30'));
    expect(shift(null, 1)).toBeNull();
  });

  it('cuts a slot past midnight into a piece on each day', () => {
    const start = at('23:00'), end = at('01:30', '2026-12-06');
    expect(pieceOn(start, end, '2026-12-05')).toEqual({ start: '2026-12-05T23:00:00', end: '2026-12-06T00:00:00', fromBefore: false, intoNext: true });
    expect(pieceOn(start, end, '2026-12-06')).toEqual({ start: '2026-12-06T00:00:00', end: '2026-12-06T01:30:00', fromBefore: true, intoNext: false });
    expect(pieceOn(start, end, '2026-12-07')).toBeNull();
    // Ending exactly at midnight stays on its own day.
    expect(pieceOn(at('22:00'), at('00:00', '2026-12-06'), '2026-12-06')).toBeNull();
    expect(pieceOn(at('22:00'), at('00:00', '2026-12-06'), '2026-12-05')!.intoNext).toBeFalse();
  });

  it('places the current-time line inside its cell', () => {
    const now = new Date('2026-12-05T19:15:00');
    expect(nowInCell('2026-12-05T19:00:00', '2026-12-05T19:30:00', now)).toBe(50);
    expect(nowInCell('2026-12-05T19:30:00', '2026-12-05T20:00:00', now)).toBeNull();
  });

  it('finds clashes like the server: same stage (sound check counts) or the same act twice', () => {
    const a = slot('a', 'act1', 'main', '19:00', '20:00');
    const b = slot('b', 'act2', 'main', '21:00', '22:00', ['19:30', '20:15']);   // its sound check overlaps a
    const c = slot('c', 'act1', 'side', '19:30', '20:30');                      // act1 twice at once
    const d = slot('d', 'act3', 'side', '21:00', '22:00');                      // free
    const all = [a, b, c, d];
    expect(clashesOf(a, all).map(s => s._id).sort()).toEqual(['b', 'c']);
    expect(clashesOf(b, all).map(s => s._id)).toEqual(['a']);
    expect(clashesOf(d, all)).toEqual([]);
    // Back to back is fine.
    expect(clashesOf(slot('e', 'act4', 'main', '20:00', '20:30'), [a])).toEqual([]);
  });
});
