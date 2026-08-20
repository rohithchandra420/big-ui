import { Component, OnInit, signal } from '@angular/core';
import { AccomodationService } from './accomodation.service';
import { NotificationService } from '../core/notification.service';
import { EventService } from '../core/event.service';
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
    private eventService: EventService, public dialog: MatDialog) {

  }

  ngOnInit(): void {
    const filtersItems = this.tentInitData.map(item => item.tentType)
    this.filters.push(...filtersItems);
    this.fetchAllTentDetails();
  }

  // Superseded by the Accommodation Setup page — see the note on
  // tentTypeName() above. Left as a no-op notice rather than wired to
  // createTents() (whose request shape changed to a single PassType +
  // capacity + quantity, which this page's hardcoded multi-type list has no
  // sensible mapping to).
  createTents() {
    this.notificationService.openErrorSnackBar("This page is retired — use Accommodation > Setup instead");
  }

  toggleTable() {
    this.showTable = !this.showTable;
  }

  toggleFilter(filter) {
    this.selectedFilter = filter; // Set the selected filter
  }

  // NOTE: this whole page is superseded by the new Accommodation Setup/
  // Inventory pages (see ACCOMMODATION_CONTEXT.md) and is no longer routed
  // anywhere — kept only per the "never delete files" rule. Its create/list
  // flow no longer matches the current /createTents /getAllTents contract,
  // so this is a minimal compile-only fix, not a functional one.
  tentTypeName(tent: Tent): string {
    return typeof tent.passType === 'string' ? tent.passType : (tent.passType?.name || '');
  }

  get filteredItems() {
    return this.selectedFilter === 'All'
      ? this.tentList
      : this.tentList.filter(item => {
        // Match for tent_type or tent_no directly
        const matchesTentType = this.tentTypeName(item)?.toLowerCase().includes(this.selectedFilter.toLowerCase());
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
    const activeEvent = this.eventService.currentActiveEvent;
    if (!activeEvent) { return; }
    this.accomodationService.getAllTents(activeEvent._id).subscribe((res) => {
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
