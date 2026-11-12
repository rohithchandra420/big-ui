/**
 * Collapsible sidebar groups (user decisions 2026-11-03). Since Navigation
 * Tabs (NAV_TABS_CONTEXT.md) only Main is still a group: it starts open,
 * opens when you're on one of its pages, and its open/closed state is kept
 * in this browser only. The other sections are single items with tabs.
 */
export type NavGroup = 'main';

const KEY = 'navGroups';
const MAIN_PAGES = ['/billboard', '/sos', '/venue-map', '/my-department'];

/** 'main' for Main's pages ('/' = Dashboard); null for every other page. */
export function groupOfUrl(url: string): NavGroup | null {
  const path = (url || '/').split(/[?#]/)[0];
  if (path === '/' || path === '') return 'main';
  return MAIN_PAGES.some(p => path === p || path.startsWith(p + '/')) ? 'main' : null;
}

export function readOpenGroups(): Partial<Record<NavGroup, boolean>> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

export function writeOpenGroups(groups: Partial<Record<NavGroup, boolean>>): void {
  try { localStorage.setItem(KEY, JSON.stringify(groups)); } catch { /* private mode: not remembered */ }
}
