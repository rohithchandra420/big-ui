export interface DepartmentAccess {
    department: { _id: string; name: string };
    access: ('read' | 'write')[];
}

export interface UserProfile {
    _id: string;
    name: string;
    email: string;
    phone?: string;
    role: { _id: string; name: string };
    departments: DepartmentAccess[];
    permissions: string[];
    dateOfJoining?: string;
}

export class User {
    public name: string;
    public email: string;
    public bookingId: string;
    public ticketId: string;
    public _token: string;
    public role: string;
    public _id?: string;
    public phone?: string;
    public departments?: DepartmentAccess[];
    public permissions?: string[];

    constructor(
        name: string, email: string, bookingId: string, role: string,
        ticketId: string, token: string, _id?: string, phone?: string,
        departments?: DepartmentAccess[], permissions?: string[]
    ) {
        this.name = name;
        this.email = email;
        this.bookingId = bookingId;
        this.role = role;
        this.ticketId = ticketId;
        this._token = token;
        this._id = _id;
        this.phone = phone;
        this.departments = departments || [];
        this.permissions = permissions || [];
    }
}