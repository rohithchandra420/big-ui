import { ComponentFixture, TestBed, fakeAsync, flush, tick } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { BehaviorSubject } from 'rxjs';
import { BillboardComponent } from './billboard.component';
import { BillboardNote, BillboardService } from '../core/billboard.service';

describe('BillboardComponent', () => {
  let fixture: ComponentFixture<BillboardComponent>;
  let component: BillboardComponent;
  let billboard: any;
  let router: jasmine.SpyObj<Router>;
  let params$: BehaviorSubject<any>;
  const el = () => fixture.nativeElement as HTMLElement;

  const note = (id: string, extra: Partial<BillboardNote> = {}): BillboardNote => ({
    _id: id, type: 'general', title: `Title ${id}`, message: `Message ${id}`, createdAt: '2026-11-01T09:00:00Z',
    from: 'Asha', roles: ['VOL'], departments: [], read: false, ...extra
  });

  const setup = (query: Record<string, string> = {}, failList = false) => {
    params$ = new BehaviorSubject(convertToParamMap(query));
    billboard = {
      unread$: new BehaviorSubject<number>(2),
      list: jasmine.createSpy('list').and.resolveTo({
        notes: [note('n3', { type: 'urgent' }), note('n2', { type: 'email', from: null, roles: [] }), note('n1', { read: true })],
        hasMore: true
      }),
      refreshUnread: jasmine.createSpy('refreshUnread').and.resolveTo(),
      markRead: jasmine.createSpy('markRead').and.resolveTo(),
      markAllRead: jasmine.createSpy('markAllRead').and.resolveTo()
    };
    if (failList) billboard.list.and.rejectWith(new Error('offline'));
    router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      declarations: [BillboardComponent],
      imports: [MatIconModule],
      providers: [
        { provide: BillboardService, useValue: billboard },
        { provide: Router, useValue: router },
        { provide: ActivatedRoute, useValue: { queryParamMap: params$, get snapshot() { return { queryParamMap: params$.value }; } } }
      ]
    });
    fixture = TestBed.createComponent(BillboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  };

  const settle = () => { flush(); fixture.detectChanges(); };

  it('pins every note on the board, newest first, with NEW on the unread ones', fakeAsync(() => {
    setup(); settle();
    const notes = el().querySelectorAll('.bb-board .bb-note');
    expect(notes.length).toBe(3);
    expect(notes[0].classList).toContain('t-urgent');
    expect(notes[0].querySelector('.bb-title')!.textContent).toContain('Title n3');
    expect(notes[0].querySelector('.bb-pin')).toBeTruthy();
    expect(el().querySelectorAll('.bb-board .bb-new').length).toBe(2);
  }));

  it('opening a note shows it large, without a pin, and marks it read', fakeAsync(() => {
    setup(); settle();
    (el().querySelector('.bb-board .bb-note') as HTMLButtonElement).click();
    settle();
    const big = el().querySelector('.bb-big')!;
    expect(big).toBeTruthy();
    expect(big.querySelector('.bb-pin')).toBeNull();
    expect(big.textContent).toContain('From: Asha');
    expect(big.textContent).toContain('To: Volunteers');
    expect(billboard.markRead).toHaveBeenCalledWith('n3');
    expect(component.notes[0].read).toBeTrue();
  }));

  it('does not mark an already-read note again', fakeAsync(() => {
    setup(); settle();
    component.openNote(component.notes[2]);
    settle();
    expect(billboard.markRead).not.toHaveBeenCalled();
  }));

  it('an Emails sent note is from BiG, to Only you', fakeAsync(() => {
    setup(); settle();
    component.openNote(component.notes[1]);
    settle();
    const meta = el().querySelector('.bb-big .bb-meta')!.textContent!;
    expect(meta).toContain('From: BiG');
    expect(meta).toContain('To: Only you');
  }));

  it('closes with the close button, Escape, or a tap outside', fakeAsync(() => {
    setup(); settle();
    component.openNote(component.notes[0]); settle();
    (el().querySelector('.bb-close') as HTMLButtonElement).click(); settle();
    expect(el().querySelector('.bb-big')).toBeNull();

    component.openNote(component.notes[0]); settle();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); settle();
    expect(component.open).toBeNull();

    component.openNote(component.notes[0]); settle();
    (el().querySelector('.bb-scrim') as HTMLElement).click(); settle();
    expect(component.open).toBeNull();
  }));

  it('?n= opens that note (the push notification link), and closing drops ?n=', fakeAsync(() => {
    setup({ n: 'n2' }); settle();
    expect(component.open?._id).toBe('n2');
    expect(billboard.markRead).toHaveBeenCalledWith('n2');
    component.closeNote();
    expect(router.navigate).toHaveBeenCalledWith([], jasmine.objectContaining({ queryParams: { n: null }, replaceUrl: true }));
  }));

  it('a new ?n= while the page is open reloads, so a brand-new note can open', fakeAsync(() => {
    setup(); settle();
    billboard.list.and.resolveTo({ notes: [note('n4'), ...component.notes], hasMore: false });
    params$.next(convertToParamMap({ n: 'n4' })); settle();
    expect(billboard.list).toHaveBeenCalledTimes(2);
    expect(component.open?._id).toBe('n4');
    // Dropping ?n= afterwards doesn't reload again.
    params$.next(convertToParamMap({})); settle();
    expect(billboard.list).toHaveBeenCalledTimes(2);
  }));

  it('Unread tab shows only unread notes, and "All caught up" once they are read', fakeAsync(() => {
    setup(); settle();
    component.tab = 'unread'; fixture.detectChanges();
    expect(el().querySelectorAll('.bb-board .bb-note').length).toBe(2);
    expect(el().querySelector('.bb-count')!.textContent).toContain('2');

    component.markAllRead(); billboard.unread$.next(0); settle();
    expect(billboard.markAllRead).toHaveBeenCalled();
    expect(el().querySelectorAll('.bb-board .bb-note').length).toBe(0);
    expect(el().querySelector('.bb-empty')!.textContent).toContain('All caught up');
  }));

  it('Mark all read appears only while something is unread, and undoes itself if the server fails', fakeAsync(() => {
    setup(); settle();
    const btn = () => Array.from(el().querySelectorAll('button')).find(b => b.textContent!.includes('Mark all read'));
    expect(btn()).toBeTruthy();
    billboard.markAllRead.and.rejectWith(new Error('offline'));
    component.markAllRead(); settle();
    expect(component.notes.filter(n => !n.read).length).toBe(2);
    billboard.unread$.next(0); fixture.detectChanges();
    expect(btn()).toBeUndefined();
  }));

  it('Show older appends the next page', fakeAsync(() => {
    setup(); settle();
    billboard.list.and.resolveTo({ notes: [note('n0', { read: true })], hasMore: false });
    (Array.from(el().querySelectorAll('button')).find(b => b.textContent!.includes('Show older')) as HTMLButtonElement).click();
    settle();
    expect(billboard.list).toHaveBeenCalledWith('n1');
    expect(component.notes.map(n => n._id)).toEqual(['n3', 'n2', 'n1', 'n0']);
    expect(Array.from(el().querySelectorAll('button')).some(b => b.textContent!.includes('Show older'))).toBeFalse();
  }));

  it('shows an error when the board cannot load', fakeAsync(() => {
    setup({}, true); settle();
    expect(el().querySelector('.alert-danger')).toBeTruthy();
  }));

  it('names roles and departments in the To line', fakeAsync(() => {
    setup(); settle();
    expect(component.audience(note('x', { roles: ['TL', 'VOL'], departments: ['Operations'] }))).toBe('Team Leads, Volunteers in Operations');
    expect(component.audience(note('x', { roles: [], departments: ['Box Office'] }))).toBe('Everyone in Box Office');
  }));
});
