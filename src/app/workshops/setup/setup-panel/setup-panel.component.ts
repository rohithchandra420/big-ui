import { Component, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { FormControl, FormGroup, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth.service';
import { NotificationService } from '../../../core/notification.service';
import { ConfirmationService } from '../../../shared/confirm-dialog/confirmation.service';
import { WorkshopService } from '../../workshop.service';
import { CATEGORY_ICONS, SetupKind, VENUE_DRAFT_KEY, VenueDraft, Workshop, WorkshopCategory, WorkshopSetup, WorkshopVenue } from '../../workshops.model';

type PanelMode = 'view' | 'edit' | 'create';
type SetupItem = WorkshopVenue | Workshop | WorkshopCategory;

const LABEL: Record<SetupKind, string> = { venue: 'venue', workshop: 'workshop', category: 'category' };

/**
 * Content of Workshop Setup's slide-in panel (the .panel shell is in
 * WorkshopSetupComponent): view, edit or add a venue, workshop or category.
 * `item` null = add.
 */
@Component({
  selector: 'app-workshop-setup-panel',
  templateUrl: './setup-panel.component.html',
  styleUrls: ['./setup-panel.component.css']
})
export class WorkshopSetupPanelComponent implements OnChanges {
  @Input() kind: SetupKind = 'venue';
  @Input() item: SetupItem | null = null;
  @Input() setup: WorkshopSetup | null = null;
  @Input() eventId = '';
  /** A venue form kept while its Workshop area was drawn on the Venue Map: reopen it filled in. */
  @Input() draft: VenueDraft | null = null;
  @Output() closed = new EventEmitter<void>();
  /** After add / save / delete: the list reloads; id = the item to show (null after a delete). */
  @Output() changed = new EventEmitter<string | null>();

  readonly icons = CATEGORY_ICONS;
  mode: PanelMode = 'create';
  saving = false;
  form = new FormGroup<any>({});
  /** Facilitator names on the workshop form (chips). */
  facilitators: string[] = [];
  facilitatorCtrl = new FormControl('', { nonNullable: true });

  constructor(
    private workshops: WorkshopService,
    private notify: NotificationService,
    private confirm: ConfirmationService,
    private auth: AuthService,
    private router: Router
  ) {}

  /** Drawing Workshop areas from here: the Workshop TL or above (on the map a Team Lead draws for
   *  their own department, inside the boundary). A workshop:manage grant alone can't draw. */
  get canDrawAreas(): boolean {
    const u = this.auth.currentUser;
    if (!u) return false;
    return ['DEV', 'DIR', 'ADMIN'].includes(u.role) || (u.role === 'TL' && this.auth.inDepartmentKey(u, 'workshop'));
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['item'] || changes['kind']) {
      const prev = changes['item']?.previousValue as SetupItem | null | undefined;
      // A refreshed copy of the item being shown keeps the current mode.
      const sameItem = !!prev && !!this.item && prev._id === this.item._id && !changes['kind'];
      if (!sameItem) this.reset();
    }
  }

  get label(): string { return LABEL[this.kind]; }
  get venue(): WorkshopVenue { return this.item as WorkshopVenue; }
  get workshop(): Workshop { return this.item as Workshop; }
  get category(): WorkshopCategory { return this.item as WorkshopCategory; }

  get title(): string {
    if (this.mode === 'create') return `Add ${this.label}`;
    if (this.mode === 'edit') return `Edit ${this.label}`;
    return this.kind === 'workshop' ? this.workshop.title : (this.item as WorkshopVenue | WorkshopCategory).name;
  }

  /** Edit / Delete here: venues — the Plan group; workshops and categories — the Workshop TL or above. */
  get canChange(): boolean {
    if (!this.setup?.canPlan) return false;
    return this.kind === 'venue' || !!this.setup.canManage;
  }

  /** Sessions / workshops that block a delete. */
  get usedBy(): number {
    if (!this.item) return 0;
    if (this.kind === 'category') return this.category.workshopCount || 0;
    return (this.item as WorkshopVenue | Workshop).sessionCount || 0;
  }

  reset() {
    this.saving = false;
    if (this.draft && this.kind === 'venue') {
      const d = this.draft;
      this.buildForm();
      const known = (this.setup?.workshopAreas || []).some(a => a._id === d.values.area);
      this.form.patchValue({ ...d.values, area: known ? d.values.area : '' });
      this.mode = this.item ? 'edit' : 'create';
      return;
    }
    this.mode = this.item ? 'view' : 'create';
    if (!this.item) this.buildForm();
  }

  /** Keep the venue form in this tab and open the Venue Map on Workshop areas only. */
  openMap(action: 'new' | 'change') {
    const v = this.form.getRawValue();
    const draft: VenueDraft = {
      eventId: this.eventId,
      venueId: this.item?._id || null,
      values: { name: v.name || '', capacity: v.capacity ?? null, area: v.area || '', amenities: v.amenities || '', notes: v.notes || '' }
    };
    try { sessionStorage.setItem(VENUE_DRAFT_KEY, JSON.stringify(draft)); } catch { /* private mode: the form just starts empty */ }
    const queryParams = action === 'new' ? { focus: 'workshop', draw: 'new' } : { focus: 'workshop', area: v.area, edit: '1' };
    this.router.navigate(['/venue-map'], { queryParams });
  }

  edit() {
    if (!this.item) return;
    this.buildForm();
    this.mode = 'edit';
  }

  private buildForm() {
    const it: any = this.item || {};
    if (this.kind === 'venue') {
      this.form = new FormGroup<any>({
        name: new FormControl(it.name || '', [Validators.required, Validators.maxLength(60)]),
        capacity: new FormControl(it.capacity ?? null, [Validators.required, Validators.min(1), Validators.max(10000)]),
        area: new FormControl(it.area?._id || ''),
        amenities: new FormControl(it.amenities || '', Validators.maxLength(300)),
        notes: new FormControl(it.notes || '', Validators.maxLength(300))
      });
    } else if (this.kind === 'workshop') {
      this.form = new FormGroup<any>({
        title: new FormControl(it.title || '', [Validators.required, Validators.maxLength(80)]),
        category: new FormControl(it.category?._id || '', Validators.required),
        description: new FormControl(it.description || '', Validators.maxLength(1000)),
        itemsRequired: new FormControl(it.itemsRequired || '', Validators.maxLength(300)),
        ageLimit: new FormControl(it.ageLimit || '', Validators.maxLength(30)),
        language: new FormControl(it.language || '', Validators.maxLength(40)),
        bringYourOwn: new FormControl(it.bringYourOwn || '', Validators.maxLength(200)),
        notes: new FormControl(it.notes || '', Validators.maxLength(300))
      });
      this.facilitators = [...(it.facilitators || [])];
      this.facilitatorCtrl.setValue('');
    } else {
      this.form = new FormGroup<any>({
        name: new FormControl(it.name || '', [Validators.required, Validators.maxLength(40)]),
        colour: new FormControl(it.colour || this.setup?.colours?.[0] || ''),
        icon: new FormControl(it.icon || 'category')
      });
    }
  }

  // ── facilitators ───────────────────────────────────────────

  addFacilitator(ev?: Event) {
    ev?.preventDefault();
    const name = this.facilitatorCtrl.value.trim().slice(0, 60);
    if (!name || this.facilitators.length >= 10) return;
    if (!this.facilitators.some(f => f.toLowerCase() === name.toLowerCase())) this.facilitators.push(name);
    this.facilitatorCtrl.setValue('');
  }

  removeFacilitator(i: number) {
    this.facilitators.splice(i, 1);
  }

  // ── closing ────────────────────────────────────────────────

  @HostListener('document:keydown.escape')
  onEscape() {
    if (!this.saving) this.cancel();
  }

  /** Cancel: Edit goes back to the details; Add / view close the panel. */
  cancel() {
    if (this.mode === 'edit') this.mode = 'view';
    else this.closed.emit();
  }

  close() {
    this.closed.emit();
  }

  // ── saving ─────────────────────────────────────────────────

  async save() {
    if (this.form.invalid || this.saving) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving = true;
    const v = this.form.getRawValue();
    try {
      let saved: SetupItem;
      if (this.kind === 'venue') {
        const data = { ...v, name: v.name.trim(), capacity: Number(v.capacity), area: v.area || null };
        saved = this.item ? await this.workshops.updateVenue(this.item._id, data)
                          : await this.workshops.addVenue({ ...data, event: this.eventId });
      } else if (this.kind === 'workshop') {
        this.addFacilitator(); // a name still in the box counts
        const data = { ...v, title: v.title.trim(), facilitators: this.facilitators };
        saved = this.item ? await this.workshops.updateWorkshop(this.item._id, data)
                          : await this.workshops.addWorkshop({ ...data, event: this.eventId });
      } else {
        const data = { ...v, name: v.name.trim() };
        saved = this.item ? await this.workshops.updateCategory(this.item._id, data)
                          : await this.workshops.addCategory(data);
      }
      this.notify.openSucessSnackBar(this.item ? `${this.cap(this.label)} saved` : `${this.cap(this.label)} added`);
      this.saving = false;
      this.mode = 'view';
      this.changed.emit(saved._id);
    } catch (err: any) {
      this.saving = false;
      this.notify.openErrorSnackBar(err?.error?.message || `Could not save the ${this.label}`);
    }
  }

  remove() {
    if (!this.item || this.saving) return;
    const name = this.title;
    this.confirm.confirm({
      title: `Delete ${this.label}`,
      message: `Delete "${name}"? This can't be undone.`,
      confirmText: 'Delete',
      danger: true
    }).subscribe(async ok => {
      if (!ok || !this.item) return;
      this.saving = true;
      try {
        if (this.kind === 'venue') await this.workshops.deleteVenue(this.item._id);
        else if (this.kind === 'workshop') await this.workshops.deleteWorkshop(this.item._id);
        else await this.workshops.deleteCategory(this.item._id);
        this.saving = false;
        this.notify.openSucessSnackBar(`${this.cap(this.label)} deleted`);
        this.changed.emit(null);
        this.closed.emit();
      } catch (err: any) {
        this.saving = false;
        this.notify.openErrorSnackBar(err?.error?.message || `Could not delete the ${this.label}`);
      }
    });
  }

  private cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  trackId(_: number, x: { _id: string }) { return x._id; }
  trackStr(_: number, s: string) { return s; }
}
