import { Shopcart } from "./ticket.model";
import { PassTypeCategory } from "./event.model";

// Populated shape of Tent.passType as returned by getAllTents/getTentById
// (backend populates 'name category code').
export interface TentPassType {
    _id: string;
    name: string;
    category: PassTypeCategory;
    code?: string;
}

export class Tent {
    public passType: TentPassType | string;
    public tent_no: string;
    public capcity: number;
    public occupants?: (Shopcart | null)[];
    public _id?: string;
    public event?: string;

    constructor(passType: TentPassType | string, tent_no: string, capcity: number, occupants?: (Shopcart | null)[], _id?: string) {
        this.passType = passType;
        this.tent_no = tent_no;
        this.capcity = capcity;
        this.occupants = occupants;
        this._id = _id;
    }
}
