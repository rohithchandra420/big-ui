import { HttpClient } from '@angular/common/http';
import { Component, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { map, catchError } from 'rxjs/operators';
import { throwError } from 'rxjs';
import * as XLSX from 'xlsx';
import { MatSnackBar } from '@angular/material/snack-bar';

import { Ticket } from '../models/ticket.model';
import { User } from '../core/user.model';

import { RegistrationService } from './registration.service'
import { NotificationService } from '../core/notification.service';
import { TicketsService } from '../tickets/tickets.service';

@Component({
  selector: 'app-registration',
  templateUrl: './registration.component.html',
  styleUrls: ['./registration.component.css']
})

export class RegistrationComponent implements OnInit {

  registerForm: FormGroup;
  shopForm: FormGroup;
  genders = ['male', 'female'];
  ticketList: Ticket[] = [];
  userList: User[] = [];
  ticketOrderIdList = [];
  columnValues = [];

  excelFile;
  disableUploadBtn = true;

  constructor(private http: HttpClient, private registrationService: RegistrationService,
    private notificationService: NotificationService, private ticketService: TicketsService,
    private fb: FormBuilder) {
    this.shopForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      orderId: new FormControl(null, [Validators.required]),
      transactionId: new FormControl(null, [Validators.required]),
      shopcart: this.fb.array([]) // Initialize shopcart as an empty FormArray
    });
  }

  ngOnInit() {
    this.getAllTicketOrderId();
    // this.registerForm = new FormGroup({
    //   'firstName': new FormControl(null, Validators.required),
    //   'lastName': new FormControl(null, Validators.required),
    //   'email': new FormControl(null, [Validators.required, Validators.email]),
    //   'orderId': new FormControl(null, [Validators.required]),
    //   'transactionId': new FormControl(null, [Validators.required]),
    //   'noOfTickets': new FormControl(null, [Validators.required, this.ticketValidator])
    // });
  }

  ticketValidator(control: FormControl): { [s: string]: boolean } {
    if (control.value < 1) {
      return { 'inValidNoOfTickets': true };
    }
    return null;
  }

  get shopcart(): FormArray {
    return this.shopForm.get('shopcart') as FormArray;
  }

  addItem() {
    const item = this.fb.group({
      item_name: ['', Validators.required],
      quantity: ['', [Validators.required, Validators.min(1)]]
    });
    this.shopcart.push(item);
  }

  removeItem() {
    console.log(this.shopcart);
    this.shopcart.removeAt(this.shopcart.length - 1);
    console.log(this.shopcart);
  }

  validateValuesandSubmit() {
    this.ticketOrderIdList = [];
    this.ticketService.getAllTickets().subscribe((res) => {
      res.forEach((ticket, index) => {
        this.ticketOrderIdList.push(ticket.order_id);
      })

      const invalidOrderId = this.ticketOrderIdList.includes(this.shopForm.value.orderId);
      console.log("ticketOrderIdList: ", this.ticketOrderIdList);
      console.log("his.shopForm.value.orderId: ", this.shopForm.value.orderId);
      console.log(invalidOrderId);
      if (!invalidOrderId) {
        this.submitTicketValues();
      } else {
        this.notificationService.openErrorSnackBar("Order Id already exist");
      }

    }, (error) => {
      console.log("ERROR: ", error);
    });
  }

  submitTicketValues() {
    if (this.shopForm.valid) { //this.shopForm.valid
      const formData = this.shopForm.value;
      console.log('Submitted Data:', formData);
      // Here you can submit the form data to your backend
      let ticket = new Ticket(formData.orderId, formData.firstName, formData.lastName, formData.email,
        formData.transactionId, "Not Yet", formData.shopcart);
      this.registrationService.createTicket(ticket).subscribe((res) => {
        this.notificationService.openSucessSnackBar("Ticket created for Order #" + res.order_id);
      }, (error) => {
        console.log(error);
        this.notificationService.openErrorSnackBar("Failed to create Ticket: " + error.error);
      })

    }
  }

  onFileSelected(event) {

    this.excelFile = event.target.files[0];

    if (this.excelFile.name.endsWith('.xlsx')) {

      const reader = new FileReader();

      reader.onload = (e: any) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        // Get the first sheet name
        const firstSheetName = workbook.SheetNames[0];

        // Get the first sheet
        const worksheet = workbook.Sheets[firstSheetName];
        // Get the data as JSON, with headers
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        // Clear previous values
        this.columnValues = [];

        // Push values from the first column, skipping the header
        for (let i = 1; i < jsonData.length; i++) {
          if (jsonData[i][0]) { // Check if the cell is not empty
            this.columnValues.push(jsonData[i][0]);
          }
        }

        const invalidOrderIds = this.ticketOrderIdList.filter(value => this.columnValues.includes(value))

        this.disableUploadBtn = invalidOrderIds.length ? true : false;

        console.log("this.columnValues: ", this.columnValues);
        console.log("this.ticketOrderIdList: ", this.ticketOrderIdList);
        console.log("invalidOrderIds: ", invalidOrderIds);
        console.log(this.disableUploadBtn);

        if (!invalidOrderIds.length) {
          this.disableUploadBtn = false;
        } else {
          this.disableUploadBtn = true;
          const errorMsg = "Following Order Ids already exist: " + invalidOrderIds.join(',');
          this.notificationService.openErrorSnackBar(errorMsg);
        }

      }

      reader.onerror = (error) => {
        console.error('Error reading file:', error);
      };

      // Read the file as an ArrayBuffer
      reader.readAsArrayBuffer(this.excelFile);


    }


  }

  uploadFile() {
    this.disableUploadBtn = true;
    const formData = new FormData();
    if (this.excelFile) {
      formData.append('file', this.excelFile);
    }

    this.registrationService.uploadExcel(formData).subscribe((res) => {
      this.notificationService.openSucessSnackBar("File Uploaded Successfully")
      this.excelFile = null;
    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("File Upload Failed: " + error.error);
    })
  }

  getAllTicketOrderId() {
    this.ticketOrderIdList = [];
    this.ticketService.getAllTickets().subscribe((res) => {
      res.forEach((ticket, index) => {
        this.ticketOrderIdList.push(ticket.order_id);
      })
    }, (error) => {
      console.log("ERROR: ", error);
    });
  }

}
