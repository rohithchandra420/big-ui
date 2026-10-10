import { ChangeDetectionStrategy, ChangeDetectorRef, Component, Input, OnChanges, OnDestroy, OnInit } from '@angular/core';
import { Subscription } from 'rxjs';

import { AvatarService } from '../../core/avatar.service';

/**
 * Round user avatar: the profile photo if the user has one, otherwise their
 * initial on the brand colour. Used everywhere a person is shown (Users,
 * sidebar, Profile, Departments, My Department).
 *
 *   <app-user-avatar [userId]="u._id" [name]="u.name" [version]="u.avatarVersion" [size]="24">
 */
@Component({
  selector: 'app-user-avatar',
  templateUrl: './user-avatar.component.html',
  styleUrls: ['./user-avatar.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class UserAvatarComponent implements OnInit, OnChanges, OnDestroy {

  @Input() userId: string | null | undefined = null;
  @Input() name = '';
  /** avatarVersion from whatever list the user came from; 0/missing = no photo. */
  @Input() version: number | null | undefined = 0;
  /** Diameter in px. */
  @Input() size = 32;
  /** Greys the fallback out (e.g. deactivated users). */
  @Input() muted = false;

  photoUrl: string | null = null;

  private versionsSub?: Subscription;
  private photoSub?: Subscription;
  private shownKey = '';

  constructor(private avatarService: AvatarService, private cdr: ChangeDetectorRef) { }

  get initial(): string {
    return (this.name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  get fontSize(): number {
    return Math.round(this.size * 0.42);
  }

  ngOnInit() {
    // A photo changed elsewhere this session (e.g. from the Users panel)
    this.versionsSub = this.avatarService.versions$.subscribe(() => this.refresh());
  }

  ngOnChanges() {
    this.refresh();
  }

  ngOnDestroy() {
    this.versionsSub?.unsubscribe();
    this.photoSub?.unsubscribe();
  }

  private refresh() {
    const id = this.userId || '';
    const version = id ? this.avatarService.effectiveVersion(id, this.version) : 0;
    const key = `${id}:${version}`;
    if (key === this.shownKey) return;
    this.shownKey = key;

    this.photoSub?.unsubscribe();
    if (!version) {
      this.photoUrl = null;
      this.cdr.markForCheck();
      return;
    }
    this.photoSub = this.avatarService.getPhotoUrl(id, version).subscribe(url => {
      this.photoUrl = url;
      this.cdr.markForCheck();
    });
  }

  onImageError() {
    this.photoUrl = null;
    this.cdr.markForCheck();
  }
}
