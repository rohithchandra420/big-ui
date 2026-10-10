import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { BehaviorSubject, EMPTY, Observable, of } from 'rxjs';
import { catchError, map, shareReplay, switchMap, tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment.development';

// Imported eagerly on purpose. Lazy-loading the picker was tried (2026-10-10)
// and made the initial bundle ~36KB BIGGER while only moving 15KB out — the
// shared Angular Material/common code it uses can't be scope-hoisted once a
// separate chunk depends on it. Not worth it for a component this small.
import { PhotoPickerData, PhotoPickerDialogComponent } from '../shared/photo-picker/photo-picker-dialog.component';

/**
 * Loads, caches and changes profile photos.
 *
 * Photos are fetched through HttpClient (so the auth interceptor adds
 * withCredentials) rather than a plain <img src>: in production the API is
 * cross-site, and browsers increasingly drop cookies on cross-site image
 * requests. Each photo is fetched once per (userId, avatarVersion) and kept as
 * an object URL; a new version means a new key, so a changed photo is always
 * refetched and an unchanged one never is.
 *
 * Lists only carry avatarVersion — when a photo is changed here, `versions$`
 * publishes the new version so every <app-user-avatar> for that user (table,
 * panel, sidebar...) updates straight away without reloading its list.
 */
@Injectable({ providedIn: 'root' })
export class AvatarService {

  private url = environment.URL;
  private cache = new Map<string, Observable<string | null>>();
  private objectUrls = new Map<string, string>();

  /** userId → latest known avatarVersion, for photos changed this session. */
  private versionsSubject = new BehaviorSubject<Map<string, number>>(new Map());
  readonly versions$ = this.versionsSubject.asObservable();

  constructor(private http: HttpClient, private dialog: MatDialog) { }

  /** Opens the photo picker (round crop) and uploads the result. Emits the new
   *  avatarVersion; completes without emitting if the user cancels. */
  changePhoto(userId: string, title = 'Profile photo'): Observable<number> {
    const data: PhotoPickerData = { title, shape: 'circle', outputSize: 128 };
    return this.dialog.open<PhotoPickerDialogComponent, PhotoPickerData, Blob>(PhotoPickerDialogComponent, {
      width: '420px',
      maxWidth: '95vw',
      data
    }).afterClosed().pipe(
      switchMap(blob => blob ? this.upload(userId, blob) : EMPTY)
    );
  }

  /** The newest version we know of: a change made this session beats the
   *  (possibly stale) version a list was loaded with. */
  effectiveVersion(userId: string, listVersion: number | undefined | null): number {
    const override = this.versionsSubject.value.get(userId);
    return override !== undefined ? override : (listVersion || 0);
  }

  /** Object URL for the photo, or null if there's none / it can't be shown. */
  getPhotoUrl(userId: string, version: number): Observable<string | null> {
    if (!userId || !version) return of(null);
    const key = `${userId}:${version}`;
    let cached = this.cache.get(key);
    if (!cached) {
      cached = this.http.get(`${this.url}/users/${userId}/avatar?v=${version}`, { responseType: 'blob' }).pipe(
        map(blob => {
          const objectUrl = URL.createObjectURL(blob);
          this.objectUrls.set(key, objectUrl);
          return objectUrl as string | null;
        }),
        // 403 (not allowed to see it) / 404 → just show initials
        catchError(() => of(null)),
        shareReplay(1)
      );
      this.cache.set(key, cached);
    }
    return cached;
  }

  upload(userId: string, image: Blob): Observable<number> {
    return this.http.put<{ avatarVersion: number }>(`${this.url}/users/${userId}/avatar`, image, {
      headers: { 'Content-Type': image.type }
    }).pipe(
      map(res => res.avatarVersion),
      tap(version => this.publish(userId, version))
    );
  }

  remove(userId: string): Observable<number> {
    return this.http.delete<{ avatarVersion: number }>(`${this.url}/users/${userId}/avatar`).pipe(
      map(() => 0),
      tap(() => this.publish(userId, 0))
    );
  }

  /** Version currently stored for a user (used by the sidebar for the
   *  logged-in user, whose stored session object doesn't carry it). */
  fetchVersion(userId: string): Observable<number> {
    return this.http.get<{ avatarVersion?: number }>(`${this.url}/user/profile`, { params: { id: userId } }).pipe(
      map(profile => profile.avatarVersion || 0),
      catchError(() => of(0))
    );
  }

  private publish(userId: string, version: number) {
    const next = new Map(this.versionsSubject.value);
    next.set(userId, version);
    this.versionsSubject.next(next);
  }
}
