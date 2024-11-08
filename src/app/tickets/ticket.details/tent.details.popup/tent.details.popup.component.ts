import { Component, ElementRef, Inject, OnInit, ViewChild } from "@angular/core";
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { TicketsService } from "../../tickets.service";
import { Shopcart, Ticket } from "src/app/models/ticket.model";


@Component({
    selector: 'tent-details-popup',
    templateUrl: './tent.details.popup.component.html',
    styleUrls: ['./tent.details.popup.component.css']
})

export class TentDetailsPopUp implements OnInit {
    tableData;
    selectedRow: any = null;

    constructor(public dialogRef: MatDialogRef<TentDetailsPopUp>, private ticketService: TicketsService,
        @Inject(MAT_DIALOG_DATA) public ticketPassDetails: Shopcart) { }

    ngOnInit(): void {
        this.getAvailabelTents();
    }

    onNoClick(): void {
        this.dialogRef.close();
    }

    // Method to count the number of null values in the occupants array
    countNullOccupants(occupants: any[]): number {
        return occupants.filter(occupant => occupant === null).length;
    }

    selectRow(row: any) {
        this.selectedRow = row; // Set the selected row
    }

    getAvailabelTents() {
        let tentType = this.ticketPassDetails.item_name
        this.ticketService.getAvailableTents(tentType).subscribe((res) => {
            this.tableData = res;
        }, (error) => {

        })
    }

    onSubmit() {
        this.ticketPassDetails.admissionId = this.selectedRow.tent_no;
        if (this.selectedRow) {
            // Close the dialog and pass the selected row data back to the parent component
            this.dialogRef.close({
                tent_no: this.selectedRow.tent_no,
                _id: this.selectedRow._id 
            });
          }
    }

}

