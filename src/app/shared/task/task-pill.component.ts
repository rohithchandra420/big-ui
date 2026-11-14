import { Component, Input } from '@angular/core';
import { TaskStatus, taskStatusMeta } from '../../core/task.service';

/** A Task's status as a small coloured pill (styles: global `.tk-pill`). */
@Component({
  selector: 'app-task-pill',
  template: `<span class="tk-pill tk-s-{{ meta.value }}"><mat-icon aria-hidden="true">{{ meta.icon }}</mat-icon>{{ meta.label }}</span>`
})
export class TaskPillComponent {
  meta = taskStatusMeta('new');

  @Input() set status(value: TaskStatus | null | undefined) {
    this.meta = taskStatusMeta(value);
  }
}
