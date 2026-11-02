import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { WorkshopReportsComponent } from './workshop-reports.component';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { WorkshopService } from '../workshop.service';
import { ReportPerson, SessionReport, WorkshopReports } from '../workshops.model';

const nums = { pre: 3, wait: 1, walkin: 2, attended: 4, attendedFromList: 2, attendedFromWait: 1, walkinAttended: 1, late: 1, noShows: 1 };
const music = { _id: 'c1', name: 'Music', colour: '#7c3aed', icon: 'music_note' };
const session = (id: string, title: string, extra: Partial<SessionReport> = {}): SessionReport => ({
  _id: id, start: new Date(2027, 0, 15, 10).toISOString(), end: new Date(2027, 0, 15, 11).toISOString(), status: 'scheduled',
  workshop: { _id: 'w-' + title, title, category: music }, venue: { _id: 'v1', name: 'Bamboo Dome', capacity: 40 },
  limit: 30, over: true, ...nums, ...extra
});
const report = (): WorkshopReports => ({
  event: { _id: 'e1', name: 'BiG 7.0' },
  sessions: [session('s1', 'Hand Drumming'), session('s2', 'Clay', { venue: { _id: 'v2', name: 'River Deck', capacity: 10 } })],
  workshops: [{ _id: 'w-Clay', title: 'Clay', category: music, sessions: 1, ...nums }, { _id: 'w-Hand Drumming', title: 'Hand Drumming', category: music, sessions: 1, ...nums }],
  totals: { sessions: 2, ...nums, attended: 8, noShows: 2 }
});
const person = (name: string, sessionId: string, workshopId: string, attendedAt: string | null): ReportPerson => ({
  _id: name, pass: { _id: 'p' + name, name, email: '', phone_no: '', order_id: 1 }, list: 'pre', late: false, position: 1, attendedAt, addedAt: '',
  session: { _id: sessionId, start: new Date(2027, 0, 15, 10).toISOString(), end: '', workshop: { _id: workshopId, title: '' }, venue: { _id: 'v1', name: 'Bamboo Dome' } }
});

describe('WorkshopReportsComponent', () => {
  let fixture: ComponentFixture<WorkshopReportsComponent>;
  let component: WorkshopReportsComponent;
  let service: jasmine.SpyObj<WorkshopService>;

  beforeEach(async () => {
    service = jasmine.createSpyObj('WorkshopService', ['getReports', 'getReportPeople']);
    service.getReports.and.callFake(() => Promise.resolve(report()));
    await TestBed.configureTestingModule({
      declarations: [WorkshopReportsComponent],
      imports: [FormsModule],
      providers: [
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject<any>({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
        { provide: WorkshopService, useValue: service }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(WorkshopReportsComponent);
    component = fixture.componentInstance;
  });

  const start = () => { fixture.detectChanges(); flushMicrotasks(); fixture.detectChanges(); };
  const rows = () => fixture.nativeElement.querySelectorAll('table.tbl tbody tr') as NodeListOf<HTMLElement>;

  it('shows the totals and one row per session', fakeAsync(() => {
    start();
    expect(service.getReports).toHaveBeenCalledWith('e1');
    const stats = fixture.nativeElement.querySelector('.stat-row').textContent;
    expect(stats).toContain('8');   // attended
    expect(stats).toContain('No-shows');
    expect(rows().length).toBe(2);
    expect(rows()[0].textContent).toContain('Hand Drumming');
  }));

  it('switches to one row per workshop, and searches', fakeAsync(() => {
    start();
    component.setView('workshop');
    fixture.detectChanges();
    expect(rows().length).toBe(2);
    component.search = 'clay';
    component.applySearch();
    fixture.detectChanges();
    expect(rows().length).toBe(1);
    expect(rows()[0].textContent).toContain('Clay');
  }));

  it('a session row opens the panel with who came', fakeAsync(() => {
    start();
    service.getReportPeople.and.returnValue(Promise.resolve({ people: [person('Asha Rao', 's1', 'w-Hand Drumming', new Date().toISOString()), person('Chen Wu', 's1', 'w-Hand Drumming', null)] }));
    rows()[0].click();
    flushMicrotasks();
    fixture.detectChanges();
    expect(service.getReportPeople).toHaveBeenCalledWith('e1', 's1');
    const panel = fixture.nativeElement.querySelector('.panel.open').textContent;
    expect(panel).toContain('Asha Rao');
    expect(panel).toContain("Didn't come");
  }));

  it('a workshop row shows the people of all its sessions', fakeAsync(() => {
    start();
    service.getReportPeople.and.returnValue(Promise.resolve({ people: [person('Asha Rao', 's1', 'w-Hand Drumming', null), person('Ben Ito', 's2', 'w-Clay', null)] }));
    component.setView('workshop');
    component.openWorkshop(component.workshops[0]);
    flushMicrotasks();
    expect(service.getReportPeople).toHaveBeenCalledWith('e1', undefined);
    expect(component.people.map(p => p.pass!.name)).toEqual(['Ben Ito']);
  }));

  it('turnout = share of the list that came', () => {
    expect(component.turnout({ pre: 4, attendedFromList: 3 })).toBe(75);
    expect(component.turnout({ pre: 0, attendedFromList: 0 })).toBe(0);
  });
});
