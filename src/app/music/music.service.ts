import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import {
  ActInput, MusicAct, MusicClash, MusicData, MusicSlot, MusicStage, MusicStageArea, SlotInput, StageInput
} from './music.model';

type SlotSaved = { slot: MusicSlot; clashes: MusicClash[] };

/** Music: stages, acts and slots of one event (big-api routers/music.js). */
@Injectable({ providedIn: 'root' })
export class MusicService {
  private url = environment.URL + '/music';

  constructor(private http: HttpClient) {}

  load(eventId: string): Promise<MusicData> {
    return firstValueFrom(this.http.get<MusicData>(this.url, { params: { event: eventId } }));
  }

  stageAreas(eventId: string): Promise<MusicStageArea[]> {
    return firstValueFrom(this.http.get<MusicStageArea[]>(this.url + '/stage-areas', { params: { event: eventId } }));
  }

  addStage(eventId: string, data: StageInput): Promise<MusicStage> {
    return firstValueFrom(this.http.post<MusicStage>(this.url + '/stages', { event: eventId, ...data }));
  }

  updateStage(id: string, data: StageInput): Promise<MusicStage> {
    return firstValueFrom(this.http.patch<MusicStage>(`${this.url}/stages/${id}`, data));
  }

  removeStage(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(this.http.delete<{ deleted: boolean }>(`${this.url}/stages/${id}`));
  }

  addAct(eventId: string, data: ActInput): Promise<MusicAct> {
    return firstValueFrom(this.http.post<MusicAct>(this.url + '/acts', { event: eventId, ...data }));
  }

  updateAct(id: string, data: ActInput): Promise<MusicAct> {
    return firstValueFrom(this.http.patch<MusicAct>(`${this.url}/acts/${id}`, data));
  }

  removeAct(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(this.http.delete<{ deleted: boolean }>(`${this.url}/acts/${id}`));
  }

  addSlot(eventId: string, data: SlotInput): Promise<SlotSaved> {
    return firstValueFrom(this.http.post<SlotSaved>(this.url + '/slots', { event: eventId, ...data }));
  }

  updateSlot(id: string, data: SlotInput): Promise<SlotSaved> {
    return firstValueFrom(this.http.patch<SlotSaved>(`${this.url}/slots/${id}`, data));
  }

  removeSlot(id: string): Promise<{ deleted: boolean }> {
    return firstValueFrom(this.http.delete<{ deleted: boolean }>(`${this.url}/slots/${id}`));
  }
}
