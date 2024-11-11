import { Component, Inject, OnInit } from '@angular/core';
import { Tent } from 'src/app/models/tent.model';
import { AccomodationService } from '../accomodation.service';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-occupant-popup',
  templateUrl: './occupant-popup.component.html',
  styleUrls: ['./occupant-popup.component.css']
})
export class OccupantPopupComponent implements OnInit {
  occupantData;
  selectedRow: any = null;

  constructor(public dialogRef: MatDialogRef<OccupantPopupComponent>, private accomodationService: AccomodationService,
    @Inject(MAT_DIALOG_DATA) public incomingData: any) {

  }

  ngOnInit(): void {
    this.getAllOccupants();
  }

  getAllOccupants() {
    this.accomodationService.getAllFestivalTickets().subscribe((res) => {      
      this.occupantData = res;
    }, (error) => {

    })
  }

  onNoClick(): void {
    this.dialogRef.close();
  }

  selectRow(row: any) {
    this.selectedRow = row; // Set the selected row
  }

  // onSubmit() {
  //   this.incomingData.tentDetails.occupants[this.incomingData.pos] = this.selectedRow;
  //   if (this.selectedRow) {
  //       // Close the dialog and pass the selected row data back to the parent component
  //       this.dialogRef.close({
  //           tent_no: this.selectedRow.tent_no,
  //           _id: this.selectedRow._id 
  //       });
  //     }
  // }
}
