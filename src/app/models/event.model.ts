export type EventStatus = 'draft' | 'active' | 'archived';
export type PassTypeCategory = 'festival' | 'tent' | 'addon';

export interface PassType {
  _id: string;
  event: string;
  name: string;
  category: PassTypeCategory;
}

export interface EventItem {
  _id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  status: EventStatus;
  createdBy?: string;
}

// Response shape of GET /admin/events/:id — the plain EventItem plus its
// PassTypes and (if any) its Tent inventory.
export interface EventDetail extends EventItem {
  passTypes: PassType[];
  tents: any[];
}
