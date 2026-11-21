export type EventStatus = 'draft' | 'active' | 'archived';
export type PassTypeCategory = 'festival' | 'tent' | 'addon';

export interface PassType {
  _id: string;
  event: string;
  name: string;
  category: PassTypeCategory;
  // Short prefix (1-4 chars) used to number physical accommodation units
  // created against a 'tent'-category PassType, e.g. "Solo Tent" -> "SO" ->
  // SO1, SO2... Optional — only meaningful for category 'tent', and even
  // then may be unset until Accommodation Setup prompts for one. See
  // ACCOMMODATION_CONTEXT.md decision #11.
  code?: string;
  // Bed model (I0): beds one Tent Pass of this type gives — one Festival Pass
  // per bed. Tent category only; default 1. "Beds per pass" in Admin › Events.
  beds?: number;
  // External Booking Import (I1): the sales system's item_code ("Sales system
  // code"), stored lower-case. The importer matches on it first, then the name.
  externalCode?: string;
}

export interface EventItem {
  _id: string;
  name: string;
  description: string;
  startDate?: string;
  endDate?: string;
  status: EventStatus;
  createdBy?: string;
  /** Ticket Email wording for this edition (Email epic). Empty = the
   *  default built from the event name. */
  ticketEmail?: { subject: string; intro: string };
}

// Response shape of GET /admin/events/:id — the plain EventItem plus its
// PassTypes and (if any) its Tent inventory.
export interface EventDetail extends EventItem {
  passTypes: PassType[];
  tents: any[];
}
