import { Component, Input, OnChanges, OnInit, SimpleChanges } from '@angular/core';
import { TASK_STATUSES, Task, TaskService, taskStatusMeta } from '../../core/task.service';

type Filter = 'open' | 'all' | Task['status'];
interface Chip { value: Filter; label: string; count: number; }
interface Row { task: Task; line: string; }

/**
 * A list of Tasks with status chips; a row opens the task in a side panel
 * (Helpdesk, HD1). With `department`: that department's tasks (My Department).
 * Without: every task (Announcements — Helpdesk and top roles).
 */
@Component({
  selector: 'app-task-list',
  templateUrl: './task-list.component.html'
})
export class TaskListComponent implements OnChanges, OnInit {
  /** '' = every task. 'ALL' (My Department's reporting view) shows nothing. */
  @Input() department = '';
  @Input() heading = 'Tasks';
  @Input() hint = '';
  /** Leave the whole card out while there is no task at all (My Department). */
  @Input() hideWhenEmpty = false;

  tasks: Task[] = [];
  /** Stored lists (stable identities for *ngFor). */
  chips: Chip[] = [];
  rows: Row[] = [];
  filter: Filter = 'open';
  loading = false;
  loadError = false;
  open: Task | null = null;

  private request = 0;
  private started = false;

  constructor(private service: TaskService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['department']) {
      this.open = null;
      this.reload();
    }
  }

  /** Used without a department (Announcements): nothing changes, so load here. */
  ngOnInit(): void {
    if (!this.started) this.reload();
  }

  get hidden(): boolean {
    return this.department === 'ALL' || (this.hideWhenEmpty && !this.tasks.length && !this.loadError);
  }

  async reload(): Promise<void> {
    this.started = true;
    const request = ++this.request;
    if (this.department === 'ALL') {
      this.tasks = [];
      this.rebuild();
      return;
    }
    this.loading = true;
    this.loadError = false;
    try {
      const tasks = await this.service.list(this.department);
      if (request !== this.request) return;
      this.tasks = tasks;
    } catch {
      if (request !== this.request) return;
      this.tasks = [];
      this.loadError = true;
    } finally {
      if (request === this.request) {
        this.loading = false;
        this.rebuild();
      }
    }
  }

  setFilter(f: Filter): void {
    this.filter = f;
    this.rebuild();
  }

  /** The sheet loaded or changed the open task: keep the list in step. */
  onChanged(t: Task): void {
    this.tasks = this.tasks.map(x => x._id === t._id ? t : x);
    if (this.open?._id === t._id) this.open = t;
    this.rebuild();
  }

  subtitle(t: Task): string {
    const to = t.departments.length ? t.departments.map(d => d.name).join(', ') : 'the people it was sent to';
    return `To ${to} · from ${t.from || 'someone'}`;
  }

  private matches(t: Task, f: Filter): boolean {
    return f === 'all' || (f === 'open' ? t.status !== 'closed' : t.status === f);
  }

  private rebuild(): void {
    const count = (f: Filter) => this.tasks.filter(t => this.matches(t, f)).length;
    this.chips = [
      { value: 'open', label: 'Open', count: count('open') },
      ...TASK_STATUSES.map(s => ({ value: s.value as Filter, label: s.label, count: count(s.value) })),
      { value: 'all', label: 'All', count: this.tasks.length }
    ];
    this.rows = this.tasks.filter(t => this.matches(t, this.filter)).map(t => {
      const last = t.history[t.history.length - 1];
      return { task: t, line: `${this.subtitle(t)} · ${taskStatusMeta(t.status).label} by ${last?.by || 'someone'}` };
    });
  }

  trackByValue(_: number, c: Chip): string { return c.value; }
  trackById(_: number, r: Row): string { return r.task._id; }
}
