import { Injectable } from "@angular/core";
import { HttpClient, HttpHeaders, HttpParams } from "@angular/common/http";

import { environment } from "src/environments/environment.development";
import { Tent } from "../models/tent.model";
import { Gender, Shopcart } from "../models/ticket.model";

export interface TentAllocationResult {
    tent: Tent;
    tentPassItem: Shopcart;
    festivalPassItem: Shopcart | null;
}

@Injectable()
export class AccomodationService {

    url = environment.URL;

    constructor(private http: HttpClient) {
    }

    createTents(tentData) {
        return this.http.post<[Tent]>(this.url + '/createTents', tentData);
    }

    getAllTents() {
        return this.http.get<[Tent]>(this.url + '/getAllTents');
    }

    getAllFestivalTickets() {
        return this.http.get<[[Shopcart]]>(this.url + '/getAllFestivalTickets');
    }

    removeOccupant(tentDetails) {
        return this.http.post<Tent>(this.url + '/removeOccupant', tentDetails);
    }

    // ── Shared allocate/vacate/suggest — used by Box Office Registration now
    //    and the future Tenting page later. Deliberately NOT duplicated into
    //    BoxOfficeService — see BOX_OFFICE_CONTEXT.md decision #7. ──
    getAvailableTents(tentType: string) {
        return this.http.get<Tent[]>(this.url + '/getAllVacantTentsByType/' + tentType);
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
    }) {
        return this.http.post<TentAllocationResult>(this.url + '/allocateTentSlot', payload);
    }

    vacateTentSlot(shopcartId: string) {
        return this.http.post<TentAllocationResult>(this.url + '/vacateTentSlot', { shopcartId });
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