export class Shopcart {
    public item_name: string;
    public item_quantity: number;
    public item_subtotal: number;
    public item_subtotal_tax: number;
    public order_id: number;
    public admissionId: string;
    public isAdmitted: boolean;
    public isActive: boolean;
    public name?: string;
    public phone_no?: string;
    public email?: string;
    public _id?: string;
    
    constructor(item_name: string, item_quantity: number, item_subtotal: number, item_subtotal_tax: number,
        order_id: number, admissionId: string, isAdmitted: boolean, isActive:boolean, name?: string, phone_no?: string, email?: string,  _id?: string ) {
            this.item_name = item_name;
            this.item_quantity = item_quantity;
            this.item_subtotal = item_subtotal;
            this.item_subtotal_tax = item_subtotal_tax;
            this.order_id = order_id;
            this.admissionId = admissionId;
            this.isAdmitted = isAdmitted;
            this.isActive = isActive;
            this.name = name;
            this.phone_no = phone_no;
            this.email = email;
            this._id = _id
    }
}

export class Ticket {
    public order_id: number;
    public first_name: string;
    public last_name: string;
    public email: string;
    public transaction_id: string;
    public hasEmailSent: string;
    public shopcart?: Shopcart[];
    public _id?: string;

    
   constructor(order_id: number, first_name: string, last_name: string, email: string, transaction_id: string, hasEmailSent: string , shopcart?: Shopcart[], _id?: string) {
    this.order_id = order_id;
    this.first_name = first_name;
    this.last_name = last_name;
    this.email = email;
    this.transaction_id = transaction_id;
    this.hasEmailSent = hasEmailSent;    
    this.shopcart = shopcart;
    this._id = _id;
   }
}