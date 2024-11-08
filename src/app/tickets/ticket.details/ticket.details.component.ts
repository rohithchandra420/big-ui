import { Component, ElementRef, Inject, OnInit, ViewChild } from "@angular/core";
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Shopcart, Ticket } from "src/app/models/ticket.model";
import { TicketsService } from "../tickets.service";
import { NotificationService } from "src/app/core/notification.service";
import { ActivatedRoute, Router } from "@angular/router";
import { TentDetailsPopUp } from "./tent.details.popup/tent.details.popup.component";

@Component({
  selector: 'ticket-details',
  templateUrl: './ticket.details.component.html',
  styleUrls: ['./ticket.details.component.css']
})

export class TicketDetailsComponent implements OnInit {

  // @ViewChild('ticketCard') ticketCard: ElementRef<HTMLElement>;
  // @ViewChild('canvas') canvas: ElementRef;
  // @ViewChild('downloadLink') downloadLink: ElementRef;

  // qrdata: string = "mso";
  // showTicket = false;

  ticket: Ticket;
  ticketPassList: Shopcart[];
  filters = ["All"];
  selectedFilter = 'All';

  selectedTentNo;
  selectedTentId;

  constructor(private ticketService: TicketsService, private notificationService: NotificationService,
    private route: ActivatedRoute, private router: Router, public dialog: MatDialog) {

  }

  ngOnInit(): void {
    //this.populatePopup(this.ticketDetails);
    // this.createQrCode(this.ticketDetails);
    const ticketId = this.route.snapshot.paramMap.get('id');
    this.ticketService.selectedTicket$.subscribe((ticket) => {
      this.ticket = ticket;
      this.ticketPassList = ticket ? ticket.shopcart : [];
      this.getFilter();
    })

    this.getTicketDetails(ticketId);
  }

  getTicketDetails(ticketId) {
    this.ticketService.getTicketById(ticketId).subscribe((res) => {
      this.ticketService.setSelectedTicket(res);
      this.notificationService.openSucessSnackBar("Succefully fetched Ticket Details");
    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Failed to Fetch Ticket Details");
    })
  }

  goBack() {
    this.router.navigate(['/tickets']);
  } 

  getFilter() {
    this.filters = ["ALL"];
    const categoriesSet = new Set(this.ticketPassList.map(item => item.item_name));
    categoriesSet.forEach(itemName => {
      this.filters.push(itemName);
    })
  }

  toggleFilter(filter) {
    this.selectedFilter = filter; // Set the selected filter
  }

  get filteredItems() {
    return this.selectedFilter === 'All'
      ? this.ticketPassList
      : this.ticketPassList.filter(item => {
        // Match for tent_type or tent_no directly
        const matchesTentType = item.item_name?.toLowerCase().includes(this.selectedFilter.toLowerCase());
        const matchesTentNo = item.admissionId?.toLowerCase().includes(this.selectedFilter.toLowerCase());
        const matchesName = item.name?.toLowerCase().includes(this.selectedFilter.toLowerCase());
        const matchesPhone = item.phone_no?.toLowerCase().includes(this.selectedFilter.toLowerCase());
        const matchesEmail = item.email?.toLowerCase().includes(this.selectedFilter.toLowerCase());

        // Return true if any of the properties match the filter
        return matchesTentType || matchesTentNo || matchesName || matchesPhone || matchesEmail;
      });
  }


  savePass(shopItem: Shopcart, index: number) {
    console.log(shopItem);
    this.ticketService.allocateTentForFestivalTicket(shopItem).subscribe((res) => {
      this.ticket.shopcart[index] = res;
      this.notificationService.openSucessSnackBar("Admitted");
    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Server Error");
    })
  }

  onAdmit(shopItem: Shopcart, index: number) {
    this.ticketService.updateTicketToAdmit(shopItem).subscribe((res) => {
      this.ticket.shopcart[index] = res;
      //this.ticketPassList =
      this.notificationService.openSucessSnackBar("Admitted");
    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Error");

    })
  }

  openTicketDetails(ticketPassDetails, index) {
    if(ticketPassDetails.item_name !== 'Festival Ticket') {
      const dialogRef = this.dialog.open(TentDetailsPopUp, {
        width: '500px',
        data: ticketPassDetails
      });
  
      dialogRef.afterClosed().subscribe(result => {
        console.log('The dialog was closed', result);
        //this.getAllTickets();
      });
    }
    
  }

}