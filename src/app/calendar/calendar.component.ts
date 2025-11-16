import { Component, OnInit, Inject, LOCALE_ID, HostListener, ViewChild } from '@angular/core';
import { Subject } from 'rxjs';
import { endOfDay, addMonths } from 'date-fns';
import {
  DAYS_IN_WEEK, SchedulerViewDay, SchedulerViewHour, SchedulerViewHourSegment, CalendarSchedulerEvent, CalendarSchedulerEventAction,
  startOfPeriod, endOfPeriod, addPeriod, subPeriod, SchedulerDateFormatter, SchedulerEventTimesChangedEvent, CalendarSchedulerViewComponent
} from 'angular-calendar-scheduler';
import { CalendarView, CalendarDateFormatter, DateAdapter } from 'angular-calendar';
import { CalendarService } from './calendar.service';
import { Task } from '../core/model';
import { TaskService } from './task.service';
import { MatDialog } from '@angular/material/dialog';
import { AuthService } from '../core/auth.service';
import { TaskEditComponent } from './support/task-edit.component';



@Component({
  selector: 'app-calendar',
  templateUrl: './calendar.component.html',
  styleUrls: ['./calendar.component.css'],
  providers: [
    {
      provide: CalendarDateFormatter,
      useClass: SchedulerDateFormatter,
    },
  ],
})
export class CalendarComponent {

  title: string = 'Angular Calendar Scheduler Demo';

  volunteers: any[] = [];
  tasks: Task[] = [];

  CalendarView = CalendarView;

  view: CalendarView = CalendarView.Week;
  viewDate: Date = new Date();
  viewDays: number = 3;
  refresh: Subject<any> = new Subject();
  locale: string = 'en';
  hourSegments: number = 4;
  weekStartsOn: number = 1;
  startsWithToday: boolean = true;
  activeDayIsOpen: boolean = true;
  excludeDays: number[] = []; // [0];
  dayStartHour: number = 6;
  dayEndHour: number = 22;

  minDate: Date = new Date();
  maxDate: Date = endOfDay(addMonths(new Date(), 1));
  dayModifier: Function;
  hourModifier: Function;
  segmentModifier: Function;
  eventModifier: Function;
  prevBtnDisabled: boolean = false;
  nextBtnDisabled: boolean = false;

  private eventMap = new Map<string, { taskId: string; volunteerId?: string }>();

  actions: CalendarSchedulerEventAction[] = [
    {
      when: 'enabled',
      label:
        '<span class="valign-center"><i class="material-icons md-18 md-red-500">cancel</i></span>',
      title: 'Delete',
      onClick: (event: CalendarSchedulerEvent): void => {
        console.log("Pressed action 'Delete' on event " + event.id);
      },
    },
    {
      when: 'cancelled',
      label:
        '<span class="valign-center"><i class="material-icons md-18 md-red-500">autorenew</i></span>',
      title: 'Restore',
      onClick: (event: CalendarSchedulerEvent): void => {
        console.log("Pressed action 'Restore' on event " + event.id);
      },
    },
  ];

  events: CalendarSchedulerEvent[];

  @ViewChild(CalendarSchedulerViewComponent)
  calendarScheduler: CalendarSchedulerViewComponent;

  constructor(@Inject(LOCALE_ID) locale: string, private calendarService: CalendarService, private taskService: TaskService,
    private dateAdapter: DateAdapter, private dialog: MatDialog, private auth: AuthService,) {
    this.locale = locale;

    // this.dayModifier = ((day: SchedulerViewDay): void => {
    //     day.cssClass = this.isDateValid(day.date) ? '' : 'cal-disabled';
    // }).bind(this);

    // this.hourModifier = ((hour: SchedulerViewHour): void => {
    //     hour.cssClass = this.isDateValid(hour.date) ? '' : 'cal-disabled';
    // }).bind(this);

    this.segmentModifier = ((segment: SchedulerViewHourSegment): void => {
      segment.isDisabled = !this.isDateValid(segment.date);
    }).bind(this);

    this.eventModifier = ((event: CalendarSchedulerEvent): void => {
      event.isDisabled = !this.isDateValid(event.start);
    }).bind(this);

    this.dateOrViewChanged();
  }

  ngOnInit(): void {
    this.loadAll();
    this.calendarService
      .getEvents(this.actions)
      .then((events: CalendarSchedulerEvent[]) => (this.events = events));
  }

  private loadAll() {
    this.taskService.getVolunteers().subscribe(v => {
      this.volunteers = v;
      this.loadTasks();
    });
  }

  private loadTasks() {
    this.taskService.getTasks().subscribe(tasks => {
      this.tasks = tasks;
      this.buildEventsFromTasks();
    });
  }

