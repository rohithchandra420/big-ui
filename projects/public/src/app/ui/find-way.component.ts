import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Subscription } from 'rxjs';
import { PublicMapArea, PublicMapPin } from '../core/public-api.service';
import { TPipe, WordKey } from '../core/i18n';
import { Shortcut, nearest, placesFor, walkMinutes } from '../core/map-data';
import { MyLocationService } from '../core/my-location.service';

interface ShortcutRow { kind: Shortcut; icon: string; colour: string; word: WordKey; placeId: string | null; name: string; minutes: number | null; }

const SHORTCUTS: { kind: Shortcut; icon: string; colour: string; word: WordKey }[] = [
  { kind: 'water', icon: 'water_drop', colour: '#0284c7', word: 'map.water' },
  { kind: 'firstAid', icon: 'local_hospital', colour: '#dc2626', word: 'map.firstAid' },
  { kind: 'toilets', icon: 'wc', colour: '#64748b', word: 'map.toilets' },
  { kind: 'boxOffice', icon: 'confirmation_number', colour: '#7c3aed', word: 'map.boxOffice' },
];

/**
 * Home (PH4a): "Find your way" — the nearest water, first aid, toilets and
 * Box Office (walking minutes once the phone shares its location), each opens
 * the map there — and the staff's help tiles under "Need a hand?".
 */
@Component({
  selector: 'pub-find-way',
  standalone: true,
  imports: [NgIf, NgFor, TPipe],
  template: `
    <section *ngIf="hasMap">
      <div class="sec-head">
        <h2>{{ 'find.title' | t }}</h2><span class="hand">{{ 'find.hand' | t }}</span>
        <div class="sp"></div>
        <button type="button" class="lnk" (click)="openMap.emit(null)">{{ 'find.openMap' | t }}</button>
      </div>
      <div class="near">
        <button type="button" *ngFor="let r of rows; trackBy: trackKind" [disabled]="!r.placeId" (click)="openMap.emit(r.placeId)" [style.--ic]="r.colour">
          <span class="ms">{{ r.icon }}</span>
          <span class="near-name">{{ r.word | t }}</span>
          <b *ngIf="r.minutes !== null">{{ 'find.min' | t: { n: r.minutes } }}</b>
          <small *ngIf="r.minutes === null">{{ r.placeId ? r.name : ('find.none' | t) }}</small>
        </button>
      </div>
      <button type="button" class="use-loc" *ngIf="!haveLocation" (click)="useLocation()">
        <span class="ms">my_location</span>{{ 'find.useLocation' | t }}
      </button>
    </section>

    <section *ngIf="help.length">
      <div class="sec-head"><h2>{{ 'help.title' | t }}</h2></div>
      <div class="help">
        <button type="button" *ngFor="let h of help; let i = index; trackBy: trackIndex" (click)="openHelp.emit(h)">
          <span class="ms">{{ h.icon }}</span><b>{{ h.title }}</b><span class="s">{{ h.text }}</span>
        </button>
      </div>
    </section>`,
})
export class FindWayComponent implements OnInit, OnChanges, OnDestroy {
  @Input() pins: PublicMapPin[] = [];
  @Input() areas: PublicMapArea[] = [];
  @Input() help: { icon: string; title: string; text: string }[] = [];
  /** A place id to show on the map (null = just open the map). */
  @Output() openMap = new EventEmitter<string | null>();
  @Output() openHelp = new EventEmitter<{ icon: string; title: string; text: string }>();

  rows: ShortcutRow[] = [];
  haveLocation = false;
  private sub?: Subscription;

  constructor(private me: MyLocationService) {}

  get hasMap(): boolean { return this.pins.length > 0 || this.areas.length > 0; }

  trackKind = (_: number, r: ShortcutRow) => r.kind;
  trackIndex = (i: number) => i;

  ngOnInit(): void {
    this.sub = this.me.location$.subscribe(loc => { this.haveLocation = !!loc; this.build(); });
  }
  ngOnChanges(): void { this.build(); }
  ngOnDestroy(): void { this.sub?.unsubscribe(); }

  useLocation(): void { this.me.request(); }

  private build(): void {
    const at = this.me.current?.at || null;
    this.rows = SHORTCUTS.map(s => {
      const n = nearest(placesFor(s.kind, this.pins, this.areas), at);
      return { ...s, placeId: n?.place.id || null, name: n?.place.name || '', minutes: n && n.metres !== null ? walkMinutes(n.metres) : null };
    });
  }
}
