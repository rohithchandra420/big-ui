import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { PwaStatusComponent } from './pwa-status.component';
import { PwaService } from '../../core/pwa.service';

describe('PwaStatusComponent', () => {
  let fixture: ComponentFixture<PwaStatusComponent>;
  let pwa: any;
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
    TestBed.configureTestingModule({ declarations: [PwaStatusComponent], providers: [{ provide: PwaService, useValue: pwa }] });
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

  it('sits below the phone menu bar when asked to', () => {
    fixture.componentInstance.belowTopbar = true; fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.pwa-stack').classList).toContain('below-topbar');
  });
});
