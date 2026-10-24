import { TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { Subject } from 'rxjs';
import { PwaService, IOS_HINT_DISMISSED_KEY, INSTALL_DISMISSED_KEY, UPDATE_CHECK_MS } from './pwa.service';

describe('PwaService', () => {
  let versionUpdates: Subject<VersionEvent>;
  let unrecoverable: Subject<any>;
  let swUpdate: jasmine.SpyObj<SwUpdate> & { isEnabled: boolean };

  const create = (enabled = true): PwaService => {
    versionUpdates = new Subject<VersionEvent>();
    unrecoverable = new Subject<any>();
    swUpdate = Object.assign(jasmine.createSpyObj('SwUpdate', ['checkForUpdate', 'activateUpdate']), {
      isEnabled: enabled, versionUpdates, unrecoverable
    });
    swUpdate.checkForUpdate.and.resolveTo(false);
    swUpdate.activateUpdate.and.resolveTo(true);
    TestBed.configureTestingModule({ providers: [PwaService, { provide: SwUpdate, useValue: swUpdate }] });
    const service = TestBed.inject(PwaService);
    spyOn(service, 'hardReload');
    return service;
  };

  beforeEach(() => {
    localStorage.removeItem(IOS_HINT_DISMISSED_KEY);
    localStorage.removeItem(INSTALL_DISMISSED_KEY);
  });
  afterEach(() => TestBed.inject(PwaService).ngOnDestroy());

  describe('connection', () => {
    it('follows the browser online / offline events', () => {
      const service = create();
      window.dispatchEvent(new Event('offline'));
      expect(service.online$.value).toBeFalse();
      window.dispatchEvent(new Event('online'));
      expect(service.online$.value).toBeTrue();
    });
  });

  describe('new version', () => {
    it('flags an update when a new version has been downloaded', () => {
      const service = create();
      versionUpdates.next({ type: 'VERSION_DETECTED', version: { hash: 'b' } } as VersionEvent);
      expect(service.updateReady$.value).toBeFalse();
      versionUpdates.next({ type: 'VERSION_READY', currentVersion: { hash: 'a' }, latestVersion: { hash: 'b' } } as VersionEvent);
      expect(service.updateReady$.value).toBeTrue();
    });

    it('reload() activates the new version, then reloads the page', async () => {
      const service = create();
      await service.reload();
      expect(swUpdate.activateUpdate).toHaveBeenCalled();
      expect(service.hardReload).toHaveBeenCalled();
    });

    it('reloads straight away when the cached app is broken beyond repair', () => {
      const service = create();
      unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'missing file' });
      expect(service.hardReload).toHaveBeenCalled();
    });

    it('asks for updates regularly, so long-open devices hear about releases', fakeAsync(() => {
      create();
      tick(UPDATE_CHECK_MS);
      expect(swUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
      discardPeriodicTasks();
    }));

    it('does nothing when the service worker is off (development)', fakeAsync(() => {
      const service = create(false);
      tick(UPDATE_CHECK_MS);
      service.checkForUpdate();
      expect(swUpdate.checkForUpdate).not.toHaveBeenCalled();
      discardPeriodicTasks();
    }));
  });

  describe('install (Android / desktop Chrome)', () => {
    const offer = () => {
      const event = Object.assign(new Event('beforeinstallprompt'), {
        prompt: jasmine.createSpy('prompt').and.resolveTo(),
        userChoice: Promise.resolve({ outcome: 'accepted' })
      });
      window.dispatchEvent(event);
      return event;
    };

    it('offers Install when the browser allows it, and shows the browser prompt on install()', async () => {
      const service = create();
      spyOn(service, 'isStandalone').and.returnValue(false);
      const event = offer();
      expect(service.canInstall$.value).toBeTrue();
      await service.install();
      expect(event.prompt).toHaveBeenCalled();
      expect(service.canInstall$.value).toBeFalse();
    });

    it('stays hidden after "don\'t show again"', () => {
      const service = create();
      spyOn(service, 'isStandalone').and.returnValue(false);
      offer();
      service.dismissInstall();
      expect(service.canInstall$.value).toBeFalse();
      offer();
      expect(service.canInstall$.value).toBeFalse();
    });

    it('is not offered inside the installed app', () => {
      const service = create();
      spyOn(service, 'isStandalone').and.returnValue(true);
      offer();
      expect(service.canInstall$.value).toBeFalse();
    });

    it('hides once the app has been installed', () => {
      const service = create();
      spyOn(service, 'isStandalone').and.returnValue(false);
      offer();
      window.dispatchEvent(new Event('appinstalled'));
      expect(service.canInstall$.value).toBeFalse();
    });
  });

  describe('iPhone hint', () => {
    it('is shown on iPhone Safari until dismissed, and stays dismissed', () => {
      spyOn(PwaService.prototype, 'isIos').and.returnValue(true);
      spyOn(PwaService.prototype, 'isStandalone').and.returnValue(false);
      const service = create();
      expect(service.showIosHint$.value).toBeTrue();
      service.dismissIosHint();
      expect(service.showIosHint$.value).toBeFalse();
      expect(localStorage.getItem(IOS_HINT_DISMISSED_KEY)).toBe('1');
    });

    it('is not shown on other devices or inside the installed app', () => {
      spyOn(PwaService.prototype, 'isIos').and.returnValue(true);
      spyOn(PwaService.prototype, 'isStandalone').and.returnValue(true);
      expect(create().showIosHint$.value).toBeFalse();
    });
  });
});
