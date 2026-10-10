import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject, of } from 'rxjs';

import { UserAvatarComponent } from './user-avatar.component';
import { AvatarService } from '../../core/avatar.service';

describe('UserAvatarComponent', () => {
  let fixture: ComponentFixture<UserAvatarComponent>;
  let component: UserAvatarComponent;
  let versions$: BehaviorSubject<Map<string, number>>;
  let avatarStub: any;

  beforeEach(async () => {
    versions$ = new BehaviorSubject(new Map());
    avatarStub = {
      versions$,
      effectiveVersion: (id: string, v: any) => versions$.value.has(id) ? versions$.value.get(id) : (v || 0),
      getPhotoUrl: jasmine.createSpy('getPhotoUrl').and.callFake((_id: string, v: number) => of(`blob:photo-${v}`))
    };

    await TestBed.configureTestingModule({
      declarations: [UserAvatarComponent],
      providers: [{ provide: AvatarService, useValue: avatarStub }]
    }).compileComponents();

    fixture = TestBed.createComponent(UserAvatarComponent);
    component = fixture.componentInstance;
  });

  const render = (inputs: Partial<UserAvatarComponent>) => {
    Object.assign(component, inputs);
    component.ngOnChanges();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  };

  it('shows the initial when the user has no photo', () => {
    const el = render({ userId: 'u1', name: 'asha', version: 0 });
    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent?.trim()).toBe('A');
    expect(avatarStub.getPhotoUrl).not.toHaveBeenCalled();
  });

  it('shows the photo when there is a version', () => {
    const el = render({ userId: 'u1', name: 'Asha', version: 3 });
    expect(el.querySelector('img')?.getAttribute('src')).toBe('blob:photo-3');
  });

  it('applies the requested size', () => {
    const el = render({ userId: 'u1', name: 'Asha', size: 40 });
    const span = el.querySelector('.ua') as HTMLElement;
    expect(span.style.width).toBe('40px');
    expect(span.style.height).toBe('40px');
  });

  it('switches to a photo changed elsewhere this session', () => {
    render({ userId: 'u1', name: 'Asha', version: 0 });
    versions$.next(new Map([['u1', 9]]));
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('img')?.getAttribute('src')).toBe('blob:photo-9');
  });

  it('falls back to the initial if the image fails to load', () => {
    render({ userId: 'u1', name: 'Asha', version: 3 });
    component.onImageError();
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('img')).toBeNull();
  });
});
