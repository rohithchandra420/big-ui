/**
 * Collapsible sidebar groups (user decisions 2026-11-03): Main starts open,
 * the rest start closed, the group holding the current page always opens,
 * and each person's choice is kept in this browser only.
 */
export type NavGroup = 'main' | 'box-office' | 'accommodation' | 'workshops' | 'hospitality' | 'admin';

const KEY = 'navGroups';
const PREFIXES: [string, NavGroup][] = [
  ['/box-office', 'box-office'],
  ['/accommodation', 'accommodation'],
  ['/workshops', 'workshops'],
  ['/hospitality', 'hospitality'],
  ['/admin', 'admin'],
  ['/billboard', 'main'],
  ['/venue-map', 'main'],
  ['/my-department', 'main'],
];

/** Which group a URL belongs to ('/' = Dashboard = main); null for pages outside the groups (Profile…). */
export function groupOfUrl(url: string): NavGroup | null {
  const path = (url || '/').split(/[?#]/)[0];
  if (path === '/' || path === '') return 'main';
  const hit = PREFIXES.find(([p]) => path === p || path.startsWith(p + '/'));
  return hit ? hit[1] : null;
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
