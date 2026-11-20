import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";

import { environment } from "src/environments/environment.development";
import { Tent } from "../models/tent.model";
import { Gender, Shopcart } from "../models/ticket.model";

export interface TentAllocationResult {
    tent: Tent;
    tentPassItem: Shopcart;
    festivalPassItem: Shopcart | null;
    /** Bed model (I0): the Tent Pass's beds after the change. */
    stay?: StayView | null;
}

/** A Tent Pass's beds and who is in them (bed model I0). */
export interface StayView {
    tentPassId: string;
    beds: number;
    used: number;
    tentId: string | null;
    people: { _id: string; name: string; gender: string | null; isAdmitted: boolean; tentId: string; tent_no: string }[];
}

@Injectable()
export class AccomodationService {

    url = environment.URL;

    constructor(private http: HttpClient) {
    }

    // Batch-creates numbered units against one existing Tent-category
    // PassType — see ACCOMMODATION_CONTEXT.md decisions #1, #2. 400s with
    // { code: 'NO_PASSTYPE_CODE' } if the PassType has no code set yet.
    createTents(payload: { eventId: string; passTypeId: string; capacity: number; quantity: number }) {
        return this.http.post<Tent[]>(this.url + '/createTents', payload);
    }

    /** The event's Tent-category pass types (for Setup — the full event detail is DEV/DIR/ADMIN only). */
    getTentPassTypes(eventId: string) {
        return this.http.get<any[]>(this.url + '/tentPassTypes', { params: new HttpParams().set('eventId', eventId) });
    }

    getAllTents(eventId: string) {
        return this.http.get<Tent[]>(this.url + '/getAllTents', { params: new HttpParams().set('eventId', eventId) });
    }

    updateTent(tentId: string, payload: { tent_no?: string; capcity?: number }) {
        return this.http.patch<Tent>(this.url + '/updateTent/' + tentId, payload);
    }

    deleteTent(tentId: string) {
        return this.http.delete<{ message: string }>(this.url + '/deleteTent/' + tentId);
    }

    // ── Shared allocate/vacate/suggest — used by Box Office Registration now
    //    and the Accommodation Inventory page too. Deliberately NOT duplicated
    //    into BoxOfficeService — see BOX_OFFICE_CONTEXT.md decision #7. ──
    getAvailableTents(passTypeId: string) {
        return this.http.get<Tent[]>(this.url + '/getAllVacantTentsByType/' + passTypeId);
    }

    getTentById(tentId: string) {
        return this.http.get<Tent>(this.url + '/getTentById/' + tentId);
    }

    allocateTentSlot(payload: {
        tentPassId: string;
        festivalPassId: string;
        tentId?: string;
        gender?: Gender;
        overrideGenderMismatch?: boolean;
        overrideUnitMismatch?: boolean;
    }) {
        return this.http.post<TentAllocationResult>(this.url + '/allocateTentSlot', payload);
    }

    /** Frees one bed. A Tent Pass with several beds taken needs the Festival Pass (which bed). */
    vacateTentSlot(shopcartId: string, festivalPassId?: string) {
        return this.http.post<TentAllocationResult>(this.url + '/vacateTentSlot', festivalPassId ? { shopcartId, festivalPassId } : { shopcartId });
    }

    getStay(tentPassId: string) {
        return this.http.get<StayView>(this.url + '/stay/' + tentPassId);
    }

    // eventId is required server-side (validated in tenting.js) — the caller
    // must supply the active event's id, e.g. via EventService.currentActiveEvent.
    suggestFestivalPassMatches(eventId: string, params: { name?: string; phone?: string; email?: string }) {
        let httpParams = new HttpParams().set('eventId', eventId);
        if (params.name) httpParams = httpParams.set('name', params.name);
        if (params.phone) httpParams = httpParams.set('phone', params.phone);
        if (params.email) httpParams = httpParams.set('email', params.email);
        return this.http.get<Shopcart[]>(this.url + '/suggestFestivalPassMatches', { params: httpParams });
    }
}