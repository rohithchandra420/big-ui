import { Component, Input } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { PublicMusic } from '../core/public-api.service';
import { I18nService, TPipe } from '../core/i18n';
import { timeLabel } from '../core/festival-time';
import { isPlaying } from '../core/music';

const MUSIC_DOT = '#6b46c1';

/** One music slot on the timeline (Home "On stage", Schedule "Music"). Not tappable: nothing more to show. */
@Component({
  selector: 'pub-music-row',
  standalone: true,
  imports: [NgIf, TPipe],
  template: `
    <div class="tl-row" [style.--dot]="dot" [class.over]="over">
      <div class="tl-time">{{ start }}<small>{{ end }}</small></div>
      <div class="tl-card">
        <div class="tl-main">
          <div class="tl-info">
            <div class="tl-soon" *ngIf="playing"><span class="live-dot"></span> {{ 'music.now' | t }}</div>
            <h4>{{ slot.act }}</h4>
            <div class="meta">
              <span [style.color]="dot"><span class="ms" [style.color]="dot">music_note</span>{{ slot.genre || ('music.tag' | t) }}</span>
              <span><span class="ms">location_on</span>{{ slot.stage }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>`,
})
export class MusicRowComponent {
  @Input({ required: true }) slot!: PublicMusic;
  @Input() now = Date.now();
  readonly dot = MUSIC_DOT;
  constructor(private i18n: I18nService) {}
  get start(): string { return timeLabel(Date.parse(this.slot.start), this.i18n.lang); }
  get end(): string { return timeLabel(Date.parse(this.slot.end), this.i18n.lang); }
  get over(): boolean { return this.now >= Date.parse(this.slot.end); }
  get playing(): boolean { return isPlaying(this.slot, this.now); }
}

/** A titled music list; hidden when empty. */
@Component({
  selector: 'pub-music-list',
  standalone: true,
  imports: [NgIf, NgFor, TPipe, MusicRowComponent],
  template: `
    <section *ngIf="music.length">
      <div class="sec-head"><span class="ms music-ic">queue_music</span><h2>{{ title | t }}</h2><span class="hand">{{ 'music.hand' | t }}</span></div>
      <div class="timeline">
        <pub-music-row *ngFor="let m of music; trackBy: track" [slot]="m" [now]="now"></pub-music-row>
      </div>
    </section>`,
})
export class MusicListComponent {
  @Input() music: PublicMusic[] = [];
  @Input() now = Date.now();
  @Input() title: 'music.title' | 'music.preview' | 'music.day' = 'music.title';
  track = (_: number, m: PublicMusic) => m.id;
}

/** A music act playing now, as a card in Home's "Live now" rail (2026-11-20). Not tappable. */
@Component({
  selector: 'pub-live-music-card',
  standalone: true,
  imports: [TPipe],
  template: `
    <div class="live-card">
      <div class="live-open">
        <div class="ph" [style.--c1]="dot">
          <span class="ms ph-ic">music_note</span>
          <span class="badge"><span class="dot"></span>{{ 'live.left' | t: { n: minsLeft } }}</span>
          <span class="cat">{{ slot.genre || ('music.tag' | t) }}</span>
        </div>
        <div class="live-body">
          <h3>{{ slot.act }}</h3>
          <div class="music-now"><span class="live-dot"></span>{{ 'music.now' | t }}</div>
          <div class="meta">
            <span><span class="ms">location_on</span>{{ slot.stage }}</span>
            <span><span class="ms">schedule</span>{{ start }}–{{ end }}</span>
          </div>
        </div>
      </div>
    </div>`,
})
export class LiveMusicCardComponent {
  @Input({ required: true }) slot!: PublicMusic;
  @Input() now = Date.now();
  readonly dot = MUSIC_DOT;
  constructor(private i18n: I18nService) {}
  get minsLeft(): number { return Math.max(1, Math.ceil((Date.parse(this.slot.end) - this.now) / 60000)); }
  get start(): string { return timeLabel(Date.parse(this.slot.start), this.i18n.lang); }
  get end(): string { return timeLabel(Date.parse(this.slot.end), this.i18n.lang); }
}
