export type EventStatus = 'draft' | 'active' | 'archived';
import { PassCategory } from '../core/pass-categories';

export type PassTypeCategory = PassCategory;

export interface PassType {
  _id: string;
  event: string;
  name: string;
  category: PassTypeCategory;
  // Short prefix (1-4 chars) used to number physical accommodation units
  // created against a 'stay_pass'-category PassType, e.g. "Solo Tent" -> "SO" ->
  // SO1, SO2... Optional — only meaningful for category 'stay_pass', and even
  // then may be unset until Accommodation Setup prompts for one. See
  // ACCOMMODATION_CONTEXT.md decision #11.
  code?: string;
  // Bed model (I0): beds one Stay Pass of this type gives — one Festival Pass
  // per bed. Stay Pass category only; default 1. "Beds per pass" in Admin › Events.
  beds?: number;
  // External Booking Import (I1): the sales system's item_code ("Sales system
  // code"), stored lower-case. The importer matches on it first, then the name.
  externalCode?: string;
  // Accommodation › Setup only (GET /tentPassTypes): active Stay Passes of
  // this type and the beds they need.
  passCount?: number;
  bedsNeeded?: number;
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
  /** Early Check-In email wording (EC2); empty = default. */
  checkinEmail?: { subject: string; intro: string };
  /** Sales system sync (I3 / I4): the ONE event that bookings from the sales
   *  system go into. Top roles switch it in Admin › Events. */
  salesSync?: boolean;
}

// Response shape of GET /admin/events/:id — the plain EventItem plus its
// PassTypes and (if any) its Tent inventory.
export interface EventDetail extends EventItem {
  passTypes: PassType[];
  tents: any[];
}
