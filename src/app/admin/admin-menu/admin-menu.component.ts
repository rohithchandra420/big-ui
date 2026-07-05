import { Component } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-admin-menu',
  templateUrl: './admin-menu.component.html',
  styleUrls: ['./admin-menu.component.css']
})
export class AdminMenuComponent {

  readonly ticketManagerRoles = ['DEV', 'DIR', 'ADMIN'];

  constructor(private router: Router, private authService: AuthService) {}

  get canSeeTickets(): boolean {
    return this.ticketManagerRoles.includes(this.authService.currentUser?.role || '');
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }
}
