import { Component, ElementRef, Inject, OnInit, ViewChild } from "@angular/core";
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Shopcart, Ticket } from "src/app/models/ticket.model";
import { TicketsService } from "../tickets.service";
import { NotificationService } from "src/app/core/notification.service";
import { ActivatedRoute, Router } from "@angular/router";

@Component({
  selector: 'ticket-details-popup',
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

  constructor(private ticketService: TicketsService, private notificationService: NotificationService,
    private route: ActivatedRoute, private router: Router) {

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
      console.log(res);
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
    const categoriesSet = new Set(this.ticketPassList.map(item => item.item_name));
    console.log("Categoried: ", categoriesSet);
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
    console.log(shopItem);
    console.log(this.ticket.shopcart[index]);
    this.ticketService.updateTicketToAdmit(shopItem).subscribe((res) => {
      // this.ticket.shopcart[index] = res;
      this.notificationService.openSucessSnackBar("Admitted");
    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Error");

    })
  }

  //   onNoClick(): void {
  //     this.dialogRef.close();
  //   }

  //   populatePopup(data) {
  //     //console.log(data);
  //   }



  //   onShowTicket() {
  //     this.showTicket = !this.showTicket;
  //   }

  // //   onDownloadTicket() {    
  // //     this.downloadTicketPng();
  // //   }

  //   createQrCode(data) {
  //     if (data) {
  //       let qrValues = {
  //         tid: data._id,
  //         oid: data.orderId,
  //         pid: data.paymentId,
  //       };
  //       this.qrdata = JSON.stringify(qrValues);
  //     } else {
  //       console.log("transDetails Not Ok");
  //     }
  //   }

  //   downloadTicketPng() {
  //     html2canvas(this.ticketCard.nativeElement).then(canvas => {
  //       this.canvas.nativeElement.src = canvas.toDataURL();
  //       this.downloadLink.nativeElement.href = canvas.toDataURL('image/png');
  //       this.downloadLink.nativeElement.download = this.ticketDetails.name + '-mso-ticket.png';
  //       this.downloadLink.nativeElement.click();
  //     });
  //   }

}