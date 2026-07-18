import { Component } from '@angular/core';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-admin-menu',
  templateUrl: './admin-menu.component.html',
  styleUrls: ['./admin-menu.component.css']
})
export class AdminMenuComponent {

  readonly adminOnlyRoles = ['DEV', 'DIR', 'ADMIN'];

  constructor(private authService: AuthService) {}

  // Ticket registry is restricted to DEV/DIR/ADMIN
  get canSeeTickets(): boolean {
    return this.adminOnlyRoles.includes(this.authService.currentUser?.role || '');
  }

  // Department management page is DEV/DIR/ADMIN only
  get canSeeManageDepts(): boolean {
    return this.adminOnlyRoles.includes(this.authService.currentUser?.role || '');
  }
}
