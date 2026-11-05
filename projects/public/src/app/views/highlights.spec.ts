import { TestBed } from '@angular/core/testing';
import { HighlightsComponent } from './highlights-view.component';
import { PublicEdition, PublicPhoto } from '../core/public-api.service';

// PH6: highlights mosaic + "through the years".

const photo = (id: string, over: Partial<PublicPhoto> = {}): PublicPhoto => ({
  id, url: `https://media.example.com/${id}.webp`, thumbUrl: `https://media.example.com/${id}-thumb.webp`,
  caption: `Photo ${id}`, sub: '', layout: 'normal', ...over
});
const editions: PublicEdition[] = [
  { edition: 'BiG 2026', items: [{ value: '2,000', label: 'bloomers', icon: 'groups' }, { value: '46', label: 'workshops', icon: 'palette' }] },
  { edition: 'BiG 2025', items: [{ value: '1,650', label: 'bloomers', icon: 'groups' }] }
];

describe('HighlightsComponent', () => {
  const make = (photos: PublicPhoto[], stats: PublicEdition[], phase: any = 'during') => {
    TestBed.configureTestingModule({ imports: [HighlightsComponent] });
    const f = TestBed.createComponent(HighlightsComponent);
    Object.assign(f.componentInstance, { photos, stats, phase });
    f.componentInstance.ngOnChanges();
    f.detectChanges();
    return f;
  };

  it('mosaic with thumbnails and layouts; tap opens the full photo', () => {
    const f = make([photo('a', { layout: 'tall' }), photo('b', { layout: 'wide', sub: 'Day 1' })], []);
    const tiles = f.nativeElement.querySelectorAll('.tile');
    expect(tiles.length).toBe(2);
    expect(tiles[0].classList).toContain('big');
    expect(tiles[1].classList).toContain('wide');
    expect(tiles[0].querySelector('img').getAttribute('src')).toContain('a-thumb.webp');
    tiles[1].click();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.lightbox img').getAttribute('src')).toContain('b.webp');
    expect(f.nativeElement.querySelector('.lightbox').textContent).toContain('Day 1');
  });

  it('title follows the phase', () => {
    expect(make([photo('a')], [], 'before').nativeElement.textContent).toContain('Last time at BiG');
  });

  it('through the years with an edition switcher', () => {
    const f = make([], editions);
    expect(f.nativeElement.textContent).toContain('2,000');
    (f.nativeElement.querySelectorAll('.years button')[1] as HTMLButtonElement).click();
    f.detectChanges();
    expect(f.nativeElement.textContent).toContain('1,650');
    expect(f.nativeElement.textContent).not.toContain('2,000');
  });

  it('nothing shown when there are no photos or stats', () => {
    expect(make([], []).nativeElement.querySelector('section')).toBeNull();
  });
});
