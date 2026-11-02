import { TestBed } from '@angular/core/testing';
import { Router, UrlTree } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, firstValueFrom } from 'rxjs';
import { WorkshopReadGuard, WorkshopRunGuard } from './workshop-run.guard';
import { AuthService } from '../core/auth.service';

describe('WorkshopRunGuard', () => {
  let user$: BehaviorSubject<any>;
  let canRun: boolean;
  let guard: WorkshopRunGuard;

  beforeEach(() => {
    user$ = new BehaviorSubject<any>({ role: 'VOL' });
    canRun = true;
    TestBed.configureTestingModule({
      imports: [RouterTestingModule],
      providers: [{ provide: AuthService, useValue: { user: user$, canRunWorkshops: () => canRun, canReadWorkshops: () => canRun } }]
    });
    guard = TestBed.inject(WorkshopRunGuard);
  });

  const go = async () => {
    const r = await firstValueFrom(guard.canActivate());
    return r instanceof UrlTree ? TestBed.inject(Router).serializeUrl(r) : r;
  };

  it('lets the Workshop team in', async () => {
    expect(await go()).toBeTrue();
  });

  it('sends others back to the Planner, and signed-out people to login', async () => {
    canRun = false;
    expect(await go()).toBe('/workshops');
    user$.next(null);
    expect(await go()).toBe('/login');
  });

  it('Reports: the read guard follows canReadWorkshops', async () => {
    const read = TestBed.inject(WorkshopReadGuard);
    expect(await firstValueFrom(read.canActivate())).toBeTrue();
    canRun = false;
    const r = await firstValueFrom(read.canActivate());
    expect(TestBed.inject(Router).serializeUrl(r as UrlTree)).toBe('/workshops');
  });
});
