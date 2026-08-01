import { Directive, ElementRef, HostListener, Input, OnDestroy } from '@angular/core';

// On-brand replacement for the native `title` attribute (which renders an
// unstylable OS tooltip). Renders a real DOM node (not a CSS pseudo-element)
// so its actual size can be measured and clamped to the viewport on show —
// a pseudo-element's position can't be corrected once it starts clipping off
// the edge of the screen. Usage is unchanged: data-tooltip="text" or
// [attr.data-tooltip]="expr" on any element.
@Directive({
  selector: '[data-tooltip]'
})
export class TooltipDirective implements OnDestroy {
  @Input('data-tooltip') text = '';

  // Same offsets the original (static, non-clamped) CSS version used —
  // reused as-is here rather than re-derived, since that geometry was
  // already confirmed to look right.
  private readonly bubbleGap = 10;
  private readonly arrowGap = 6;
  private readonly margin = 8;
  private readonly arrowSize = 7;

  private bubble: HTMLDivElement | null = null;
  private arrow: HTMLDivElement | null = null;
  private readonly onScroll = () => this.hide();

  constructor(private el: ElementRef<HTMLElement>) {}

  @HostListener('mouseenter')
  @HostListener('focus')
  show() {
    if (!this.text) return;
    this.hide();

    const bubble = document.createElement('div');
    bubble.className = 'app-tooltip-bubble';
    bubble.textContent = this.text;
    bubble.style.visibility = 'hidden';
    document.body.appendChild(bubble);

    const arrow = document.createElement('div');
    arrow.style.visibility = 'hidden';
    document.body.appendChild(arrow);

    this.bubble = bubble;
    this.arrow = arrow;

    const hostRect = this.el.nativeElement.getBoundingClientRect();
    const bubbleRect = bubble.getBoundingClientRect();
    const hostCenterX = hostRect.left + hostRect.width / 2;

    const spaceAbove = hostRect.top - this.bubbleGap - bubbleRect.height;
    const placeBelow = spaceAbove < this.margin;

    // Bubble: centered on the host by default — only nudged left/right when
    // that would clip off the edge of the viewport.
    const top = placeBelow
      ? hostRect.bottom + this.bubbleGap
      : hostRect.top - this.bubbleGap - bubbleRect.height;
    const idealLeft = hostCenterX - bubbleRect.width / 2;
    const maxLeft = Math.max(window.innerWidth - bubbleRect.width - this.margin, this.margin);
    const left = Math.min(Math.max(idealLeft, this.margin), maxLeft);

    bubble.style.top = `${top}px`;
    bubble.style.left = `${left}px`;
    bubble.style.visibility = 'visible';

    // Arrow: always pinned exactly on the host's horizontal center,
    // regardless of any bubble shift — matches where it always sat before.
    const arrowTop = placeBelow
      ? hostRect.bottom + this.arrowGap
      : hostRect.top - this.arrowGap - this.arrowSize;
    const arrowLeft = hostCenterX - this.arrowSize / 2;

    arrow.className = 'app-tooltip-arrow ' + (placeBelow ? 'arrow-below' : 'arrow-above');
    arrow.style.top = `${arrowTop}px`;
    arrow.style.left = `${arrowLeft}px`;
    arrow.style.visibility = 'visible';

    // Scroll events don't bubble, but a capturing listener on document still
    // sees them fire on any nested scrollable ancestor (e.g. .table-scroll).
    document.addEventListener('scroll', this.onScroll, true);
  }

  @HostListener('mouseleave')
  @HostListener('blur')
  hide() {
    this.bubble?.remove();
    this.arrow?.remove();
    this.bubble = null;
    this.arrow = null;
    document.removeEventListener('scroll', this.onScroll, true);
  }

  ngOnDestroy() {
    this.hide();
  }
}
