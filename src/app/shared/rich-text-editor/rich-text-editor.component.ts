import { Component, ElementRef, EventEmitter, Input, OnChanges, OnInit, Output, SimpleChanges, ViewChild } from '@angular/core';

/**
 * Small formatting editor (Email epic, see EMAIL_CONTEXT.md): bold, italic,
 * bullet/numbered lists and links — exactly what big-api's custom-email
 * sanitizer allows. Built on the browser's own contenteditable editing, no
 * package. Pasting always inserts plain text, so formatting copied from Word
 * or other emails can't sneak in; the server cleans the HTML again anyway.
 *
 *   <app-rich-text-editor [value]="html" (valueChange)="html = $event"></app-rich-text-editor>
 */
@Component({
  selector: 'app-rich-text-editor',
  templateUrl: './rich-text-editor.component.html',
  styleUrls: ['./rich-text-editor.component.css']
})
export class RichTextEditorComponent implements OnInit, OnChanges {

  @Input() value = '';
  @Input() placeholder = '';
  @Output() valueChange = new EventEmitter<string>();

  @ViewChild('area', { static: true }) area!: ElementRef<HTMLDivElement>;

  /** Drives the placeholder. A field (not a DOM-reading getter) so it never
   *  changes in the middle of change detection. */
  isEmpty = true;
  linkOpen = false;
  linkUrl = '';
  private savedRange: Range | null = null;

  // The area is a static ViewChild, so it exists already here — setting the
  // starting content before the first check keeps the placeholder correct.
  ngOnInit() {
    this.area.nativeElement.innerHTML = this.value || '';
    this.updateEmpty();
  }

  ngOnChanges(changes: SimpleChanges) {
    // Only push outside changes in (e.g. reset); never while the user types,
    // or the caret would jump to the start.
    const el = this.area?.nativeElement;
    if (changes['value'] && el && el.innerHTML !== (this.value || '')) {
      el.innerHTML = this.value || '';
      this.updateEmpty();
    }
  }

  private updateEmpty() {
    const el = this.area?.nativeElement;
    this.isEmpty = !el || ((el.textContent || '').trim() === '' && !el.querySelector('li'));
  }

  onInput() {
    this.updateEmpty();
    this.valueChange.emit(this.area.nativeElement.innerHTML);
  }

  /** Toolbar buttons run on mousedown + preventDefault so the selection stays in the editor. */
  exec(command: string, event?: Event) {
    event?.preventDefault();
    this.area.nativeElement.focus();
    document.execCommand(command, false);
    this.onInput();
  }

  /** Inserts text (e.g. a {placeholder}) where the caret is, or at the end. */
  insertText(text: string) {
    const el = this.area.nativeElement;
    el.focus();
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || !el.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    document.execCommand('insertText', false, text);
    this.onInput();
  }

  onPaste(event: ClipboardEvent) {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';
    document.execCommand('insertText', false, text);
    this.onInput();
  }

  // ── Links ─────────────────────────────────────────────

  openLink(event: Event) {
    event.preventDefault();
    const sel = window.getSelection();
    this.savedRange = sel && sel.rangeCount && this.area.nativeElement.contains(sel.anchorNode)
      ? sel.getRangeAt(0).cloneRange() : null;
    this.linkUrl = 'https://';
    this.linkOpen = true;
  }

  get linkValid(): boolean {
    return /^(https?:\/\/[^\s.]+\.[^\s]+|mailto:[^\s@]+@[^\s@]+)$/i.test(this.linkUrl.trim());
  }

  applyLink() {
    if (!this.linkValid) return;
    const url = this.linkUrl.trim();
    const el = this.area.nativeElement;
    el.focus();
    const sel = window.getSelection();
    if (this.savedRange) {
      sel?.removeAllRanges();
      sel?.addRange(this.savedRange);
    }
    if (!sel || sel.isCollapsed) {
      // Nothing selected — insert the address itself as the link text.
      document.execCommand('insertHTML', false, `<a href="${this.escapeAttr(url)}">${this.escapeText(url)}</a>`);
    } else {
      document.execCommand('createLink', false, url);
    }
    this.closeLink();
    this.onInput();
  }

  closeLink() {
    this.linkOpen = false;
    this.linkUrl = '';
    this.savedRange = null;
  }

  private escapeAttr(s: string) {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  private escapeText(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
