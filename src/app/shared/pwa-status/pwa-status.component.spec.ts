import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { PwaStatusComponent } from './pwa-status.component';
import { PwaService } from '../../core/pwa.service';
import { PushService } from '../../core/push.service';
import { AuthService } from '../../core/auth.service';

describe('PwaStatusComponent', () => {
  let fixture: ComponentFixture<PwaStatusComponent>;
  let pwa: any;
  let push: any;
  let user$: BehaviorSubject<any>;
  const text = () => (fixture.nativeElement as HTMLElement).textContent || '';
  const button = (label: string) => Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'))
    .find(b => b.textContent?.trim() === label || b.getAttribute('aria-label') === label) as HTMLButtonElement | undefined;

  beforeEach(() => {
    pwa = {
      online$: new BehaviorSubject(true),
      updateReady$: new BehaviorSubject(false),
      canInstall$: new BehaviorSubject(false),
      showIosHint$: new BehaviorSubject(false),
      reload: jasmine.createSpy('reload'),
      install: jasmine.createSpy('install'),
      dismissInstall: jasmine.createSpy('dismissInstall'),
      dismissIosHint: jasmine.createSpy('dismissIosHint'),
    };
    push = {
      state$: new BehaviorSubject('off'),
      config$: new BehaviorSubject({ enabled: true }),
      load: jasmine.createSpy('load').and.resolveTo(null),
      enable: jasmine.createSpy('enable').and.resolveTo('on'),
      promptDismissed: jasmine.createSpy('promptDismissed').and.returnValue(false),
      dismissPrompt: jasmine.createSpy('dismissPrompt'),
    };
    user$ = new BehaviorSubject<any>(null);
    TestBed.configureTestingModule({
      declarations: [PwaStatusComponent],
      providers: [
        { provide: PwaService, useValue: pwa },
        { provide: PushService, useValue: push },
        { provide: AuthService, useValue: { user: user$ } },
      ]
    });
    fixture = TestBed.createComponent(PwaStatusComponent);
    fixture.detectChanges();
  });

  it('shows nothing when online, up to date and not installable', () => {
    expect(fixture.nativeElement.querySelectorAll('.pwa-note').length).toBe(0);
  });

  it('shows the Offline notice while offline', () => {
    pwa.online$.next(false); fixture.detectChanges();
    expect(text()).toContain('Offline.');
  });

  it('offers Reload when a new version is ready', () => {
    pwa.updateReady$.next(true); fixture.detectChanges();
    expect(text()).toContain('New version available');
    button('Reload')!.click();
    expect(pwa.reload).toHaveBeenCalled();
  });

  it('offers Install, and remembers "don\'t show again"', () => {
    pwa.canInstall$.next(true); fixture.detectChanges();
    button('Install')!.click();
    expect(pwa.install).toHaveBeenCalled();
    button("Don't show again")!.click();
    expect(pwa.dismissInstall).toHaveBeenCalled();
  });

  it('shows the iPhone "Add to Home Screen" hint, which can be dismissed', () => {
    pwa.showIosHint$.next(true); fixture.detectChanges();
    expect(text()).toContain('Add to Home Screen');
    button("Don't show again")!.click();
    expect(pwa.dismissIosHint).toHaveBeenCalled();
  });

  describe('one-time "Turn on notifications" prompt', () => {
    const signIn = () => { user$.next({ name: 'Maya' }); fixture.detectChanges(); };

    it('is hidden when signed out', () => {
      expect(text()).not.toContain('Get BiG notifications');
    });

    it('shows once signed in, loads the push settings, and turning on dismisses it for good', async () => {
      signIn();
      expect(push.load).toHaveBeenCalled();
      expect(text()).toContain('Get BiG notifications');
      await fixture.componentInstance.turnOnPush();
      fixture.detectChanges();
      expect(push.enable).toHaveBeenCalled();
      expect(push.dismissPrompt).toHaveBeenCalled();
      expect(text()).not.toContain('Get BiG notifications');
    });

    it('stays hidden after it was dismissed before', () => {
      push.promptDismissed.and.returnValue(true);
      fixture = TestBed.createComponent(PwaStatusComponent);
      fixture.detectChanges();
      signIn();
      expect(text()).not.toContain('Get BiG notifications');
    });

    it('is hidden when the device already has notifications on, or cannot have them', () => {
      signIn();
      push.state$.next('on'); fixture.detectChanges();
      expect(text()).not.toContain('Get BiG notifications');
      push.state$.next('ios-needs-install'); fixture.detectChanges();
      expect(text()).not.toContain('Get BiG notifications');
    });

    it('is hidden when the server has push turned off', () => {
      signIn();
      push.config$.next({ enabled: false }); fixture.detectChanges();
      expect(text()).not.toContain('Get BiG notifications');
    });
  });

  it('sits below the phone menu bar when asked to', () => {
    fixture.componentInstance.belowTopbar = true; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pwa-stack').classList).toContain('below-topbar');
  });
});
