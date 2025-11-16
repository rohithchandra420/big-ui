import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { Task, User } from '../../core/model';
import { FormsModule } from '@angular/forms';

export interface TaskEditData {
  task: Task;
  volunteers: User[];
  mode: 'full'|'instance'; // full = edits all assigned volunteers; instance = only single (task+vol)
  instanceVolunteerId?: string; // present for instance edits
}

@Component({
  selector: 'app-task-edit',
  templateUrl: './task-edit.component.html',
  standalone: true,
  imports: [FormsModule],
})
export class TaskEditComponent {
  task: Task;
  volunteers: User[];
  mode: 'full'|'instance';
  instanceVolunteerId?: string;

  // local date inputs (datetime-local expects YYYY-MM-DDThh:mm)
  startLocal: string;
  endLocal: string;

  constructor(
    public dialogRef: MatDialogRef<TaskEditComponent>,
    @Inject(MAT_DIALOG_DATA) public data: TaskEditData
  ){
    this.task = { ...data.task };
    this.volunteers = data.volunteers;
    this.mode = data.mode;
    this.instanceVolunteerId = data.instanceVolunteerId;
    this.startLocal = isoToDatetimeLocal(this.task.start);
    this.endLocal = isoToDatetimeLocal(this.task.end);
  }

  onLocalStartChange(){ this.task.start = datetimeLocalToIso(this.startLocal); }
  onLocalEndChange(){ this.task.end = datetimeLocalToIso(this.endLocal); }

  save(){
    if(this.mode === 'instance'){
      this.dialogRef.close({ action: 'save-instance', instanceVolunteerId: this.instanceVolunteerId, task: this.task });
    } else {
      this.dialogRef.close({ action: 'save-full', task: this.task });
    }
  }

  delete(){
    this.dialogRef.close({ action: 'delete' });
  }

  close(){ this.dialogRef.close({ action: 'cancel' }); }
}

/* small helpers */
function isoToDatetimeLocal(iso:string) {
  const d = new Date(iso);
  const pad = (n:number)=>n.toString().padStart(2,'0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function datetimeLocalToIso(v:string) {
  return new Date(v).toISOString();
}
