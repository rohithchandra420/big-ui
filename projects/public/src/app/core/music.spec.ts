import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { SimpleChange } from '@angular/core';
import { PublicEvent, PublicMusic } from './public-api.service';
import { isPlaying, musicForHome, musicOfDay } from './music';
import { HomeViewComponent } from '../views/home-view.component';
import { ScheduleViewComponent } from '../views/schedule-view.component';

// Music on the public page (Music epic): artist, genre, stage and times only.

const NOW = Date.parse('2026-12-11T14:00:00Z'); // 19:30 India time, day 2
const ev = (over: Partial<PublicEvent> = {}): PublicEvent => ({
  off: false, name: 'BiG 7.0', startDate: '2026-12-10', endDate: '2026-12-12', today: '2026-12-11', phase: 'during',
  days: ['2026-12-10', '2026-12-11', '2026-12-12'], ...over
});
const m = (id: string, start: string, end: string, over: Partial<PublicMusic> = {}): PublicMusic => ({
  id, act: id, genre: 'Folk', stage: 'Riverside Stage', start, end, ...over
});
const MUSIC = [
  m('later', '2026-12-11T16:30:00Z', '2026-12-11T17:30:00Z'),
  m('playing', '2026-12-11T13:30:00Z', '2026-12-11T14:30:00Z', { genre: '' }),
  m('done', '2026-12-11T10:00:00Z', '2026-12-11T11:00:00Z'),
  m('day1', '2026-12-10T14:00:00Z', '2026-12-10T15:00:00Z'),
];

describe('public music', () => {
  it('knows what is playing now', () => {
    expect(isPlaying(MUSIC[1], NOW)).toBeTrue();
    expect(isPlaying(MUSIC[0], NOW)).toBeFalse();
  });

  it('Home: playing now + the rest of today; Day 1 before; nothing after', () => {
    expect(musicForHome(MUSIC, ev(), NOW).map(x => x.id)).toEqual(['playing', 'later']);
    expect(musicForHome(MUSIC, ev({ phase: 'before' }), NOW).map(x => x.id)).toEqual(['day1']);
    expect(musicForHome(MUSIC, ev({ phase: 'after' }), NOW)).toEqual([]);
  });

  it('Schedule: the whole day in start order', () => {
    expect(musicOfDay(MUSIC, '2026-12-11').map(x => x.id)).toEqual(['done', 'playing', 'later']);
  });

  it('Home shows "On stage today" with Playing now, and hides it with no music', () => {
    TestBed.configureTestingModule({ imports: [HomeViewComponent], providers: [provideHttpClient()] });
    const fixture = TestBed.createComponent(HomeViewComponent);
    const c = fixture.componentInstance;
    c.event = ev(); c.sessions = []; c.music = MUSIC; c.now = NOW;
    c.ngOnChanges();
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('On stage today');
    expect(text).toContain('Playing now');
    expect(text).toContain('Riverside Stage');
    expect(fixture.nativeElement.querySelectorAll('pub-music-row').length).toBe(2);

    c.music = [];
    c.ngOnChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('On stage today');
  });

  it('Schedule lists the picked day\'s music under "Music"', () => {
    TestBed.configureTestingModule({ imports: [ScheduleViewComponent], providers: [provideHttpClient()] });
    const fixture = TestBed.createComponent(ScheduleViewComponent);
    const c = fixture.componentInstance;
    c.event = ev(); c.sessions = []; c.music = MUSIC; c.now = NOW;
    c.ngOnChanges({ music: new SimpleChange(null, MUSIC, true) });
    fixture.detectChanges();
    expect(c.musicDay.map(x => x.id)).toEqual(['done', 'playing', 'later']);
    c.setDay('2026-12-10');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('pub-music-row').length).toBe(1);
  });
});
