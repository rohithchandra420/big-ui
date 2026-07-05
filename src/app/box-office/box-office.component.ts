import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormArray, FormBuilder, FormControl, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';

import { Ticket } from '../models/ticket.model';
import { User } from '../core/user.model';
import { BoxOfficeService } from './box-office.service';
import { NotificationService } from '../core/notification.service';
import { TicketsService } from '../tickets/tickets.service';
import { AuthService } from '../core/auth.service';

@Component({
  selector: 'app-box-office',
  templateUrl: './box-office.component.html',
  styleUrls: ['./box-office.component.css']
})
export class BoxOfficeComponent implements OnInit, OnDestroy {

  shopForm: FormGroup;
  ticketList: Ticket[] = [];
  ticketOrderIdList: any[] = [];
  columnValues: any[] = [];
  excelFile: File | null = null;
  disableUploadBtn = true;

  currentUser: User | null = null;
  private userSub!: Subscription;

  constructor(
    private boxOfficeService: BoxOfficeService,
    private notificationService: NotificationService,
    private ticketService: TicketsService,
    private authService: AuthService,
    private fb: FormBuilder
  ) {
    this.shopForm = this.fb.group({
      firstName: ['', Validators.required],
      lastName: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      phoneNo: ['', Validators.required],
      orderId: new FormControl(null, [Validators.required]),
      transactionId: new FormControl(null, [Validators.required]),
      totalPrice: new FormControl(null, Validators.required),
      shopcart: this.fb.array([])
    });
  }

  ngOnInit() {
    this.userSub = this.authService.user.subscribe(user => {
      this.currentUser = user;
    });
    this.getAllTicketOrderId();
  }

  ngOnDestroy() {
    this.userSub?.unsubscribe();
  }

  // DEV, DIR, ADMIN always; TL with box-office permission or Box Office department
  get canSubmit(): boolean {
    if (!this.currentUser) return false;
    if (['DEV', 'DIR', 'ADMIN'].includes(this.currentUser.role)) return true;
    if (this.currentUser.role === 'TL') {
      return this.authService.hasPermission(this.currentUser, 'box-office:read') ||
             this.authService.hasDepartmentAccess(this.currentUser, 'Box Office');
    }
    return false;
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
    this.shopcart.removeAt(this.shopcart.length - 1);
  }

  validateValuesandSubmit() {
    this.ticketOrderIdList = [];
    this.ticketService.getAllTickets().subscribe((res) => {
      res.forEach((ticket) => {
        this.ticketOrderIdList.push(ticket.order_id);
      });
      const invalidOrderId = this.ticketOrderIdList.includes(this.shopForm.value.orderId);
      if (!invalidOrderId) {
        this.submitTicketValues();
      } else {
        this.notificationService.openErrorSnackBar("Order Id already exists");
      }
    }, (error) => {
      console.log("ERROR: ", error);
    });
  }

  submitTicketValues() {
    if (this.shopForm.valid) {
      const formData = this.shopForm.value;
      const ticket = new Ticket(
        formData.orderId, formData.firstName, formData.lastName,
        formData.email, formData.phoneNo, formData.transactionId,
        "Not Yet", formData.totalPrice, formData.shopcart
      );
      this.boxOfficeService.createTicket(ticket).subscribe((res) => {
        this.notificationService.openSucessSnackBar("Ticket created for Order #" + res.order_id);
        this.getAllTicketOrderId();
      }, (error) => {
        console.log(error);
        this.notificationService.openErrorSnackBar("Failed to create Ticket: " + error.error);
      });
    }
  }

  onFileSelected(event: Event) {
    this.excelFile = (event.target as HTMLInputElement).files?.[0] ?? null;
    if (this.excelFile?.name.endsWith('.xlsx')) {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        import('xlsx').then(XLSX => {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const worksheet = workbook.Sheets[workbook.SheetNames[0]];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          this.columnValues = [];
          for (let i = 1; i < jsonData.length; i++) {
            if (jsonData[i][0]) this.columnValues.push(jsonData[i][0]);
          }
          const invalidOrderIds = this.ticketOrderIdList.filter(v => this.columnValues.includes(v));
          this.disableUploadBtn = invalidOrderIds.length > 0;
          if (invalidOrderIds.length) {
            this.notificationService.openErrorSnackBar("Following Order Ids already exist: " + invalidOrderIds.join(', '));
          }
        });
      };
      reader.onerror = (error) => console.error('Error reading file:', error);
      reader.readAsArrayBuffer(this.excelFile);
    }
  }

  uploadFile() {
    this.disableUploadBtn = true;
    const formData = new FormData();
    if (this.excelFile) formData.append('file', this.excelFile);
    this.boxOfficeService.uploadExcel(formData).subscribe(() => {
      this.notificationService.openSucessSnackBar("File Uploaded Successfully");
      this.getAllTicketOrderId();
      this.excelFile = null;
    }, (error) => {
      console.log(error);
      this.notificationService.openErrorSnackBar("File Upload Failed: " + error.error);
    });
  }

  getAllTicketOrderId() {
    this.ticketOrderIdList = [];
    this.ticketService.getAllTickets().subscribe((res) => {
      res.forEach((ticket) => this.ticketOrderIdList.push(ticket.order_id));
    }, (error) => {
      console.log("ERROR: ", error);
    });
  }
}
