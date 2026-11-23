export type Gender = 'Male' | 'Female' | 'Prefer not to say';
export type PassCategory = 'festival' | 'tent' | 'addon';
/** Payment method of an imported booking (External Booking Import). */
export type TicketKind = 'online' | 'offline' | 'guest_list';

export class Shopcart {
    public item_name: string;
    public item_quantity: number;
    public order_id: number;
    public admissionId: string;
    public isAdmitted: boolean;
    public isActive: boolean;
    public name?: string;
    public phone_no?: string;
    public email?: string;
    public _id?: string;
    public gender?: Gender | null;
    public allocatedTentId?: string | null;
    public linkedPassId?: string | null;
    /** Bed model (I0): Tent Pass only — beds it gives (one Festival Pass per bed). */
    public beds?: number;
    // Introducing Events (see INTRODUCING_EVENTS_CONTEXT.md) — item_name
    // above stays authoritative for the legacy Tickets module (untouched,
    // decision #3), these are populated for anything created through the
    // current Box Office flow instead.
    public event?: string;
    public passType?: string;
    public category?: PassCategory;
    public passTypeName?: string;
    /** The linked wrist band's id (Workshops epic, W1) — null until admitted. */
    public band?: string | null;
    // External Booking Import (I1): the sales system's item_code / item_id and prices.
    public externalCode?: string | null;
    public externalItemId?: string | null;
    public unitPriceExGst?: number | null;
    public lineTotalExGst?: number | null;
    /** The booking's ID, copied onto each pass when the booking is created (reference, else the order id). */
    public bookingId?: string | null;

    constructor(item_name: string, item_quantity: number, order_id: number, admissionId: string,
         isAdmitted: boolean, isActive:boolean, name?: string, phone_no?: string, email?: string,  _id?: string,
         gender?: Gender | null, allocatedTentId?: string | null, linkedPassId?: string | null) {
            this.item_name = item_name;
            this.item_quantity = item_quantity;
            this.order_id = order_id;
            this.admissionId = admissionId;
            this.isAdmitted = isAdmitted;
            this.isActive = isActive;
            this.name = name;
            this.phone_no = phone_no;
            this.email = email;
            this._id = _id
            this.gender = gender;
            this.allocatedTentId = allocatedTentId;
            this.linkedPassId = linkedPassId;
    }
}

/** Ticket Email delivery state (Email epic, see EMAIL_CONTEXT.md). Replaces
 *  the old free-text `hasEmailSent: 'Yes' | 'Not Yet'`. */
export type TicketEmailStatus = 'not_sent' | 'sending' | 'sent' | 'bounced' | 'failed' | 'no_email';

export interface TicketEmail {
    status: TicketEmailStatus;
    sentAt?: string | null;
    error?: string | null;
}

/** Early Check-In email (EC2, EARLY_CHECKIN_CONTEXT.md). "Expired" is not
 *  stored: it is 'sent' with expiresAt passed (see earlyCheckinStatus()). */
export type EarlyCheckinStatus = 'not_sent' | 'sending' | 'sent' | 'failed' | 'no_email' | 'submitted';

export interface EarlyCheckin {
    status: EarlyCheckinStatus;
    sentAt?: string | null;
    expiresAt?: string | null;
    submittedAt?: string | null;
    error?: string | null;
}

export class Ticket {
    public order_id: number;
    public first_name: string;
    public last_name: string;
    public email: string;
    public phone_no: string;
    public transaction_id: string;
    public ticketEmail: TicketEmail;
    public earlyCheckin?: EarlyCheckin;
    public totalPrice: number;
    public shopcart?: Shopcart[];
    public _id?: string;
    public event?: string; // Introducing Events — see Shopcart.event above
    // External Booking Import (I1). Imported bookings have no order_id.
    /** The sales system's Booking ID. */
    public reference?: string;
    public kind?: TicketKind | null;
    public paidAt?: string | null;
    public paymentOrderId?: string | null;
    public paymentId?: string | null;
    /** Bookings this one links to (a stay booking → its Festival Pass booking(s)). */
    public linkedReferences?: string[];
    public sourceUpdatedAt?: string | null;
    public source?: 'external' | null;
    // Sales system sync (I3 / I4)
    public bookingStatus?: 'paid' | 'cancelled' | null;
    public cancelledAt?: string | null;
    /** What an update / cancel from the sales system left for staff to check. */
    public syncFlags?: { message: string; at: string }[];


   constructor(order_id: number, first_name: string, last_name: string, email: string, phone_no:string, transaction_id: string,
    ticketEmailStatus: TicketEmailStatus, totalPrice: number, shopcart?: Shopcart[], _id?: string) {
    this.order_id = order_id;
    this.first_name = first_name;
    this.last_name = last_name;
    this.email = email;
    this.phone_no = phone_no;
    this.transaction_id = transaction_id;
    this.ticketEmail = { status: ticketEmailStatus };
    this.totalPrice = totalPrice;
    this.shopcart = shopcart;
    this._id = _id;
   }
}