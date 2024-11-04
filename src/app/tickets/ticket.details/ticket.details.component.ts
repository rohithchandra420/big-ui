import { Component, ElementRef, Inject, OnInit, ViewChild } from "@angular/core";
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { Shopcart, Ticket } from "src/app/models/ticket.model";
import { TicketsService } from "../tickets.service";
import { NotificationService } from "src/app/core/notification.service";

@Component({
  selector: 'ticket-details-popup',
  templateUrl: './ticket.details.component.html',
  styleUrls: ['./ticket.details.component.css']
})

export class TicketDetailsComponent implements OnInit {

  @ViewChild('ticketCard') ticketCard: ElementRef<HTMLElement>;
  @ViewChild('canvas') canvas: ElementRef;
  @ViewChild('downloadLink') downloadLink: ElementRef;

  qrdata: string = "mso";
  showTicket = false;

  constructor(public dialogRef: MatDialogRef<TicketDetailsComponent>, private ticketService: TicketsService,
    private notificationService: NotificationService , @Inject(MAT_DIALOG_DATA) public ticketDetails: Ticket) { }

  ngOnInit(): void {
    this.populatePopup(this.ticketDetails);
    // this.createQrCode(this.ticketDetails);
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  populatePopup(data) {
    //console.log(data);
  }

  onAdmit(shopItem: Shopcart, index: number) {
    console.log(shopItem);
    console.log(this.ticketDetails.shopcart[index]);
    this.ticketService.updateTicketToAdmit(shopItem).subscribe((res) => {
        this.ticketDetails.shopcart[index] = res;
        this.notificationService.openSucessSnackBar("Admitted");
    }, (error) => {
        console.log(error);
        this.notificationService.openErrorSnackBar("Error");

    })
  }

  onShowTicket() {
    this.showTicket = !this.showTicket;
  }

//   onDownloadTicket() {    
//     this.downloadTicketPng();
//   }

  createQrCode(data) {
    if (data) {
      let qrValues = {
        tid: data._id,
        oid: data.orderId,
        pid: data.paymentId,
      };
      this.qrdata = JSON.stringify(qrValues);
    } else {
      console.log("transDetails Not Ok");
    }
  }

//   downloadTicketPng() {
//     html2canvas(this.ticketCard.nativeElement).then(canvas => {
//       this.canvas.nativeElement.src = canvas.toDataURL();
//       this.downloadLink.nativeElement.href = canvas.toDataURL('image/png');
//       this.downloadLink.nativeElement.download = this.ticketDetails.name + '-mso-ticket.png';
//       this.downloadLink.nativeElement.click();
//     });
//   }

}