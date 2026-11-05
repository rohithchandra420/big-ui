import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { I18nService } from './i18n';
import { PublicNews } from './public-api.service';
import { agoText, tickerNews } from './news';
import { NewsTickerComponent, TICK_MS } from '../ui/news-ticker.component';
import { NewsViewComponent } from '../views/news-view.component';

const NOW = Date.parse('2026-12-11T06:00:00Z');
const H = 3600000;
const post = (id: string, hoursAgo: number, type: PublicNews['type'] = 'general'): PublicNews =>
  ({ id, type, title: `Post ${id}`, message: `Body ${id}`, at: new Date(NOW - hoursAgo * H).toISOString() });

describe('news helpers', () => {
  const i18n = new I18nService();

  it('ticker: last 24 h only, urgent ones of the last 6 h on top', () => {
    const list = [post('a', 1), post('u1', 2, 'urgent'), post('b', 5), post('u2', 8, 'urgent'), post('old', 25)];
    expect(tickerNews(list, NOW).map(n => n.id)).toEqual(['u1', 'a', 'b', 'u2']);
  });

  it('relative times', () => {
    expect(agoText(new Date(NOW - 20000).toISOString(), NOW, i18n)).toBe('just now');
    expect(agoText(new Date(NOW - 12 * 60000).toISOString(), NOW, i18n)).toBe('12 min ago');
    expect(agoText(new Date(NOW - 3 * H).toISOString(), NOW, i18n)).toBe('3 h ago');
    expect(agoText('2026-12-09T05:12:00Z', NOW, i18n)).toMatch(/9 Dec, 10:42/);
  });
});

describe('NewsTickerComponent', () => {
  let fixture: ComponentFixture<NewsTickerComponent>;
  let c: NewsTickerComponent;
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [NewsTickerComponent] });
    fixture = TestBed.createComponent(NewsTickerComponent);
    c = fixture.componentInstance;
    c.now = NOW;
  });
  afterEach(() => fixture.destroy());

  it('is hidden with no recent news', () => {
    c.news = [post('old', 30)];
    c.ngOnChanges();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.ticker')).toBeNull();
  });

  it('rotates through the posts; urgent styled; tap opens All news', fakeAsync(() => {
    c.news = [post('a', 1), post('u', 2, 'urgent')];
    c.ngOnChanges();
    fixture.detectChanges();
    const btn = () => fixture.nativeElement.querySelector('.ticker') as HTMLButtonElement;
    expect(btn().textContent).toContain('Post u');
    expect(btn().classList).toContain('urgent');
    tick(TICK_MS);
    fixture.detectChanges();
    expect(btn().textContent).toContain('Post a');
    let opened = false;
    c.all.subscribe(() => opened = true);
    btn().click();
    expect(opened).toBeTrue();
    fixture.destroy();
  }));
});

describe('NewsViewComponent', () => {
  it('lists every post with its type word and time; empty message otherwise', () => {
    TestBed.configureTestingModule({ imports: [NewsViewComponent] });
    const fixture = TestBed.createComponent(NewsViewComponent);
    fixture.componentInstance.now = NOW;
    fixture.componentInstance.news = [post('a', 0.5, 'weather'), post('old', 30)];
    fixture.detectChanges();
    const posts = fixture.nativeElement.querySelectorAll('.post');
    expect(posts.length).toBe(2);
    expect(posts[0].textContent).toContain('Weather');
    expect(posts[0].textContent).toContain('30 min ago');
    fixture.componentInstance.news = [];
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No news yet');
  });
});
