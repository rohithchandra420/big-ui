import { Component, OnInit } from '@angular/core';
import { ActivatedRoute } from '@angular/router';


import { User } from '../core/user.model';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent implements OnInit {
  user: User;

  constructor(private route: ActivatedRoute) {
   
  }


  ngOnInit(){    
    this.user = {
      name: 'TestName',
      bookingId: this.route.snapshot.params['id'],      
      role: 'Admin',      
      ticketId: '',
      email: '',
      _id: '',
      _token: ''
    };
    
  }
}
