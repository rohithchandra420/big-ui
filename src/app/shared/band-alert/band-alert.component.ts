import { Component, Input } from '@angular/core';

import { BandLookup } from '../../box-office/box-office.service';

/**
 * The red "Replaced band" flag (Workshops epic, W1). Shown wherever a band is
 * scanned when that band was replaced: who it belonged to, why, and which band
 * they have now. The caller blocks its own action until staff decide — the
 * buttons stay with the caller (projected below the details).
 */
@Component({
  selector: 'app-band-alert',
  templateUrl: './band-alert.component.html',
  styleUrls: ['./band-alert.component.css']
})
export class BandAlertComponent {
  @Input() band!: BandLookup;
}
