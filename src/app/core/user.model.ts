export class User {
    public _id: string;
    public name: string;
    public email: string;
    public bookingId: string;
    public role?: string;
    public ticketId: string;
    public _token: string;

    constructor(_id: string, name: string, email: string, bookingId: string, role: string, ticketId: string, token: string) {
        this._id = _id;
        this.name = name;
        this.email = email;
        this.bookingId = bookingId;
        this.role = role;
        this.ticketId = ticketId;
        this._token = token;
    }

    // get token() {
    //     return this._token;
    // }
}