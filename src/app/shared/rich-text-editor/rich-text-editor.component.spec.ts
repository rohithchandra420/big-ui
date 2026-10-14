import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';

import { RichTextEditorComponent } from './rich-text-editor.component';

describe('RichTextEditorComponent', () => {
  let fixture: ComponentFixture<RichTextEditorComponent>;
  let component: RichTextEditorComponent;
  let emitted: string[];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RichTextEditorComponent],
      imports: [FormsModule]
    }).compileComponents();
    fixture = TestBed.createComponent(RichTextEditorComponent);
    component = fixture.componentInstance;
    component.value = '<p>Hi</p>';
    emitted = [];
    component.valueChange.subscribe(v => emitted.push(v));
    fixture.detectChanges();
  });

  it('shows the starting value', () => {
    expect(component.area.nativeElement.innerHTML).toBe('<p>Hi</p>');
    expect(component.isEmpty).toBeFalse();
  });

  it('emits the HTML when the user types', () => {
    component.area.nativeElement.innerHTML = '<p>Hi there</p>';
    component.onInput();
    expect(emitted.pop()).toBe('<p>Hi there</p>');
  });

  it('inserts text such as a placeholder and emits', () => {
    component.insertText('{name}');
    expect(component.area.nativeElement.textContent).toContain('{name}');
    expect(emitted.length).toBeGreaterThan(0);
  });

  it('accepts only http(s) and mailto links', () => {
    for (const ok of ['https://bloomingreen.example/info', 'http://x.example', 'mailto:office@example.com']) {
      component.linkUrl = ok;
      expect(component.linkValid).withContext(ok).toBeTrue();
    }
    for (const bad of ['javascript:alert(1)', 'https://', 'ftp://x.example', 'example.com']) {
      component.linkUrl = bad;
      expect(component.linkValid).withContext(bad).toBeFalse();
    }
  });

  it('opens and closes the link bar', () => {
    component.openLink(new Event('mousedown'));
    expect(component.linkOpen).toBeTrue();
    expect(component.linkUrl).toBe('https://');
    component.closeLink();
    expect(component.linkOpen).toBeFalse();
  });

  it('reflects outside value changes but not its own echoes', () => {
    component.value = '<p>Reset</p>';
    component.ngOnChanges({ value: { currentValue: '<p>Reset</p>' } as any });
    expect(component.area.nativeElement.innerHTML).toBe('<p>Reset</p>');
  });

  it('reads as empty with no text', () => {
    component.area.nativeElement.innerHTML = '<p><br></p>';
    component.onInput();
    expect(component.isEmpty).toBeTrue();
  });
});
