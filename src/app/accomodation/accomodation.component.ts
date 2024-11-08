import { Component, OnInit, signal } from '@angular/core';
import { AccomodationService } from './accomodation.service';
import { NotificationService } from '../core/notification.service';
import { Tent } from '../models/tent.model';
import { MatDialog } from '@angular/material/dialog';
import { OccupantPopupComponent } from './occupant-popup/occupant-popup.component';

@Component({
  selector: 'app-accomodation',
  templateUrl: './accomodation.component.html',
  styleUrls: ['./accomodation.component.css']
})
export class AccomodationComponent implements OnInit {

  readonly panelOpenState = signal(false);
  showTable = false; 
  tentList: Tent[] = [];
  filters = ["All"];
  selectedFilter = 'All';

  tentInitData = [
    { tentType: 'Shared Tent', capacity: null, quantity: null },
    { tentType: 'Solo Tent', capacity: null, quantity: null },
    { tentType: 'Family Tent', capacity: null, quantity: null },
    { tentType: 'PYOT (Pitch Your Own Tent)', capacity: null, quantity: null },
    { tentType: 'Glamping Tent for Single Person', capacity: null, quantity: null },
    { tentType: 'Glamping Tent with Private Washroom', capacity: null, quantity: null },
  ];

  constructor(private accomodationService: AccomodationService, private notificationService: NotificationService,
    public dialog: MatDialog) {

  }

  ngOnInit(): void {
    const filtersItems = this.tentInitData.map(item => item.tentType)
    this.filters.push(...filtersItems);
    this.fetchAllTentDetails();
  }

  createTents() {
    const tentsData = this.tentInitData.map(tent => ({
      tentType: tent.tentType,
      capacity: tent.capacity,
      quantity: tent.quantity
    }));
    this.accomodationService.createTents(tentsData).subscribe((res) => {
      if(res && res.length) {
        this.tentList.push(...res);
      } else {
        this.notificationService.openErrorSnackBar("Server Error");
      }
    },(error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Server Error");
    })
    // You can send this data to a server or process it as needed
  }

  toggleTable() {
    this.showTable = !this.showTable;
  }

  toggleFilter(filter) {
    this.selectedFilter = filter; // Set the selected filter
  }

  get filteredItems() {
    return this.selectedFilter === 'All'
      ? this.tentList
      : this.tentList.filter(item => item.tent_type === this.selectedFilter);
  }

  fetchAllTentDetails() {
    this.accomodationService.getAllTents().subscribe((res) => {
      if(res && res.length) {
        this.tentList = res;
      } else {
        this.notificationService.openErrorSnackBar("Server Error");
      }
    },(error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Server Error");
    })
  }

  openOccupantDetails(tentDetails, idx) {
    const dialogRef = this.dialog.open(OccupantPopupComponent, {
      width: '500px',
      panelClass: 'custom-dialog',
      data: { tentDetails, pos: idx }
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed', result);
      //this.getAllTickets();
    });
  }

  removeOccupant(tentDetails: Tent, index) {
    tentDetails.occupants[index] = null;
    this.accomodationService.removeOccupant(tentDetails).subscribe((res) => {
      console.log(res);
    },(error) => {

    })
  }

  onSubmit(tentDetails, index) {
    console.log("tentDetails", tentDetails);
  }

}
