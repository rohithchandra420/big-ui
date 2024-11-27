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
  searchInput = '';
  disableTentCreation = false;

  tentInitData = [
    { tentType: 'Shared Tent', capacity: null, quantity: null },
    { tentType: 'Solo Tent', capacity: null, quantity: null },
    { tentType: 'Family Tent', capacity: null, quantity: null },
    { tentType: 'PYOT (Pitch Your Own Tent)', capacity: null, quantity: null },
    { tentType: 'Glamping Tent For 1 Person.', capacity: null, quantity: null },
    { tentType: 'Glamping Tent with Private Washroom.', capacity: null, quantity: null },
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
    this.disableTentCreation = true;
    const tentsData = this.tentInitData.map(tent => ({
      tentType: tent.tentType,
      capacity: tent.capacity,
      quantity: tent.quantity
    }));
    this.accomodationService.createTents(tentsData).subscribe((res) => {
      if(res && res.length) {
        this.tentList.push(...res);
        this.notificationService.openSucessSnackBar("Successfully Created Tents");
      } else {
        this.notificationService.openErrorSnackBar("Server Error");
      }
      this.disableTentCreation = false;
    },(error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Server Error");
      this.disableTentCreation = false;
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
      : this.tentList.filter(item => {
        // Match for tent_type or tent_no directly
        const matchesTentType = item.tent_type?.toLowerCase().includes(this.selectedFilter.toLowerCase());
        const matchesTentNo = item.tent_no?.toLowerCase().includes(this.selectedFilter.toLowerCase());

        // Match for occupants' properties (name and order_id) if occupants exist
        const matchesOccupant = item.occupants?.some(occupant => 
          occupant?.name?.toLowerCase().includes(this.selectedFilter.toLowerCase()) ||
          (occupant?.order_id?.toString().includes(this.selectedFilter))
        );

        // Return true if any of the properties match the filter
        return matchesTentType || matchesTentNo || matchesOccupant;
      });
  }

  fetchAllTentDetails() {
    this.accomodationService.getAllTents().subscribe((res) => {
      if(res && res.length) {
        this.tentList = res;
        this.notificationService.openSucessSnackBar("Successfully Fetched Tent Details");
      } else {
        this.notificationService.openErrorSnackBar("No Tents Available");
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
      this.notificationService.openSucessSnackBar("Successfully Removed Particpant from their Tent");
    },(error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Server Error");

    })
  }

  onSubmit(tentDetails, index) {
    console.log("tentDetails", tentDetails);
  }

}
