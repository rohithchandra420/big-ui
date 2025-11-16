import { Component, Output, EventEmitter, Input, OnInit } from '@angular/core';

import { Task, User } from '../../core/model';
import { TaskService } from '../task.service';

@Component({
  selector: 'app-task-pool',
  template: `
  <div class="task-pool p-2 border-end">
    <h5>Task Pool</h5>
    <div *ngIf="!tasks">Loading...</div>
    <div *ngFor="let t of tasks" class="card mb-2">
      <div class="card-body p-2">
        <strong>{{t.title}}</strong>
        <p class="mb-1 small">{{t.description}}</p>
        <div class="d-flex justify-content-between">
          <div class="small text-muted">{{t.assignedVolunteerIds.length}} assigned</div>
          <div>
            <button class="btn btn-sm btn-outline-primary" (click)="edit(t)">Edit</button>
            <button class="btn btn-sm btn-outline-danger" (click)="deleteTask(t)">Delete</button>
          </div>
        </div>
      </div>
    </div>
  </div>
  `
})
export class TaskPoolComponent implements OnInit {
  tasks: Task[];
  @Output() editTask = new EventEmitter<Task>();

  constructor(private taskService: TaskService){}

  ngOnInit(){ this.load(); }

  load(){ this.taskService.getTasks().subscribe(t=> this.tasks = t.filter(x => (x.assignedVolunteerIds || []).length === 0) ); }

  edit(t: Task){ this.editTask.emit(t); }

  deleteTask(t: Task){
    if(confirm('Delete task?')){
      this.taskService.deleteTask(t._id).subscribe(()=> this.load());
    }
  }
}
