import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { Router } from '@angular/router';
import { RouterTestingModule } from '@angular/router/testing';
import { BehaviorSubject, of } from 'rxjs';

import { TentFieldsComponent } from './tent-fields.component';
import { TentFieldService } from '../tent-field.service';
import { EventService } from '../../core/event.service';
import { NotificationService } from '../../core/notification.service';

@Component({ selector: 'app-section-header', template: '' })
class SectionHeaderStubComponent {}

describe('TentFieldsComponent', () => {
  let fixture: ComponentFixture<TentFieldsComponent>;
  let c: TentFieldsComponent;
  let service: jasmine.SpyObj<TentFieldService>;

  const setup = async (canEdit: boolean) => {
    service = jasmine.createSpyObj('TentFieldService', ['list', 'create']);
    service.list.and.returnValue(of({
      fields: [{ _id: 'f1', event: 'e1', name: 'Shanti Field', rows: 20, cols: 30, paths: [], layoutVersion: 1, counts: { placed: 10, empty: 5, partly: 2, full: 3 } }],
      unplaced: 4, canEdit,
    }));
    await TestBed.configureTestingModule({
      imports: [FormsModule, MatIconModule, RouterTestingModule],
      declarations: [TentFieldsComponent, SectionHeaderStubComponent],
      providers: [
        { provide: TentFieldService, useValue: service },
        { provide: EventService, useValue: { activeEvent: new BehaviorSubject({ _id: 'e1', name: 'BiG 7.0' }) } },
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['openSucessSnackBar', 'openErrorSnackBar']) },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TentFieldsComponent);
    c = fixture.componentInstance;
    fixture.detectChanges();
  };

  const el = () => fixture.nativeElement as HTMLElement;

  it('shows each field with its counts and fill bar', async () => {
    await setup(false);
    expect(service.list).toHaveBeenCalledWith('e1');
    expect(el().querySelector('.tf-card-name')!.textContent).toContain('Shanti Field');
    expect(el().textContent).toContain('5 empty');
    expect(c.share(c.fields[0], 'full')).toBe(30);
    expect(el().textContent).not.toContain('New field');
  });

  it('lets an editor create a field and opens it in edit mode', async () => {
    await setup(true);
    service.create.and.returnValue(of({ _id: 'f2', event: 'e1', name: 'Dhyan', rows: 8, cols: 9, paths: [], layoutVersion: 0 }));
    const nav = spyOn(TestBed.inject(Router), 'navigate').and.resolveTo(true);
    c.startAdd();
    c.form = { name: ' Dhyan ', rows: 8, cols: 9 };
    c.create();
    expect(service.create).toHaveBeenCalledWith({ event: 'e1', name: 'Dhyan', rows: 8, cols: 9 });
    expect(nav).toHaveBeenCalledWith(['/accommodation/fields', 'f2'], { queryParams: { edit: 1 } });
  });

  it('checks the name and size before sending', async () => {
    await setup(true);
    c.startAdd();
    c.form = { name: '', rows: 8, cols: 9 };
    c.create();
    expect(c.formError).toContain('name');
    c.form = { name: 'X', rows: 61, cols: 9 };
    c.create();
    expect(c.formError).toContain('1 to 60');
    expect(service.create).not.toHaveBeenCalled();
  });
});
