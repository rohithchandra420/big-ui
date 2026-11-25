import { BreakpointObserver, BreakpointState } from '@angular/cdk/layout';
import { Subject } from 'rxjs';

import { ViewModeService } from './view-mode.service';

describe('ViewModeService (phone cards)', () => {
  let state$: Subject<BreakpointState>;
  let phoneNow: boolean;
  let service: ViewModeService;

  const make = () => {
    const bp = {
      isMatched: () => phoneNow,
      observe: () => state$.asObservable()
    } as unknown as BreakpointObserver;
    return new ViewModeService(bp);
  };

  beforeEach(() => {
    localStorage.removeItem('big.viewMode.test-page');
    localStorage.removeItem('big.viewMode.other-page');
    state$ = new Subject<BreakpointState>();
    phoneNow = true;
    service = make();
  });

  afterEach(() => {
    service.ngOnDestroy();
    localStorage.removeItem('big.viewMode.test-page');
    localStorage.removeItem('big.viewMode.other-page');
  });

  it('defaults to Cards on a phone', () => {
    expect(service.modeOf('test-page')).toBe('cards');
    expect(service.cards('test-page')).toBeTrue();
  });

  it('never shows cards on a wider screen, whatever the page is set to', () => {
    state$.next({ matches: false, breakpoints: {} });
    expect(service.isPhone).toBeFalse();
    expect(service.cards('test-page')).toBeFalse();
  });

  it('follows the screen width as it changes', () => {
    state$.next({ matches: false, breakpoints: {} });
    state$.next({ matches: true, breakpoints: {} });
    expect(service.cards('test-page')).toBeTrue();
  });

  it('keeps the choice per page', () => {
    service.setMode('test-page', 'table');
    expect(service.cards('test-page')).toBeFalse();
    expect(service.cards('other-page')).toBeTrue();
  });

  it('remembers the choice on this device', () => {
    service.setMode('test-page', 'table');
    const again = make();
    expect(again.modeOf('test-page')).toBe('table');
    again.ngOnDestroy();
  });
});
