import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { of } from 'rxjs';
import { PublicPhotosComponent } from './public-photos.component';
import { AdminService, PublicPhoto } from '../../admin.service';
import { NotificationService } from '../../../core/notification.service';
import { ConfirmationService } from '../../../shared/confirm-dialog/confirmation.service';

const photo = (id: string, over: Partial<PublicPhoto> = {}): PublicPhoto => ({
  _id: id, caption: `Photo ${id}`, sub: '', layout: 'normal', order: 0, shown: true,
  url: `https://media.example.com/${id}.webp`, thumbUrl: `https://media.example.com/${id}-thumb.webp`, createdAt: '', ...over
});

describe('PublicPhotosComponent', () => {
  let fixture: ComponentFixture<PublicPhotosComponent>;
  let c: PublicPhotosComponent;
  let admin: jasmine.SpyObj<AdminService>;
  let confirm: jasmine.SpyObj<ConfirmationService>;

  beforeEach(async () => {
    admin = jasmine.createSpyObj('AdminService', ['listPublicPhotos', 'publicPhotoUploadUrls', 'savePublicPhoto', 'updatePublicPhoto', 'deletePublicPhoto']);
    admin.listPublicPhotos.and.returnValue(of({ enabled: true, max: 60, photos: [photo('a', { order: 0 }), photo('b', { order: 1 })] }));
    admin.updatePublicPhoto.and.callFake((id: string, change: any) => of(photo(id, change)));
    admin.deletePublicPhoto.and.returnValue(of({ ok: true }));
    confirm = jasmine.createSpyObj('ConfirmationService', ['confirm']);
    confirm.confirm.and.returnValue(of(true));
    await TestBed.configureTestingModule({
      declarations: [PublicPhotosComponent],
      providers: [
        { provide: AdminService, useValue: admin },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openErrorSnackBar', 'openSucessSnackBar']) },
        { provide: ConfirmationService, useValue: confirm }
      ],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(PublicPhotosComponent);
    c = fixture.componentInstance;
    c.eventId = 'ev1';
    c.ngOnChanges();
    fixture.detectChanges();
  });

  it('lists the event\'s photos', () => {
    expect(admin.listPublicPhotos).toHaveBeenCalledWith('ev1');
    expect(fixture.nativeElement.querySelectorAll('.ph-item').length).toBe(2);
  });

  it('says when photo storage isn\'t set up', () => {
    admin.listPublicPhotos.and.returnValue(of({ enabled: false, max: 60, photos: [] }));
    c.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain("Photo storage isn't set up");
  });

  it('show / hide and layout are saved at once', () => {
    c.save(c.photos[0], { shown: false });
    expect(admin.updatePublicPhoto).toHaveBeenCalledWith('a', { shown: false });
    expect(c.photos[0].shown).toBeFalse();
  });

  it('moving swaps neighbours and re-numbers the order', () => {
    c.move(0, 1);
    expect(c.photos.map(p => p._id)).toEqual(['b', 'a']);
    expect(admin.updatePublicPhoto).toHaveBeenCalledWith('b', { order: 0 });
    expect(admin.updatePublicPhoto).toHaveBeenCalledWith('a', { order: 1 });
  });

  it('delete asks first, then removes it', async () => {
    await c.remove(c.photos[0]);
    expect(confirm.confirm).toHaveBeenCalled();
    expect(admin.deletePublicPhoto).toHaveBeenCalledWith('a');
    expect(c.photos.map(p => p._id)).toEqual(['b']);
  });
});
