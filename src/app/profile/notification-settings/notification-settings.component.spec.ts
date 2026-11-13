import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { NotificationSettingsComponent } from './notification-settings.component';
import { PushService } from '../../core/push.service';
import { NotificationService } from '../../core/notification.service';
import { AuthService } from '../../core/auth.service';

describe('NotificationSettingsComponent', () => {
  let fixture: ComponentFixture<NotificationSettingsComponent>;
  let push: any;
  let snack: jasmine.SpyObj<NotificationService>;
  const el = () => fixture.nativeElement as HTMLElement;
  const button = (label: string) => Array.from(el().querySelectorAll('button')).find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

  let auth: { currentUser: any; canViewWash: jasmine.Spy };

  beforeEach(() => {
    auth = { currentUser: { role: 'VOL' }, canViewWash: jasmine.createSpy('canViewWash').and.returnValue(false) };
    push = {
      state$: new BehaviorSubject('off'),
      config$: new BehaviorSubject({ enabled: true, publicKey: 'k', preferences: { emailBatch: true, announcements: false, meals: true }, canAnnounce: false }),
      load: jasmine.createSpy('load').and.resolveTo(null),
      enable: jasmine.createSpy('enable').and.resolveTo('on'),
      disable: jasmine.createSpy('disable').and.resolveTo(undefined),
      setPreference: jasmine.createSpy('setPreference').and.resolveTo({ emailBatch: false, announcements: false }),
      sendTest: jasmine.createSpy('sendTest').and.resolveTo({ devices: 1, delivered: 1 })
    };
    snack = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    TestBed.configureTestingModule({
      declarations: [NotificationSettingsComponent],
      providers: [
        { provide: PushService, useValue: push }, { provide: NotificationService, useValue: snack },
        { provide: AuthService, useValue: auth }
      ]
    });
    fixture = TestBed.createComponent(NotificationSettingsComponent);
    fixture.detectChanges();
  });

  it('loads settings on open', () => {
    expect(push.load).toHaveBeenCalled();
  });

  it('offers Turn on when off, and turns on', fakeAsync(() => {
    expect(el().textContent).toContain('Off');
    button('Turn on')!.click();
    tick();
    expect(push.enable).toHaveBeenCalled();
    expect(snack.openSucessSnackBar).toHaveBeenCalled();
  }));

  it('offers Send test and Turn off when on', fakeAsync(() => {
    push.state$.next('on'); fixture.detectChanges();
    button('Send test')!.click(); tick();
    expect(push.sendTest).toHaveBeenCalled();
    button('Turn off')!.click(); tick();
    expect(push.disable).toHaveBeenCalled();
  }));

  it('explains the iPhone install requirement', () => {
    push.state$.next('ios-needs-install'); fixture.detectChanges();
    expect(el().textContent).toContain('Add to Home Screen');
    expect(button('Turn on')).toBeUndefined();
  });

  it('explains a browser block', () => {
    push.state$.next('blocked'); fixture.detectChanges();
    expect(el().textContent).toContain('blocked');
  });

  it('shows the category switches with the saved values and saves a change', fakeAsync(() => {
    const boxes = el().querySelectorAll<HTMLInputElement>('.ns-pref input');
    expect(boxes.length).toBe(3);
    expect(boxes[0].checked).toBeTrue();    // Email batch finished
    expect(boxes[1].checked).toBeFalse();   // Announcements
    boxes[0].click(); tick();
    expect(push.setPreference).toHaveBeenCalledWith('emailBatch', false);
  }));

  it('adds the WASH alerts switch only for people who get WASH alerts', () => {
    expect(el().textContent).not.toContain('WASH alerts');
    auth.canViewWash.and.returnValue(true);
    const again = TestBed.createComponent(NotificationSettingsComponent);
    again.detectChanges();
    expect(again.nativeElement.querySelectorAll('.ns-pref input').length).toBe(4);
    expect(again.nativeElement.textContent).toContain('WASH alerts');
  });
});
