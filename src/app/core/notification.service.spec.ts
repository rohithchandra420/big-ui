import { MatSnackBar } from '@angular/material/snack-bar';

import { NotificationService, SUCCESS_TOAST_MS, toastText } from './notification.service';
import { AppToastComponent } from '../shared/app-toast/app-toast.component';

describe('NotificationService (B-043)', () => {
  let bar: jasmine.SpyObj<MatSnackBar>;
  let svc: NotificationService;

  beforeEach(() => {
    bar = jasmine.createSpyObj('MatSnackBar', ['openFromComponent']);
    svc = new NotificationService(bar);
  });

  it('success closes by itself after a few seconds', () => {
    svc.openSucessSnackBar('Saved');
    const [comp, cfg] = bar.openFromComponent.calls.mostRecent().args as any[];
    expect(comp).toBe(AppToastComponent);
    expect(cfg.data).toEqual({ kind: 'success', message: 'Saved', duration: SUCCESS_TOAST_MS });
    expect(cfg.duration).toBeUndefined();
  });

  it('an error stays until closed', () => {
    svc.openErrorSnackBar('Could not save');
    const cfg = bar.openFromComponent.calls.mostRecent().args[1] as any;
    expect(cfg.data).toEqual({ kind: 'error', message: 'Could not save', duration: 0 });
  });

  it('shows the text of an Error, never "Error: …"', () => {
    expect(toastText(new Error('Invalid credentials'))).toBe('Invalid credentials');
    expect(toastText({ message: 'From the server' })).toBe('From the server');
    expect(toastText('Plain')).toBe('Plain');
  });
});
