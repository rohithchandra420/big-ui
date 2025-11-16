import { Injectable } from '@angular/core';
import { of, Observable } from 'rxjs';
import { delay, map } from 'rxjs/operators';
import { addHours, addDays } from 'date-fns';
import { Task, User } from '../core/model';

@Injectable({ providedIn: 'root' })
export class TaskService {
  // Mock volunteers
  private volunteers: User[] = [
    { _id: 'vol-1', name: 'Alice', email: 'alice@example.com', role: 'VOL' },
    { _id: 'vol-2', name: 'Bob', email: 'bob@example.com', role: 'VOL' },
    { _id: 'vol-3', name: 'Charlie', email: 'charlie@example.com', role: 'VOL' },
  ];

  // Mock tasks: note assignedVolunteerIds can be []
  private tasks: Task[] = [
    {
      _id: 'task-1',
      title: 'Inventory Check',
      description: 'Check inventory in Zone A',
      start: new Date().toISOString(),
      end: addHours(new Date(), 6).toISOString(),
      assignedVolunteerIds: ['vol-1', 'vol-2'],
      status: 'assigned',
      createdBy: 'tl-1'
    },
    {
      _id: 'task-2',
      title: 'Night Patrol',
      description: 'Patrol perimeters',
      start: addDays(new Date(), 1).toISOString(),
      end: addDays(new Date(), 2).toISOString(),
      assignedVolunteerIds: [],
      status: 'pending',
      createdBy: 'tl-1'
    }
  ];

  getVolunteers(): Observable<User[]> {
    return of(this.volunteers).pipe(delay(200));
    // Replace with: return this.http.get<User[]>('/api/volunteers')
  }

  getTasks(): Observable<Task[]> {
    return of(this.tasks).pipe(delay(300));
    // Replace w/ actual: return this.http.get<Task[]>('/api/tasks')
  }

  updateTask(updated: Task): Observable<Task> {
    // Mock update: replace in array
    const idx = this.tasks.findIndex(t => t._id === updated._id);
    if (idx !== -1) this.tasks[idx] = { ...updated };
    else this.tasks.push(updated);
    return of(updated).pipe(delay(200));
    // Replace: return this.http.patch<Task>(`/api/tasks/${updated._id}`, updated)
  }

  createTask(task: Partial<Task>): Observable<Task> {
    const newTask: Task = {
      _id: 'task-' + (Math.random() * 100000 | 0),
      title: task.title || 'New Task',
      description: task.description || '',
      start: task.start || new Date().toISOString(),
      end: task.end || new Date().toISOString(),
      assignedVolunteerIds: task.assignedVolunteerIds || [],
      status: task.status || 'pending',
      createdBy: task.createdBy || ''
    };
    this.tasks.push(newTask);
    return of(newTask).pipe(delay(200));
    // Replace: return this.http.post<Task>('/api/tasks', newTask);
  }

  deleteTask(id: string): Observable<{ ok: boolean }> {
    this.tasks = this.tasks.filter(t => t._id !== id);
    return of({ ok: true }).pipe(delay(200));
    // Replace: return this.http.delete(`/api/tasks/${id}`);
  }
}
