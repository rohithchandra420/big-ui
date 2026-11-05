import { Component, Input, OnChanges } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminService, PublicPhoto } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { ConfirmationService } from '../../../shared/confirm-dialog/confirmation.service';
import { preparePhoto, putToR2 } from '../photo-prep';

/**
 * Admin › Public Page › Photos (PH6). Pick photos → the browser shrinks and
 * re-saves them (strips GPS) → they go straight to Cloudflare R2 → caption,
 * layout, order, show / hide, delete. Saved changes apply at once.
 */
@Component({
  selector: 'app-public-photos',
  templateUrl: './public-photos.component.html',
  styleUrls: ['./public-photos.component.css']
})
export class PublicPhotosComponent implements OnChanges {
  @Input() eventId: string | null = null;

  enabled = true;
  max = 60;
  photos: PublicPhoto[] = [];
  loading = false;
  uploading = 0;
  error = '';
  readonly layouts: { value: PublicPhoto['layout']; label: string }[] = [
    { value: 'normal', label: 'Square' }, { value: 'tall', label: 'Tall' }, { value: 'wide', label: 'Wide' }
  ];

  constructor(private admin: AdminService, private notify: NotificationService, private confirm: ConfirmationService) {}

  trackById = (_: number, p: PublicPhoto) => p._id;
  trackLayout = (_: number, l: { value: string }) => l.value;

  ngOnChanges(): void { this.load(); }

  load(): void {
    if (!this.eventId) { this.photos = []; return; }
    this.loading = true;
    this.admin.listPublicPhotos(this.eventId).subscribe({
      next: r => { this.enabled = r.enabled; this.max = r.max; this.photos = r.photos; this.loading = false; },
      error: () => { this.loading = false; this.error = 'Could not load the photos.'; }
    });
  }

  async pick(input: HTMLInputElement): Promise<void> {
    const files = Array.from(input.files || []).slice(0, Math.max(0, this.max - this.photos.length));
    input.value = '';
    if (!this.eventId || !files.length) return;
    this.error = '';
    for (const file of files) {
      this.uploading++;
      try {
        const prepared = await preparePhoto(file);
        const links = await firstValueFrom(this.admin.publicPhotoUploadUrls(this.eventId, prepared.type));
        await Promise.all([putToR2(links.url, prepared.full, prepared.type), putToR2(links.thumbUrl, prepared.thumb, prepared.type)]);
        const caption = file.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').slice(0, 80);
        const saved = await firstValueFrom(this.admin.savePublicPhoto({ event: this.eventId, key: links.key, thumbKey: links.thumbKey, caption }));
        this.photos = [...this.photos, saved];
      } catch (err: any) {
        this.error = err?.error?.message || err?.message || 'A photo could not be uploaded.';
      } finally {
        this.uploading--;
      }
    }
  }

  save(p: PublicPhoto, change: Partial<PublicPhoto>): void {
    this.admin.updatePublicPhoto(p._id, change).subscribe({
      next: u => this.photos = this.photos.map(x => x._id === u._id ? u : x),
      error: err => this.notify.openErrorSnackBar(err?.error?.message || 'Could not save the change')
    });
  }

  /** Swap with the neighbour (orders are re-numbered 0..n). */
  move(i: number, dir: -1 | 1): void {
    const j = i + dir;
    if (j < 0 || j >= this.photos.length) return;
    const list = [...this.photos];
    [list[i], list[j]] = [list[j], list[i]];
    this.photos = list;
    list.forEach((p, k) => { if (p.order !== k) this.save(p, { order: k }); });
  }

  async remove(p: PublicPhoto): Promise<void> {
    const ok = await firstValueFrom(this.confirm.confirm({
      title: 'Delete this photo?', message: `"${p.caption || 'Photo'}" is removed from the public page and from storage.`,
      confirmText: 'Delete', danger: true
    }));
    if (!ok) return;
    this.admin.deletePublicPhoto(p._id).subscribe({
      next: () => this.photos = this.photos.filter(x => x._id !== p._id),
      error: err => this.notify.openErrorSnackBar(err?.error?.message || 'Could not delete the photo')
    });
  }
}
