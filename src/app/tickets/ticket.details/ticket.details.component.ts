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
      : this.ticketPassList.filter(item => item.item_name === this.selectedFilter);
  }

  savePass(shopItem: Shopcart) {
    console.log(shopItem);
  }

  onAdmit(shopItem: Shopcart, index: number) {
    this.ticketService.updateTicketToAdmit(shopItem).subscribe((res) => {
      // this.ticket.shopcart[index] = res;
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