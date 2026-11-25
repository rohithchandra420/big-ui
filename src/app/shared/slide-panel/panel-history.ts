import { Router } from '@angular/router';

/** Key of the marker an open panel puts in `history.state`. */
const STATE_KEY = 'slidePanel';

/** A panel that the Back button can close (slide panel or an older page drawer). */
export interface BackClosable {
  readonly panelId: number;
  /** Back removed this panel's history entry: tell the page to close it. */
  closedByBack(): void;
}

/**
 * Browser history shared by every open panel (B-086).
 *
 * An open panel adds one history entry with the same URL, so the phone's
 * Back button closes the panel instead of leaving the page. Panels can stack:
 * Back closes the top one only. When a panel closes some other way (✕, Esc,
 * a tap outside, the page closing it), it takes its own entry back out — but
 * only while that entry is still the current one and no page change is under
 * way, so a navigation started from inside the panel is never undone.
 */
class PanelHistory {
  private nextId = 0;
  /** Open panels, oldest first. */
  private stack: BackClosable[] = [];
  /** Our own `history.back()` calls (made or about to be) not landed yet. */
  private pendingBacks = 0;
  /** Entries to add once our own pending `back()` has landed. */
  private queued: BackClosable[] = [];
  private listening = false;
  private router: Router | null = null;

  /** Tests only: forget every panel and pending back(). */
  reset(): void {
    this.stack = [];
    this.queued = [];
    this.pendingBacks = 0;
  }

  newId(): number {
    return ++this.nextId;
  }

  /** Lets the history skip its `back()` while a page change is in flight. */
  useRouter(router: Router | null): void {
    if (router) this.router = router;
  }

  add(panel: BackClosable): void {
    this.listen();
    if (!this.stack.includes(panel)) this.stack.push(panel);
    if (this.pendingBacks > 0) {
      // Pushing before the traversal lands would be undone by it.
      if (!this.queued.includes(panel)) this.queued.push(panel);
      return;
    }
    this.push(panel);
  }

  /** The panel closed by itself (not by Back), or its page went away. */
  remove(panel: BackClosable): void {
    const queuedAt = this.queued.indexOf(panel);
    if (queuedAt >= 0) this.queued.splice(queuedAt, 1);
    const at = this.stack.indexOf(panel);
    if (at < 0) return;
    this.stack.splice(at, 1);
    if (queuedAt >= 0) return; // its entry was never added
    this.pendingBacks++;
    // Wait for the click handler to finish: a page change started together
    // with the close is then under way (or has replaced our entry) — leave
    // history alone.
    queueMicrotask(() => {
      const r = this.router;
      const navigating = typeof r?.getCurrentNavigation === 'function' && !!r.getCurrentNavigation();
      if (!navigating && history.state?.[STATE_KEY] === panel.panelId) {
        history.back();
      } else {
        this.landed();
      }
    });
  }

  private push(panel: BackClosable): void {
    const state = { ...(history.state ?? {}), [STATE_KEY]: panel.panelId };
    history.pushState(state, '', location.href);
  }

  private listen(): void {
    if (this.listening) return;
    this.listening = true;
    window.addEventListener('popstate', () => this.onPop());
  }

  /** One of our own `back()` calls is done (or was not needed). */
  private landed(): void {
    this.pendingBacks = Math.max(0, this.pendingBacks - 1);
    if (this.pendingBacks === 0) {
      const waiting = this.queued.splice(0);
      waiting.forEach(p => this.push(p));
    }
  }

  private onPop(): void {
    if (this.pendingBacks > 0) {
      this.landed(); // our own back(): nothing to close
      return;
    }
    // Back (or Forward) by the user: close every panel whose entry is gone.
    const current = history.state?.[STATE_KEY];
    const keep = this.stack.findIndex(p => p.panelId === current);
    const gone = this.stack.splice(keep + 1);
    gone.reverse().forEach(p => p.closedByBack());
  }
}

export const panelHistory = new PanelHistory();
