import { Component, EventEmitter, Input, Output } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { TaskListComponent } from './task-list.component';
import { TaskPillComponent } from './task-pill.component';
import { Task, TaskService } from '../../core/task.service';

@Component({ selector: 'app-task-sheet', template: '' })
class TaskSheetStubComponent { @Input() taskId = ''; @Output() changed = new EventEmitter<Task>(); }

@Component({ selector: 'app-slide-panel', template: '<ng-content *ngIf="open"></ng-content>' })
class SlidePanelStubComponent {
  @Input() open = false; @Input() title = ''; @Input() subtitle = ''; @Input() icon = '';
  @Output() closed = new EventEmitter<void>();
}

describe('TaskListComponent', () => {
  let fixture: ComponentFixture<TaskListComponent>;
  let component: TaskListComponent;
  let service: jasmine.SpyObj<TaskService>;
  const el = () => fixture.nativeElement as HTMLElement;
  const titles = () => Array.from(el().querySelectorAll('.tk-row b')).map(b => b.textContent!.trim());
  const chip = (label: string) => Array.from(el().querySelectorAll<HTMLButtonElement>('.tk-chip')).find(c => c.textContent!.trim().startsWith(label))!;

  const task = (id: string, status: Task['status'], extra: Partial<Task> = {}): Task => ({
    _id: id, title: `Task ${id}`, message: 'Do it', createdAt: '2026-11-14T09:00:00Z', from: 'Ilina', roles: [],
    departments: [{ _id: 'd1', name: 'WASH' }], status,
    history: [{ status, note: '', at: '2026-11-14T09:00:00Z', by: 'Yuvan' }], canChange: true, ...extra
  });

  const show = async (department = '') => {
    fixture.componentRef.setInput('department', department);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  };

  beforeEach(() => {
    service = jasmine.createSpyObj('TaskService', ['list']);
    service.list.and.resolveTo([task('a', 'new'), task('b', 'in_progress'), task('c', 'closed')]);
    TestBed.configureTestingModule({
      imports: [MatIconModule],
      declarations: [TaskListComponent, TaskPillComponent, TaskSheetStubComponent, SlidePanelStubComponent],
      providers: [{ provide: TaskService, useValue: service }]
    });
    fixture = TestBed.createComponent(TaskListComponent);
    component = fixture.componentInstance;
  });

  it('loads the department\'s tasks and opens on the Open ones', async () => {
    await show('d1');
    expect(service.list).toHaveBeenCalledWith('d1');
    expect(titles()).toEqual(['Task a', 'Task b']);
    expect(chip('Open').textContent).toContain('2');
    expect(chip('All').textContent).toContain('3');
  });

  it('filters by status chip', async () => {
    await show('d1');
    chip('Closed').click();
    fixture.detectChanges();
    expect(titles()).toEqual(['Task c']);
    chip('Blocked').click();
    fixture.detectChanges();
    expect(titles()).toEqual([]);
    expect(el().textContent).toContain('Nothing here.');
  });

  it('opens a task in the panel and keeps the row in step with a change', async () => {
    await show('d1');
    (el().querySelector('.tk-row') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(component.open!._id).toBe('a');
    expect(el().querySelector('app-task-sheet')).not.toBeNull();
    component.onChanged(task('a', 'closed'));
    fixture.detectChanges();
    expect(titles()).toEqual(['Task b']);
    expect(chip('Closed').textContent).toContain('2');
  });

  it('hides the card when asked and there is no task at all', async () => {
    service.list.and.resolveTo([]);
    fixture.componentRef.setInput('hideWhenEmpty', true);
    await show('d1');
    expect(el().querySelector('.tk-card')).toBeNull();
  });

  it('shows nothing and asks nothing for the ALL reporting view', async () => {
    await show('ALL');
    expect(service.list).not.toHaveBeenCalled();
    expect(el().querySelector('.tk-card')).toBeNull();
  });

  it('loads every task once when used without a department', async () => {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(service.list).toHaveBeenCalledOnceWith('');
    expect(titles()).toEqual(['Task a', 'Task b']);
  });

  it('says so when the tasks cannot be loaded', async () => {
    service.list.and.rejectWith(new Error('offline'));
    await show('');
    expect(el().querySelector('.tk-error')!.textContent).toContain('Could not load the tasks');
  });
});
