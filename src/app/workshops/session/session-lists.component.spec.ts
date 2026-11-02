import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { of } from 'rxjs';
import { SessionListsComponent } from './session-lists.component';
import { WorkshopService } from '../workshop.service';
import { NotificationService } from '../../core/notification.service';
import { GateFeedbackService } from '../../core/gate-feedback.service';
import { SessionLists, WorkshopEntry } from '../workshops.model';

const pass = (id: string, name: string, extra: any = {}) => ({
  _id: id, name, email: `${id}@example.com`, phone_no: '9', order_id: 100, passTypeName: 'Festival Pass',
  isAdmitted: true, band: { _id: 'b' + id, code: 'BIG7:' + id }, ...extra
});
const entry = (id: string, list: any, name: string, extra: Partial<WorkshopEntry> = {}): WorkshopEntry => ({
  _id: id, session: 's1', pass: pass('p' + id, name), list, position: 1, late: false,
  addedBy: null, addedAt: '', attendedAt: null, attendedBy: null, ...extra
});
const counts = { pre: 1, wait: 1, walkin: 0, attended: 0, limit: 1, capacity: 30 };
const lists = (extra: Partial<SessionLists> = {}): SessionLists => ({
  session: {
    _id: 's1', event: 'e1', workshop: { _id: 'w1', title: 'Hand Drumming', facilitators: [] },
    venue: { _id: 'v1', name: 'Bamboo Dome', capacity: 30 }, start: new Date().toISOString(), end: new Date().toISOString(),
    regOpensAt: null, regClosesAt: null, regManual: null, cutoffAt: null, preRegLimit: 1, facilitatorsOverride: [], status: 'scheduled'
  } as any,
  entries: [entry('e1', 'pre', 'Asha Rao'), entry('e2', 'wait', 'Ben Ito')],
  counts, registrationOpen: true, ...extra
});

