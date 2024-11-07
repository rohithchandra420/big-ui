import { Shopcart } from "./ticket.model";

export class Tent {
    public tent_type: string;
    public tent_no: string;
    public capcity: number;
    public occupants?: Shopcart[];
    public _id?: string;

    
   constructor(tent_type: string, tent_no: string, capcity: number, occupants?: Shopcart[], _id?: string) {
    this.tent_type = tent_type;
    this.tent_no = tent_no;
    this.capcity = capcity; 
    this.occupants = occupants;
    this._id = _id;
   }
}