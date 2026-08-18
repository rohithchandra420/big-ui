import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { MatDialog } from '@angular/material/dialog';
import { EventService } from '../../core/event.service';
import { EventItem } from '../../models/event.model';
import { NotificationService } from '../../core/notification.service';
import { EventCreateDialogComponent } from './event-create-dialog/event-create-dialog.component';

@Component({
  selector: 'app-events',
  templateUrl: './events.component.html',
  styleUrls: ['./events.component.css']
})
export class EventsComponent implements OnInit {
  events: EventItem[] = [];
  loading = false;

  // Whoever can reach this page is DEV/DIR/ADMIN (route-guarded) — for
  // those roles GET /admin/events already returns every status unfiltered
  // (decision #8), so this just reuses EventService's shared list rather
  // than duplicating the HTTP call.
  constructor(
    private eventService: EventService,
    private notificationService: NotificationService,
    private router: Router,
    private dialog: MatDialog
  ) {}

  ngOnInit() {
    this.eventService.events.subscribe(events => this.events = events);
    this.refresh();
  }

  refresh() {
    this.loading = true;
    this.eventService.loadEvents();
    this.loading = false;
  }

  openCreateDialog() {
    const ref = this.dialog.open(EventCreateDialogComponent, { width: '480px', disableClose: true });
    ref.afterClosed().subscribe(created => {
      if (created) {
        this.notificationService.openSucessSnackBar('Event created');
        this.refresh();
      }
    });
  }

  editEvent(event: EventItem) {
    this.router.navigate(['/admin/events', event._id]);
  }

  statusLabel(status: string): string {
    return status.charAt(0).toUpperCase() + status.slice(1);
  }
}