  private buildEventsFromTasks() {
    const evs: CalendarSchedulerEvent[] = [];
    // For each task, if assignedVolunteerIds empty -> not in calendar (appear in pool)
    // If assignedVolunteerIds non-empty -> create one event per volunteer to allow instance edits/moves
    this.tasks.forEach(t => {
      if (!t.assignedVolunteerIds || t.assignedVolunteerIds.length === 0) return;
      t.assignedVolunteerIds.forEach(volId => {
        this.eventMap.set(`${t._id}::${volId}`, { taskId: t._id, volunteerId: volId });
        evs.push({
          id: `${t._id}::${volId}`, // compound id for instance
          start: new Date(t.start),
          end: new Date(t.end),
          title: t.title + ` — ${this.getVolunteerName(volId)}`,
          content: t.description,
          color: { primary: '#E0E0E0', secondary: '#EEEEEE' },
          // keep actions only for TL
          actions: this.actions, //this.auth.currentUser.role === 'tl' ? this.actions : [],
          status: 'ok',
          isClickable: true,
          isDisabled: this.auth.currentUser.role !== 'tl', // volunteer view read-only
          draggable: true, //this.auth.currentUser.role === 'tl',
          resizable: { beforeStart: true, afterEnd: true }, //this.auth.currentUser.role === 'tl' ? { beforeStart: true, afterEnd: true } : { beforeStart: false, afterEnd: false },
          meta: { taskId: t._id, volunteerId: volId }
        } as CalendarSchedulerEvent);
      });
    });

    this.events = evs;
    //this.refresh.next(null);
  }

  private getVolunteerName(id: string) {
    const v = this.volunteers.find(x => x._id === id);
    return v ? v.name : id;
  }

  // When TL clicks an event
  eventClicked(action: string, event: CalendarSchedulerEvent): void {
    const mapEntry = this.eventMap.get(event.id);
    if (!mapEntry) return;
    const taskId = mapEntry.taskId;
    const volunteerId = mapEntry.volunteerId;

    const task = this.tasks.find(t => t._id === taskId);
    if (!task) return;

    const mode = /* if clicked on specific volunteer instance */ (volunteerId ? 'instance' : 'full') as 'instance' | 'full';
    const instanceVolunteerId = volunteerId;

    const dialogRef = this.dialog.open(TaskEditComponent, {
      width: '600px',
      data: {
        task: task,
        volunteers: this.volunteers,
        mode: mode,
        instanceVolunteerId: instanceVolunteerId
      }
    });

    dialogRef.afterClosed().subscribe(res => {
      if (!res) return;
      if (res.action === 'save-full') {
        // update the task (apply to all assigned volunteers)
        const updatedTask: Task = res.task;
        this.taskService.updateTask(updatedTask).subscribe(() => this.loadTasks());
      } else if (res.action === 'save-instance') {
        // modify just the instance: update times or assigned volunteer for this instance only
        const updatedTaskInstance: Task = { ...task };
        // If volunteer id changed, replace that instance in assignedVolunteerIds
        const oldVolId = instanceVolunteerId;
        const newVolId = res.instanceVolunteerId;
        // If same volunteer, we only update time for this single instance — approach: create a new "split" task for this volunteer
        // Simpler approach: create a new Task representing that single volunteer instance (and remove volunteer from original)
        // Create new task instance for newVolId, update times as per res.task.start/end
        const instanceStart = res.task.start;
        const instanceEnd = res.task.end;
        // Remove oldVolId from original task.assignedVolunteerIds
        updatedTaskInstance.assignedVolunteerIds = updatedTaskInstance.assignedVolunteerIds.filter(id => id !== oldVolId);
        this.taskService.updateTask(updatedTaskInstance).subscribe(() => {
          // create a new task for the single instance
          const newTaskPartial: Partial<Task> = {
            title: res.task.title,
            description: res.task.description,
            start: instanceStart,
            end: instanceEnd,
            assignedVolunteerIds: [newVolId],
            status: task.status,
            createdBy: task.createdBy
          };
          this.taskService.createTask(newTaskPartial).subscribe(() => this.loadTasks());
        });
      } else if (res.action === 'delete') {
        this.taskService.deleteTask(task._id).subscribe(() => this.loadTasks());
      }
    });
  }

