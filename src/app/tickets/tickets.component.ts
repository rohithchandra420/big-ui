import { AfterViewInit, Component, OnInit, ViewChild } from '@angular/core';
import { MatPaginator } from '@angular/material/paginator';
import { MatTableDataSource } from '@angular/material/table';
import { TicketsService } from './tickets.service';
import { Ticket } from '../models/ticket.model';
import { NotificationService } from '../core/notification.service';


import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TicketDetailsPopUp } from './ticket.details.popup/ticket.details.popup';
import { QrscannerPopupComponent } from './qrscanner-popup/qrscanner-popup.component';

@Component({
  selector: 'app-tickets',
  templateUrl: './tickets.component.html',
  styleUrls: ['./tickets.component.css']
})
export class TicketsComponent implements OnInit {
  displayedColumns: string[] = ['first_name', 'last_name', 'email', '_id', 'order_id', 'transaction_id', 'hasEmailSent', 'actions'];
  dataSource;
  buttonDisabled: boolean[] = [];
  filterValue = "";

  @ViewChild(MatPaginator) paginator: MatPaginator;

  constructor(private ticketsService: TicketsService, private notificationService: NotificationService,
    public dialog: MatDialog) {

  }

  ngOnInit() {
    // this.dataSource.paginator = this.paginator;
    this.getAllTickets();
  }

  sendTicketEmail(rowData: Ticket, index: number) {
    this.buttonDisabled[index] = true;

    this.ticketsService.sendEmail(rowData).subscribe((res) => {
      this.notificationService.openSucessSnackBar("Email sent Successfully")
      this.populateTable(res);
      this.buttonDisabled[index] = false;
    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("Email sending Failed");
      this.buttonDisabled[index] = false;
    })
  }

  openTicketDetails(row) {
    const dialogRef = this.dialog.open(TicketDetailsPopUp, {
      width: '500px',
      data: row
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed', result);
      this.getAllTickets();
    });
  }

  getAllTickets() {
    this.ticketsService.getAllTickets().subscribe(res => {
      console.log(res);
      this.populateTable(res);
    }, error => {

    })
  }

  populateTable(data) {
    this.dataSource = new MatTableDataSource(data);
    this.buttonDisabled = new Array(data.length).fill(false);
  }

  applyFilter(event: Event) {
    const filterValue = (event.target as HTMLInputElement).value;
    this.dataSource.filter = filterValue.trim().toLowerCase();
  }

  openScanner() {
    const dialogRef = this.dialog.open(QrscannerPopupComponent, {
      width: '90%',
      data: "Apple"
    });

    dialogRef.afterClosed().subscribe(result => {
      console.log('The dialog was closed', result);
      //this.animal = result;
      if (result) {
        this.filterValue = result;
        this.dataSource.filter = result.toString().trim().toLowerCase();
      }
    });
  }


}
