import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { TaskSheetComponent } from './task-sheet.component';
import { TaskPillComponent } from './task-pill.component';
import { Router } from '@angular/router';
import { Task, TaskService } from '../../core/task.service';

describe('TaskSheetComponent', () => {
  let fixture: ComponentFixture<TaskSheetComponent>;
  let component: TaskSheetComponent;
  let service: jasmine.SpyObj<TaskService>;
  const el = () => fixture.nativeElement as HTMLElement;
  const buttons = () => Array.from(el().querySelectorAll('.tk-act')).map(b => b.lastChild!.textContent!.trim());

  const task = (extra: Partial<Task> = {}): Task => ({
    _id: 't1', title: 'Water Station C is empty', message: 'Please refill.', createdAt: '2026-11-14T09:00:00Z',
    from: 'Ilina', roles: [], departments: [{ _id: 'd1', name: 'WASH' }], status: 'new',
    history: [{ status: 'new', note: '', at: '2026-11-14T09:00:00Z', by: 'Ilina' }], canChange: true, ...extra
  });

  const open = async (t: Task) => {
    service.get.and.resolveTo(t);
    fixture.componentRef.setInput('taskId', t._id);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = jasmine.createSpyObj('TaskService', ['get', 'setStatus']);
    TestBed.configureTestingModule({
      imports: [FormsModule, MatIconModule],
      declarations: [TaskSheetComponent, TaskPillComponent],
      providers: [{ provide: TaskService, useValue: service }]
    });
    fixture = TestBed.createComponent(TaskSheetComponent);
    component = fixture.componentInstance;
  });

  it('loads the task and offers every other status except New', async () => {
    const seen: Task[] = [];
    component.changed.subscribe(t => seen.push(t));
    await open(task());
    expect(service.get).toHaveBeenCalledWith('t1');
    expect(buttons()).toEqual(['Acknowledged', 'In Progress', 'Blocked', 'Closed']);
    expect(el().querySelector('.tk-shared')!.textContent).toContain('WASH');
    expect(seen.length).toBe(1);
  });

  it('shows the timeline newest first, with the Blocked note', async () => {
    await open(task({ status: 'blocked', history: [
      { status: 'new', note: '', at: '2026-11-14T09:00:00Z', by: 'Ilina' },
      { status: 'blocked', note: 'Tap is broken', at: '2026-11-14T09:30:00Z', by: 'Keya' }
    ] }));
    const rows = Array.from(el().querySelectorAll('.tk-tl li'));
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('Blocked');
    expect(rows[0].textContent).toContain('Keya');
    expect(rows[0].querySelector('q')!.textContent).toBe('Tap is broken');
  });

  it('saves a plain status at once', async () => {
    await open(task());
    service.setStatus.and.resolveTo(task({ status: 'acknowledged' }));
    component.pick('acknowledged');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.setStatus).toHaveBeenCalledWith('t1', 'acknowledged', '');
    expect(component.task!.status).toBe('acknowledged');
    expect(buttons()).not.toContain('Acknowledged');
  });

  it('asks what is blocking it, and refuses an empty note', async () => {
    await open(task());
    component.pick('blocked');
    fixture.detectChanges();
    expect(el().querySelector('.tk-block')).not.toBeNull();
    expect(service.setStatus).not.toHaveBeenCalled();
    component.note = '   ';
    component.confirmBlock();
    expect(component.error).toBe('Say what is blocking it.');
    expect(service.setStatus).not.toHaveBeenCalled();
    service.setStatus.and.resolveTo(task({ status: 'blocked' }));
    component.note = ' Waiting for the tanker ';
    component.confirmBlock();
    await fixture.whenStable();
    expect(service.setStatus).toHaveBeenCalledWith('t1', 'blocked', 'Waiting for the tanker');
    expect(component.blocking).toBeFalse();
  });

  it('offers only Reopen on a Closed task to someone who may reopen it', async () => {
    await open(task({ status: 'closed', canChange: true }));
    expect(buttons()).toEqual(['Reopen']);
    service.setStatus.and.resolveTo(task({ status: 'in_progress' }));
    (el().querySelector('.tk-act') as HTMLButtonElement).click();
    expect(service.setStatus).toHaveBeenCalledWith('t1', 'in_progress', '');
  });

  it('shows no buttons to someone who cannot change it', async () => {
    await open(task({ status: 'closed', canChange: false }));
    expect(buttons()).toEqual([]);
    expect(el().textContent).toContain('Helpdesk can reopen it');
    await open(task({ _id: 't2', status: 'new', canChange: false }));
    expect(buttons()).toEqual([]);
    expect(el().textContent).toContain('Only the receiving department changes it');
  });

  it('shows the server message when a change is refused', async () => {
    await open(task());
    service.setStatus.and.rejectWith({ status: 403, error: { message: 'Only Helpdesk can reopen a closed task' } });
    component.pick('closed');
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.tk-error')!.textContent).toContain('Only Helpdesk can reopen a closed task');
    expect(component.saving).toBeFalse();
  });

  it('says so when the task cannot be loaded', async () => {
    service.get.and.rejectWith(new Error('offline'));
    fixture.componentRef.setInput('taskId', 't9');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(el().querySelector('.tk-error')!.textContent).toContain('Could not load this task');
  });

  describe('place (HD3)', () => {
    it('shows the place and opens the Venue Map on it', async () => {
      const nav = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      await open(task({ place: { kind: 'pin', id: 'p1', event: 'e1', name: 'Water Station C' } }));
      expect(el().querySelector('.tk-place')!.textContent).toContain('Water Station C');
      (el().querySelector('.tk-place-go') as HTMLElement).click();
      expect(nav).toHaveBeenCalledWith(['/venue-map'], { queryParams: { pin: 'p1' } });
    });

    it('an area opens by ?area', async () => {
      const nav = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
      await open(task({ place: { kind: 'area', id: 'ar1', event: 'e1', name: 'Washroom North' } }));
      (el().querySelector('.tk-place-go') as HTMLElement).click();
      expect(nav).toHaveBeenCalledWith(['/venue-map'], { queryParams: { area: 'ar1' } });
    });

    it('a deleted place stays as text, without the map button', async () => {
      await open(task({ place: { kind: 'pin', id: null, event: 'e1', name: 'Main Stage' } }));
      expect(el().querySelector('.tk-place')!.textContent).toContain('Main Stage');
      expect(el().querySelector('.tk-place')!.textContent).toContain('no longer on the map');
      expect(el().querySelector('.tk-place-go')).toBeNull();
    });

    it('no place, no line', async () => {
      await open(task());
      expect(el().querySelector('.tk-place')).toBeNull();
    });
  });
});
