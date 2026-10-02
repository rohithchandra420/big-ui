import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';

import { ConfirmationService } from './confirmation.service';
import { ConfirmDialogComponent } from './confirm-dialog.component';

describe('ConfirmationService', () => {
  let service: ConfirmationService;
  let dialogSpy: jasmine.SpyObj<MatDialog>;

  beforeEach(() => {
    dialogSpy = jasmine.createSpyObj('MatDialog', ['open']);

    TestBed.configureTestingModule({
      providers: [
        ConfirmationService,
        { provide: MatDialog, useValue: dialogSpy },
      ]
    });
    service = TestBed.inject(ConfirmationService);
  });

  it('opens ConfirmDialogComponent with the given data and a 420px width', () => {
    dialogSpy.open.and.returnValue({ afterClosed: () => of(true) } as any);
    const data = { title: 'Delete item', message: 'Are you sure?' };

    service.confirm(data).subscribe();

    expect(dialogSpy.open).toHaveBeenCalledWith(ConfirmDialogComponent, { width: '420px', data });
  });

  it('maps a confirmed result to true', (done) => {
    dialogSpy.open.and.returnValue({ afterClosed: () => of(true) } as any);
    service.confirm({ title: 't', message: 'm' }).subscribe(result => {
      expect(result).toBeTrue();
      done();
    });
  });

  it('maps a cancelled result (false) to false', (done) => {
    dialogSpy.open.and.returnValue({ afterClosed: () => of(false) } as any);
    service.confirm({ title: 't', message: 'm' }).subscribe(result => {
      expect(result).toBeFalse();
      done();
    });
  });

  it('maps a dismissed result (undefined, e.g. Esc/backdrop) to false', (done) => {
    dialogSpy.open.and.returnValue({ afterClosed: () => of(undefined) } as any);
    service.confirm({ title: 't', message: 'm' }).subscribe(result => {
      expect(result).toBeFalse();
      done();
    });
  });
});