  // when event is moved or resized
  eventTimesChanged({ event, newStart, newEnd, type }: SchedulerEventTimesChangedEvent): void {
    // Because we use compound id `<taskId>::<volId>` we can find which task instance changed
    const mapEntry = this.eventMap.get(event.id);
    if (!mapEntry) return;
    const taskId = mapEntry.taskId;
    const volunteerId = mapEntry.volunteerId;

    const task = this.tasks.find(t => t._id === taskId);
    if (!task) return;

    // Option A: update the original task's times for ALL assigned volunteers
    // Option B (safer per your spec): update only the instance for this volunteer — we will create a new task instance and remove the volunteer from original
    // We'll implement Option B to match: moving instance updates only that volunteer's assignment

    // Remove volId from original task
    const updatedOriginal = { ...task, assignedVolunteerIds: task.assignedVolunteerIds.filter(id => id !== volunteerId) };
    // create new task for this volunteer with new times
    const newTaskPartial: Partial<Task> = {
      title: task.title,
      description: task.description,
      start: newStart.toISOString(),
      end: newEnd.toISOString(),
      assignedVolunteerIds: [volunteerId],
      createdBy: task.createdBy,
      status: task.status
    };

    // update original then create new
    this.taskService.updateTask(updatedOriginal).subscribe(() => {
      this.taskService.createTask(newTaskPartial as Partial<Task>).subscribe(() => {
        this.loadTasks();
      });
    });
  }

  // For TL only: clicking a pool task (from TaskPoolComponent)
  onPoolEdit(task: Task) {
    // open dialog in full mode
    const dialogRef = this.dialog.open(TaskEditComponent, { width: '600px', data: { task, volunteers: this.volunteers, mode: 'full' } });
    dialogRef.afterClosed().subscribe(res => {
      if (!res) return;
      if (res.action === 'save-full') {
        this.taskService.updateTask(res.task).subscribe(() => this.loadTasks());
      } else if (res.action === 'delete') {
        this.taskService.deleteTask(task._id).subscribe(() => this.loadTasks());
      }
    });
  }




  // -----------------------------------------------------------------------------------------

  viewDaysOptionChanged(viewDays: number): void {
    console.log('viewDaysOptionChanged', viewDays);
    this.calendarScheduler.setViewDays(viewDays);
  }

  changeDate(date: Date): void {
    console.log('changeDate', date);
    this.viewDate = date;
    this.dateOrViewChanged();
  }

  changeView(view: CalendarView): void {
    console.log('changeView', view);
    this.view = view;
    this.dateOrViewChanged();
  }

  dateOrViewChanged(): void {
    if (this.startsWithToday) {
      this.prevBtnDisabled = !this.isDateValid(
        subPeriod(
          this.dateAdapter,
          CalendarView.Day /*this.view*/,
          this.viewDate,
          1
        )
      );
      this.nextBtnDisabled = !this.isDateValid(
        addPeriod(
          this.dateAdapter,
          CalendarView.Day /*this.view*/,
          this.viewDate,
          1
        )
      );
    } else {
      this.prevBtnDisabled = !this.isDateValid(
        endOfPeriod(
          this.dateAdapter,
          CalendarView.Day /*this.view*/,
          subPeriod(
            this.dateAdapter,
            CalendarView.Day /*this.view*/,
            this.viewDate,
            1
          )
        )
      );
      this.nextBtnDisabled = !this.isDateValid(
        startOfPeriod(
          this.dateAdapter,
          CalendarView.Day /*this.view*/,
          addPeriod(
            this.dateAdapter,
            CalendarView.Day /*this.view*/,
            this.viewDate,
            1
          )
        )
      );
    }

    if (this.viewDate < this.minDate) {
      this.changeDate(this.minDate);
    } else if (this.viewDate > this.maxDate) {
      this.changeDate(this.maxDate);
    }
  }

  private isDateValid(date: Date): boolean {
    return /*isToday(date) ||*/ date >= this.minDate && date <= this.maxDate;
  }

  viewDaysChanged(viewDays: number): void {
    console.log('viewDaysChanged', viewDays);
    this.viewDays = viewDays;
  }

  dayHeaderClicked(day: SchedulerViewDay): void {
    console.log('dayHeaderClicked Day', day);
  }

  hourClicked(hour: SchedulerViewHour): void {
    console.log('hourClicked Hour', hour);
  }

  segmentClicked(action: string, segment: SchedulerViewHourSegment): void {
    console.log('segmentClicked Action', action);
    console.log('segmentClicked Segment', segment);
  }

  // eventTimesChanged({
  //   event,
  //   newStart,
  //   newEnd,
  //   type,
  // }: SchedulerEventTimesChangedEvent): void {
  //   console.log('eventTimesChanged Type', type);
  //   console.log('eventTimesChanged Event', event);
  //   console.log('eventTimesChanged New Times', newStart, newEnd);
  //   const ev: CalendarSchedulerEvent = this.events.find(
  //     (e) => e.id === event.id
  //   );
  //   ev.start = newStart;
  //   ev.end = newEnd;
  //   //this.refresh.next();
  // }
}