describe('SessionListsComponent', () => {
  let fixture: ComponentFixture<SessionListsComponent>;
  let component: SessionListsComponent;
  let service: jasmine.SpyObj<WorkshopService>;
  let gate: jasmine.SpyObj<GateFeedbackService>;
  let dialog: jasmine.SpyObj<MatDialog>;
  let notify: jasmine.SpyObj<NotificationService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('WorkshopService', ['getLists', 'searchPasses', 'addToList', 'removeFromList', 'door', 'letIn']);
    service.getLists.and.callFake(() => Promise.resolve(lists()));
    gate = jasmine.createSpyObj('GateFeedbackService', ['unlock', 'found', 'notFound', 'error']);
    dialog = jasmine.createSpyObj('MatDialog', ['open']);
    notify = jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']);
    await TestBed.configureTestingModule({
      declarations: [SessionListsComponent],
      imports: [FormsModule],
      providers: [
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => 's1' }, queryParamMap: { get: () => null } } } },
        { provide: WorkshopService, useValue: service },
        { provide: MatDialog, useValue: dialog },
        { provide: NotificationService, useValue: notify },
        { provide: GateFeedbackService, useValue: gate }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(SessionListsComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const el = () => fixture.nativeElement as HTMLElement;

  it('shows the session, its counts and the lists in order', fakeAsync(() => {
    start();
    expect(service.getLists).toHaveBeenCalledWith('s1');
    expect(el().querySelector('.page-ph-title')!.textContent).toContain('Hand Drumming');
    expect(component.pre.map(e => e.pass!.name)).toEqual(['Asha Rao']);
    expect(component.wait.map(e => e.pass!.name)).toEqual(['Ben Ito']);
    expect(el().textContent).toContain('Pre-registration open');
  }));

  it('a scanned band is added to the list (List tab), with the Found sound', fakeAsync(() => {
    start();
    dialog.open.and.returnValue({ afterClosed: () => of('https://wallet.example/pay?eventid=BIG7&tagid=Z1') } as any);
    service.addToList.and.returnValue(Promise.resolve({ entry: entry('e9', 'pre', 'Zara Khan'), list: 'pre', warnings: [], counts }));
    component.scan();
    flushMicrotasks();
    expect(dialog.open.calls.mostRecent().args[1]!.data).toEqual(jasmine.objectContaining({ mode: 'raw' }));
    expect(service.addToList).toHaveBeenCalledWith('s1', { raw: 'https://wallet.example/pay?eventid=BIG7&tagid=Z1' });
    expect(gate.found).toHaveBeenCalled();
    expect(component.outcome!.title).toBe('Added to the list');
  }));

  it('past the limit, says they went on the waitlist', fakeAsync(() => {
    start();
    service.addToList.and.returnValue(Promise.resolve({ entry: entry('e9', 'wait', 'Zara Khan'), list: 'wait', warnings: ['Already on another session of Hand Drumming'], counts }));
    component.act({ passId: 'p9' });
    flushMicrotasks();
    expect(component.outcome!.title).toContain('waitlist');
    expect(component.outcome!.warnings).toEqual(['Already on another session of Hand Drumming']);
  }));

  it('the door: on the list → let in; a walk-in can be let in now', fakeAsync(() => {
    start();
    component.setTab('door');
    service.door.and.returnValue(Promise.resolve({ result: 'admitted', entry: entry('e1', 'pre', 'Asha Rao', { attendedAt: new Date().toISOString() }), warnings: [], counts }));
    component.act({ passId: 'pe1' });
    flushMicrotasks();
    expect(service.door).toHaveBeenCalledWith('s1', { passId: 'pe1' });
    expect(component.outcome!.title).toBe('Let in');
    expect(gate.found).toHaveBeenCalled();

    const walk = entry('e5', 'walkin', 'Zara Khan');
    service.door.and.returnValue(Promise.resolve({ result: 'walkin', entry: walk, warnings: [], counts }));
    component.act({ passId: 'p5' });
    flushMicrotasks();
    expect(component.outcome!.letIn).toBe(walk);
    expect(gate.notFound).toHaveBeenCalled();

    service.letIn.and.returnValue(Promise.resolve({ result: 'admitted', entry: { ...walk, attendedAt: new Date().toISOString() }, warnings: [], counts }));
    component.letIn(walk);
    flushMicrotasks();
    expect(service.letIn).toHaveBeenCalledWith('s1', 'e5');
    expect(component.outcome!.title).toBe('Let in');
  }));

  it('after the cut-off, someone from the list who comes late is told they lost their place', fakeAsync(() => {
    start();
    component.setTab('door');
    service.door.and.returnValue(Promise.resolve({ result: 'late', entry: entry('e1', 'walkin', 'Asha Rao', { late: true }), warnings: [], counts }));
    component.act({ passId: 'pe1' });
    flushMicrotasks();
    expect(component.outcome!.title).toBe('Came after the cut-off');
    expect(component.outcome!.letInLabel).toBe('Let in now');
  }));

  it('a replaced band is flagged; "Checked: continue" sends it again, confirmed', fakeAsync(() => {
    start();
    service.addToList.and.returnValue(Promise.reject({ status: 409, error: {
      state: 'replaced', message: 'This band was replaced. It belonged to Asha Rao.', owner: { name: 'Asha Rao' }, reason: 'Lost', currentCode: 'BIG7:N1'
    } }));
    component.act({ raw: 'OLD' });
    flushMicrotasks();
    expect(component.outcome!.flag!.band.owner!.name).toBe('Asha Rao');
    service.addToList.and.returnValue(Promise.resolve({ entry: entry('e9', 'pre', 'Asha Rao'), list: 'pre', warnings: [], counts }));
    component.continueFlagged();
    flushMicrotasks();
    expect(service.addToList.calls.mostRecent().args[1]).toEqual({ raw: 'OLD', confirmReplaced: true });
  }));

  it('not admitted / unknown band / connection trouble each say so, with the right sound', fakeAsync(() => {
    start();
    service.addToList.and.returnValue(Promise.reject({ status: 400, error: { state: 'not_admitted', message: "Dev hasn't been admitted at the gate yet" } }));
    component.act({ passId: 'x' });
    flushMicrotasks();
    expect(component.outcome!.title).toBe('Not admitted at the gate');
    service.addToList.and.returnValue(Promise.reject({ status: 0 }));
    component.act({ passId: 'x' });
    flushMicrotasks();
    expect(component.outcome!.title).toBe('Could not check');
    expect(gate.error).toHaveBeenCalled();
  }));

  it('search waits for 2 letters, then lists people; picking one acts on them', fakeAsync(() => {
    start();
    service.searchPasses.and.returnValue(Promise.resolve({ passes: [pass('p7', 'Chen Wu')] }));
    component.onSearch('c');
    tick(400);
    expect(service.searchPasses).not.toHaveBeenCalled();
    component.onSearch('che');
    tick(400);
    flushMicrotasks();
    expect(service.searchPasses).toHaveBeenCalledWith('e1', 'che');
    expect(component.results.length).toBe(1);
    service.addToList.and.returnValue(Promise.resolve({ entry: entry('e7', 'pre', 'Chen Wu'), list: 'pre', warnings: [], counts }));
    component.pick(component.results[0]);
    flushMicrotasks();
    expect(service.addToList).toHaveBeenCalledWith('s1', { passId: 'p7' });
  }));

  it('removing someone reports who moved up from the waitlist', fakeAsync(() => {
    start();
    service.removeFromList.and.returnValue(Promise.resolve({ promoted: ['Ben Ito'], counts }));
    component.remove(component.pre[0]);
    flushMicrotasks();
    expect(notify.openSucessSnackBar).toHaveBeenCalledWith('Asha Rao. Ben Ito moved up from the waitlist.');
  }));

  it('with registration closed, the list tab says so and adding is disabled', fakeAsync(() => {
    service.getLists.and.callFake(() => Promise.resolve(lists({ registrationOpen: false })));
    start();
    expect(el().textContent).toContain('Pre-registration is closed for this session');
    expect((el().querySelector('.sl-scan') as HTMLButtonElement).disabled).toBeTrue();
  }));
});
