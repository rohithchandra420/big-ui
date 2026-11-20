import { Component, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';
import { ConfirmationService } from '../../shared/confirm-dialog/confirmation.service';
import { EventItem } from '../../models/event.model';
import { SortGetter, TableSort } from '../../shared/table-sort/table-sort';
import { MusicService } from '../music.service';
import { MusicAct, MusicData, MusicStage, MusicStageArea } from '../music.model';

type StageSortKey = 'name' | 'area' | 'slots';
type ActSortKey = 'name' | 'genre' | 'contact' | 'slots';
type Mode = 'closed' | 'stage' | 'act';

/**
 * Music › Setup (MUSIC_CONTEXT.md): the event's stages (each optionally on a
 * Venue Map "Stage area") and acts (artist / band, genre, contact, notes).
 * Stages: the Music TL / music:manage / top roles. Acts: also music:write.
 * Everyone else with Music access sees the tables read-only.
 */
@Component({
  selector: 'app-music-setup',
  templateUrl: './music-setup.component.html',
  styleUrls: ['./music-setup.component.css']
})
export class MusicSetupComponent implements OnInit, OnDestroy {
  event: EventItem | null = null;
  data: MusicData | null = null;
  areas: MusicStageArea[] = [];
  loading = false;
  loadError = '';
  busy = false;

  stageSort = new TableSort<StageSortKey>('name');
  readonly stageGetters: Record<StageSortKey, SortGetter<MusicStage>> = {
    name: s => s.name, area: s => s.area?.name || null, slots: s => s.slotCount
  };
  actSort = new TableSort<ActSortKey>('name');
  readonly actGetters: Record<ActSortKey, SortGetter<MusicAct>> = {
    name: a => a.name, genre: a => a.genre || null, contact: a => a.contactName || a.contactPhone || null, slots: a => a.slotCount
  };

  mode: Mode = 'closed';
  editStage: MusicStage | null = null;
  editAct: MusicAct | null = null;
  stageForm = { name: '', area: '', notes: '' };
  actForm = { name: '', genre: '', contactName: '', contactPhone: '', notes: '' };
  formError = '';

  private sub = new Subscription();

  constructor(
    private events: EventService,
    private music: MusicService,
    private notify: NotificationService,
    private confirm: ConfirmationService
  ) {}

  get canEdit(): boolean { return !!this.data?.canEdit; }
  get canManage(): boolean { return !!this.data?.canManage; }
  get sortedStages(): MusicStage[] { return this.stageSort.sorted(this.data?.stages || [], this.stageGetters); }
  get sortedActs(): MusicAct[] { return this.actSort.sorted(this.data?.acts || [], this.actGetters); }
  /** Stage areas free for this stage (not linked to another one). Stored list, filtered on open. */
  freeAreas: MusicStageArea[] = [];

  ngOnInit(): void {
    this.sub.add(this.events.activeEvent.subscribe(ev => {
      const changed = ev?._id !== this.event?._id;
      this.event = ev;
      if (changed) { this.close(); this.data = null; this.load(); }
    }));
  }

  ngOnDestroy(): void { this.sub.unsubscribe(); }

  async load(): Promise<void> {
    if (!this.event) { this.data = null; this.areas = []; return; }
    this.loading = !this.data;
    this.loadError = '';
    try {
      const [data, areas] = await Promise.all([this.music.load(this.event._id), this.music.stageAreas(this.event._id)]);
      this.data = data;
      this.areas = areas;
    } catch (err: any) {
      this.loadError = err?.error?.message || 'Could not load the music setup.';
    } finally {
      this.loading = false;
    }
  }

  // ── panel ──────────────────────────────────────────────────

  get panelTitle(): string {
    if (this.mode === 'stage') return this.editStage ? this.editStage.name : 'New stage';
    if (this.mode === 'act') return this.editAct ? this.editAct.name : 'New act';
    return '';
  }

  get panelIcon(): string { return this.mode === 'stage' ? 'stadium' : 'mic_external_on'; }

  /** Opens a stage: the form for the Manage group, details for everyone else. */
  openStage(s: MusicStage | null): void {
    if (!s && !this.canManage) return;
    this.editStage = s;
    this.stageForm = { name: s?.name || '', area: s?.area?._id || '', notes: s?.notes || '' };
    this.freeAreas = this.areas.filter(a => !a.usedBy || a.usedBy._id === s?._id);
    this.formError = '';
    this.mode = 'stage';
  }

  openAct(a: MusicAct | null): void {
    if (!a && !this.canEdit) return;
    this.editAct = a;
    this.actForm = { name: a?.name || '', genre: a?.genre || '', contactName: a?.contactName || '', contactPhone: a?.contactPhone || '', notes: a?.notes || '' };
    this.formError = '';
    this.mode = 'act';
  }

  close(): void {
    this.mode = 'closed';
    this.editStage = null;
    this.editAct = null;
  }

  async saveStage(): Promise<void> {
    const f = this.stageForm;
    if (!f.name.trim()) { this.formError = 'Give the stage a name.'; return; }
    if (!this.event) return;
    const body = { name: f.name.trim(), area: f.area || null, notes: f.notes.trim() };
    await this.run(async () => {
      if (this.editStage) await this.music.updateStage(this.editStage._id, body);
      else await this.music.addStage(this.event!._id, body);
      this.notify.openSucessSnackBar(this.editStage ? 'Stage saved' : 'Stage added');
    }, 'Could not save the stage.');
  }

  async saveAct(): Promise<void> {
    const f = this.actForm;
    if (!f.name.trim()) { this.formError = 'Give the artist / band name.'; return; }
    if (!this.event) return;
    const body = { name: f.name.trim(), genre: f.genre.trim(), contactName: f.contactName.trim(), contactPhone: f.contactPhone.trim(), notes: f.notes.trim() };
    await this.run(async () => {
      if (this.editAct) await this.music.updateAct(this.editAct._id, body);
      else await this.music.addAct(this.event!._id, body);
      this.notify.openSucessSnackBar(this.editAct ? 'Act saved' : 'Act added');
    }, 'Could not save the act.');
  }

  private async run(fn: () => Promise<void>, fallback: string): Promise<void> {
    this.busy = true;
    this.formError = '';
    try {
      await fn();
      this.close();
      await this.load();
    } catch (err: any) {
      this.formError = err?.error?.message || fallback;
    } finally {
      this.busy = false;
    }
  }

  removeStage(s: MusicStage): void {
    this.confirm.confirm({
      title: 'Delete Stage', message: `Delete the stage ${s.name}? Its Venue Map area stays on the map.`, confirmText: 'Delete', danger: true
    }).subscribe(ok => ok && this.removeWith(() => this.music.removeStage(s._id), 'Stage deleted', 'Could not delete the stage.'));
  }

  removeAct(a: MusicAct): void {
    this.confirm.confirm({
      title: 'Delete Act', message: `Delete ${a.name}?`, confirmText: 'Delete', danger: true
    }).subscribe(ok => ok && this.removeWith(() => this.music.removeAct(a._id), 'Act deleted', 'Could not delete the act.'));
  }

  private async removeWith(fn: () => Promise<unknown>, done: string, fallback: string): Promise<void> {
    try {
      await fn();
      this.notify.openSucessSnackBar(done);
      this.close();
      await this.load();
    } catch (err: any) {
      this.notify.openErrorSnackBar(err?.error?.message || fallback);
    }
  }

  trackId(_: number, x: { _id: string }) { return x._id; }
}
