import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import { Ticket } from '../../../models/ticket.model';
import { BoxOfficeService } from '../../box-office.service';
import { passSummary as buildPassSummary } from '../../box-office.utils';

@Component({
  selector: 'app-booking-found',
  templateUrl: './booking-found.component.html',
  styleUrls: ['./booking-found.component.css']
})
export class BookingFoundComponent implements OnInit {

  ticket: Ticket | null = null;
  loading = false;
  notFound = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private boxOfficeService: BoxOfficeService
  ) { }

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.loadTicket(id);
    }
  }

  loadTicket(id: string) {
    this.loading = true;
    this.notFound = false;
    this.boxOfficeService.getTicketById(id).subscribe({
      next: (res) => {
        this.ticket = res;
        this.loading = false;
      },
      error: () => {
        this.loading = false;
        this.notFound = true;
      }
    });
  }

  get passSummary(): string {
    return buildPassSummary(this.ticket?.shopcart);
  }

  get admittedCount(): number {
    return this.ticket?.shopcart?.filter(item => item.isAdmitted).length ?? 0;
  }

  get totalCount(): number {
    return this.ticket?.shopcart?.length ?? 0;
  }

  goBack() {
    this.router.navigate(['/box-office/registration']);
  }
}
