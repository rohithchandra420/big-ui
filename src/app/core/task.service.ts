import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

export type TaskStatus = 'new' | 'acknowledged' | 'in_progress' | 'blocked' | 'closed';

export interface TaskStatusMeta {
  value: TaskStatus;
  label: string;
  /** Material Symbols name. */
  icon: string;
}

/** The statuses in the order they are offered (same list as big-api's Announcement.TASK_STATUSES). */
export const TASK_STATUSES: TaskStatusMeta[] = [
  { value: 'new', label: 'New', icon: 'fiber_new' },
  { value: 'acknowledged', label: 'Acknowledged', icon: 'visibility' },
  { value: 'in_progress', label: 'In Progress', icon: 'autorenew' },
  { value: 'blocked', label: 'Blocked', icon: 'block' },
  { value: 'closed', label: 'Closed', icon: 'check_circle' }
];

const BY_VALUE = new Map(TASK_STATUSES.map(s => [s.value, s]));
export const taskStatusMeta = (status: TaskStatus | null | undefined): TaskStatusMeta =>
  BY_VALUE.get(status as TaskStatus) || TASK_STATUSES[0];

export const TASK_NOTE_MAX = 200;

export interface TaskChange {
  status: TaskStatus;
  note: string;
  at: string;
  by: string | null;
}

export interface Task {
  _id: string;
  title: string;
  message: string;
  createdAt: string;
  from: string | null;
  roles: string[];
  departments: { _id: string; name: string }[];
  status: TaskStatus;
  /** Oldest first; the last entry is the current status. */
  history: TaskChange[];
  /** May the signed-in person change the status now? (The server checks again.) */
  canChange: boolean;
}

/**
 * Tasks (Helpdesk epic, HD1): a Task sent from Announcements carries one
 * shared status and a timeline. The server decides who sees and changes what.
 */
@Injectable({ providedIn: 'root' })
export class TaskService {
  private url = environment.URL;

  constructor(private http: HttpClient) {}

  /** A department's tasks; without a department, every task (Helpdesk and top roles). */
  async list(department = ''): Promise<Task[]> {
    const qs = department ? `?department=${encodeURIComponent(department)}` : '';
    return (await firstValueFrom(this.http.get<{ tasks: Task[] }>(`${this.url}/tasks${qs}`))).tasks;
  }

  get(id: string): Promise<Task> {
    return firstValueFrom(this.http.get<Task>(`${this.url}/tasks/${id}`));
  }

  setStatus(id: string, status: TaskStatus, note = ''): Promise<Task> {
    return firstValueFrom(this.http.post<Task>(`${this.url}/tasks/${id}/status`, { status, note }));
  }
}
