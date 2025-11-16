export class User {
    public name: string;
    public email: string;
    public bookingId: string;
    public ticketId: string;
    public _token: string;
    public role: string;
    public _id?: string;

    constructor(name: string, email: string, bookingId: string, role: string, ticketId: string, token: string, _id?: string, ) {
        this.name = name;
        this.email = email;
        this.bookingId = bookingId;
        this.role = role;
        this.ticketId = ticketId;
        this._token = token;
        this._id = _id;
    }

    // get token() {
    //     return this._token;
    // }
}

export const RolePermissions: Record<string, string[]> = {
  GOD: ["*"],

  ADMIN: [
    "event:read", "event:write",
    "teams:read", "teams:write",
    "users:read", "users:write",
  ],

  TL: [
    "team:self:read",
    "team:self:write",
    "volunteers:self:read",
    "volunteers:self:write",
  ],

  VOLUNTEER: [
    "self:read",
    "team:read",
  ]
};