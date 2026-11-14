import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { TASK_NOTE_MAX, TASK_STATUSES, Task, TaskChange, TaskService, TaskStatus, TaskStatusMeta, taskStatusMeta } from '../../core/task.service';

interface TimelineRow extends TaskChange { meta: TaskStatusMeta; }

/**
 * A Task's status, the buttons that move it on, and its timeline (Helpdesk,
 * HD1). Used inside the Billboard note and the task panel. Loads the task
 * itself, so it always shows the shared status as it is now.
 */
@Component({
  selector: 'app-task-sheet',
  templateUrl: './task-sheet.component.html'
})
export class TaskSheetComponent implements OnChanges {
  @Input() taskId = '';
  /** The task as loaded, and again after every change made here. */
  @Output() changed = new EventEmitter<Task>();

  readonly noteMax = TASK_NOTE_MAX;
  task: Task | null = null;
  /** Stored lists (stable identities for *ngFor). */
  next: TaskStatusMeta[] = [];
  timeline: TimelineRow[] = [];
  sharedWith = '';
  loading = false;
  saving = false;
  blocking = false;
  note = '';
  error = '';

  constructor(private tasks: TaskService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['taskId']) this.load();
  }

  async load(): Promise<void> {
    this.task = null;
    this.blocking = false;
    this.note = '';
    this.error = '';
    if (!this.taskId) return;
    const id = this.taskId;
    this.loading = true;
    try {
      const t = await this.tasks.get(id);
      if (this.taskId === id) this.show(t);
    } catch {
      if (this.taskId === id) this.error = 'Could not load this task. Check your connection and open it again.';
    } finally {
      if (this.taskId === id) this.loading = false;
    }
  }

  private show(t: Task): void {
    this.task = t;
    // A Closed task is reopened (Helpdesk / top roles); anything else moves to any other status.
    this.next = !t.canChange ? []
      : t.status === 'closed' ? TASK_STATUSES.filter(s => s.value === 'in_progress')
      : TASK_STATUSES.filter(s => s.value !== 'new' && s.value !== t.status);
    this.timeline = [...t.history].reverse().map(h => ({ ...h, meta: taskStatusMeta(h.status) }));
    this.sharedWith = t.departments.map(d => d.name).join(', ');
    this.changed.emit(t);
  }

  label(s: TaskStatusMeta): string {
    return this.task?.status === 'closed' ? 'Reopen' : s.label;
  }

  pick(status: TaskStatus): void {
    this.error = '';
    if (status === 'blocked') {
      this.blocking = true;
      return;
    }
    this.save(status);
  }

  cancelBlock(): void {
    this.blocking = false;
    this.note = '';
    this.error = '';
  }

  confirmBlock(): void {
    if (!this.note.trim()) {
      this.error = 'Say what is blocking it.';
      return;
    }
    this.save('blocked', this.note.trim());
  }

  private async save(status: TaskStatus, note = ''): Promise<void> {
    if (!this.task || this.saving) return;
    this.saving = true;
    this.error = '';
    try {
      this.show(await this.tasks.setStatus(this.task._id, status, note));
      this.blocking = false;
      this.note = '';
    } catch (e: any) {
      this.error = e?.error?.message || 'Could not change the status. Try again.';
      // Someone else changed it first: show what it is now.
      if (e?.status === 409) this.tasks.get(this.task._id).then(t => this.show(t)).catch(() => { });
    } finally {
      this.saving = false;
    }
  }

  trackByValue(_: number, s: TaskStatusMeta): string { return s.value; }
  trackByIndex(i: number): number { return i; }
}
