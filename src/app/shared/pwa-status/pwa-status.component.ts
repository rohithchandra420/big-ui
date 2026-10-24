import { Component, Input } from '@angular/core';
import { PwaService } from '../../core/pwa.service';

/**
 * PWA Phase 1 notices, on every page: Offline, "New version available",
 * Install (Android/desktop Chrome) and the iPhone "Add to Home Screen" hint.
 * Desktop: stacked bottom-left (the email progress card owns bottom-right).
 * Phone: at the top, under the menu bar when there is one.
 */
@Component({
  selector: 'app-pwa-status',
  templateUrl: './pwa-status.component.html',
  styleUrls: ['./pwa-status.component.css']
})
export class PwaStatusComponent {
  /** True when the sticky mobile menu bar is showing, so phone notices sit below it. */
  @Input() belowTopbar = false;

  constructor(public pwa: PwaService) { }
}
