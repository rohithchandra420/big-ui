import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AppliedChip, ListToolbarComponent, SortOption } from './list-toolbar.component';
import { SlidePanelComponent } from '../slide-panel/slide-panel.component';
import { AppSelectComponent } from '../app-select/app-select.component';
import { AppOptionComponent } from '../app-select/app-option.component';
import { TableSort } from '../table-sort/table-sort';
import { ViewMode, ViewModeService } from '../../core/view-mode.service';

@Component({
  template: `
    <app-list-toolbar page="bookings" noun="bookings" [(search)]="term" [sort]="sort" [sortOptions]="options"
                      [chips]="chips" (chipRemoved)="removed.push($event)" (clearAll)="cleared = cleared + 1"
                      [resultCount]="42" [selectable]="selectable" [shown]="25" [selectedCount]="picked"
                      (toggleAll)="all = all + 1">
      <div ltFilters><span class="my-filter">Ticket email filter</span></div>
      <button ltActions class="my-action">Email</button>
    </app-list-toolbar>`
})
class HostComponent {
  term = '';
  sort = new TableSort<string>(null, 'asc', () => this.sorted++);
  sorted = 0;
  options: SortOption[] = [{ key: 'name', label: 'Name' }, { key: 'paidAt', label: 'Paid at' }];
  chips: AppliedChip[] = [];
  removed: string[] = [];
  cleared = 0;
  selectable = true;
  picked = 0;
  all = 0;
}

describe('ListToolbarComponent (phone cards)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let bar: ListToolbarComponent;
  let vm: { isPhone: boolean; mode: ViewMode; modeOf: () => ViewMode; setMode: jasmine.Spy };
  const el = () => fixture.nativeElement as HTMLElement;
  const doc = () => document.body;

  beforeEach(async () => {
    vm = {
      isPhone: true,
      mode: 'cards',
      modeOf: () => vm.mode,
      setMode: jasmine.createSpy('setMode').and.callFake((_: string, m: ViewMode) => vm.mode = m)
    };
    await TestBed.configureTestingModule({
      declarations: [HostComponent, ListToolbarComponent, SlidePanelComponent, AppSelectComponent, AppOptionComponent],
      imports: [FormsModule],
      providers: [{ provide: ViewModeService, useValue: vm }],
      schemas: [NO_ERRORS_SCHEMA]
    }).compileComponents();
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
    bar = fixture.debugElement.children[0].componentInstance;
  });

  afterEach(() => {
    bar.sheetOpen = false;
    fixture.detectChanges();
  });

  it('renders on a phone only', () => {
    expect(el().querySelector('.lt-bar')).not.toBeNull();
    vm.isPhone = false;
    fixture.detectChanges();
    expect(el().querySelector('.lt-bar')).toBeNull();
  });

  it('typing in the search updates the page', () => {
    const input = el().querySelector('.lt-search input') as HTMLInputElement;
    input.value = 'asha';
    input.dispatchEvent(new Event('input'));
    expect(host.term).toBe('asha');
  });

  it('shows applied chips with a count; × and Clear all tell the page', () => {
    expect(el().querySelector('.lt-chips')).toBeNull();
    host.chips = [{ id: 'email', label: 'Ticket email: Sent' }, { id: 'sort', label: 'Sort: Name', icon: 'arrow_upward' }];
    fixture.detectChanges();
    expect(el().querySelector('.lt-cnt')?.textContent?.trim()).toBe('2');
    const chips = el().querySelectorAll('.lt-chip');
    expect(chips.length).toBe(3);
    (chips[0] as HTMLButtonElement).click();
    expect(host.removed).toEqual(['email']);
    (el().querySelector('.lt-clear') as HTMLButtonElement).click();
    expect(host.cleared).toBe(1);
  });

  it('selection line: count, select all and the page\'s own actions', () => {
    expect(el().querySelector('.lt-grow')?.textContent?.trim()).toBe('Select all 25 shown');
    expect(el().querySelector('.lt-sel .my-action')).not.toBeNull();
    host.picked = 3;
    fixture.detectChanges();
    expect(el().querySelector('.lt-grow')?.textContent?.trim()).toBe('3 selected');
    expect(el().querySelector('.lt-sel')?.classList).toContain('has');
    (el().querySelector('.lt-sel input[type="checkbox"]') as HTMLInputElement).click();
    expect(host.all).toBe(1);
  });

  it('no selection line on a page without tick boxes', () => {
    host.selectable = false;
    fixture.detectChanges();
    expect(el().querySelector('.lt-sel')).toBeNull();
  });

  it('the sheet holds sort, the page\'s filters, Show as and a live count', () => {
    (el().querySelector('.lt-open') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(doc().querySelector('.ls-body .my-filter')).not.toBeNull();
    expect(doc().querySelector('.ls-show')?.textContent?.trim()).toBe('Show 42 bookings');
    (doc().querySelector('.ls-show') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(bar.sheetOpen).toBeFalse();
  });

  it('sort: picking a column, then Descending, sorts the page', () => {
    bar.pickSort('paidAt');
    expect(host.sort.key).toBe('paidAt');
    bar.setDir('desc');
    expect(host.sort.dir).toBe('desc');
    expect(host.sorted).toBe(2);
    bar.setDir('desc');
    expect(host.sorted).toBe(2);
  });

  it('order buttons do nothing before a column is picked', () => {
    bar.setDir('desc');
    expect(host.sorted).toBe(0);
  });

  it('Show as: the Cards / Table switch saves the choice for this page', () => {
    bar.setMode('table');
    expect(vm.setMode).toHaveBeenCalledWith('bookings', 'table');
    expect(bar.mode).toBe('table');
  });
});
