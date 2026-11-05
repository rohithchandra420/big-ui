import { Component, HostListener, Input, OnChanges } from '@angular/core';
import { NgFor, NgIf } from '@angular/common';
import { Phase, PublicEdition, PublicPhoto } from '../core/public-api.service';
import { TPipe, WordKey } from '../core/i18n';

/**
 * Home (PH6): the photo mosaic staff chose (thumbnails; tap → full size) and
 * "BiG through the years" with an edition switcher. Hidden when empty.
 */
@Component({
  selector: 'pub-highlights',
  standalone: true,
  imports: [NgIf, NgFor, TPipe],
  template: `
    <section *ngIf="photos.length">
      <div class="sec-head"><h2>{{ title | t }}</h2><span class="hand">{{ 'hl.hand' | t }}</span></div>
      <div class="mosaic">
        <button type="button" class="tile" *ngFor="let p of photos; trackBy: track" [class.big]="p.layout === 'tall'" [class.wide]="p.layout === 'wide'" (click)="open = p">
          <img [src]="p.thumbUrl" [alt]="p.caption" loading="lazy" decoding="async">
          <span class="cap" *ngIf="p.caption">{{ p.caption }}<small *ngIf="p.sub">{{ p.sub }}</small></span>
        </button>
      </div>
    </section>

    <section *ngIf="stats.length">
      <div class="sec-head"><h2>{{ 'years.title' | t }}</h2></div>
      <div class="stats">
        <div class="stat" *ngFor="let s of current?.items || []; let i = index; trackBy: trackIndex" [style.background]="colours[i % colours.length]">
          <b>{{ s.value }}</b><span>{{ s.label }}</span><span class="ms">{{ s.icon }}</span>
        </div>
      </div>
      <div class="years" *ngIf="stats.length > 1" role="group">
        <button type="button" *ngFor="let e of stats; let i = index; trackBy: trackIndex" [class.on]="i === index" (click)="index = i">{{ e.edition }}</button>
      </div>
    </section>

    <div class="lightbox" *ngIf="open" (click)="open = null" role="dialog" aria-modal="true" [attr.aria-label]="open.caption">
      <img [src]="open.url" [alt]="open.caption">
      <p *ngIf="open.caption">{{ open.caption }}<span *ngIf="open.sub"> · {{ open.sub }}</span></p>
    </div>`,
})
export class HighlightsComponent implements OnChanges {
  @Input() photos: PublicPhoto[] = [];
  @Input() stats: PublicEdition[] = [];
  @Input() phase: Phase = 'during';

  readonly colours = ['#1E4638', '#e2467b', '#8a5cd1', '#f4a623'];
  index = 0;
  open: PublicPhoto | null = null;

  get title(): WordKey { return this.phase === 'before' ? 'hl.before' : this.phase === 'after' ? 'hl.after' : 'hl.during'; }
  get current(): PublicEdition | null { return this.stats[this.index] || null; }

  track = (_: number, p: PublicPhoto) => p.id;
  trackIndex = (i: number) => i;

  ngOnChanges(): void { if (this.index >= this.stats.length) this.index = 0; }

  @HostListener('document:keydown.escape') onEsc(): void { this.open = null; }
}
