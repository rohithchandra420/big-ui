/**
 * Navigation Tabs (NAV_TABS_CONTEXT.md): the sidebar shows only the sections;
 * each section's pages are tabs. Every tab is the route that already existed,
 * so a refresh, Back, bookmarks and notification links keep working.
 * This list is the one source for the sidebar and the section header.
 * (Main — Dashboard, Billboard, SOS, Venue Map, My Department — stays a
 * sidebar group and is not listed here.)
 */
export type SectionKey = 'box-office' | 'accommodation' | 'workshops' | 'hospitality' | 'medical' | 'wash' | 'admin';

export interface NavTab {
  /** The route; also the tab's identity. */
  path: string;
  label: string;
  /** Only this exact URL lights the tab (used where a sibling tab sits under the same path). */
  exact?: boolean;
}

/** A page opened from a tab (e.g. Booking Found). Its parent tab stays lit and Back goes up to it. */
export interface NavDetail {
  pattern: RegExp;
  parent: string;
}

export interface NavSection {
  key: SectionKey;
  label: string;
  /** Material Symbols name for the sidebar item. */
  icon: string;
  prefix: string;
  tabs: NavTab[];
  details: NavDetail[];
}

export const NAV_SECTIONS: NavSection[] = [
  {
    key: 'box-office', label: 'Box Office', icon: 'confirmation_number', prefix: '/box-office',
    tabs: [
      { path: '/box-office/bookings', label: 'Bookings' },
      { path: '/box-office/registration', label: 'Registration', exact: true },
    ],
    details: [{ pattern: /^\/box-office\/registration\/[^/]+$/, parent: '/box-office/registration' }],
  },
  {
    key: 'accommodation', label: 'Accommodation', icon: 'camping', prefix: '/accommodation',
    tabs: [
      { path: '/accommodation/inventory', label: 'Inventory' },
      { path: '/accommodation/setup', label: 'Setup' },
      { path: '/accommodation/fields', label: 'Fields', exact: true },
    ],
    details: [{ pattern: /^\/accommodation\/fields\/[^/]+$/, parent: '/accommodation/fields' }],
  },
  {
    key: 'workshops', label: 'Workshops', icon: 'palette', prefix: '/workshops',
    tabs: [
      { path: '/workshops', label: 'Planner', exact: true },
      { path: '/workshops/reports', label: 'Reports' },
      { path: '/workshops/setup', label: 'Setup' },
    ],
    details: [{ pattern: /^\/workshops\/sessions\/[^/]+$/, parent: '/workshops' }],
  },
  {
    key: 'hospitality', label: 'Hospitality', icon: 'restaurant', prefix: '/hospitality',
    tabs: [
      { path: '/hospitality', label: 'Today', exact: true },
      { path: '/hospitality/desk', label: 'Serving desk' },
      { path: '/hospitality/guests', label: 'Guests' },
      { path: '/hospitality/report', label: 'Report' },
      { path: '/hospitality/stay', label: 'Stay' },
      { path: '/hospitality/setup', label: 'Setup' },
    ],
    details: [],
  },
  {
    key: 'medical', label: 'Medical Desk', icon: 'medical_services', prefix: '/medical',
    tabs: [
      { path: '/medical', label: 'Desk', exact: true },
      { path: '/medical/records', label: 'Records' },
      { path: '/medical/report', label: 'Report' },
    ],
    details: [{ pattern: /^\/medical\/patients\/[^/]+$/, parent: '/medical/records' }],
  },
  {
    key: 'wash', label: 'WASH', icon: 'water_drop', prefix: '/wash',
    tabs: [
      { path: '/wash', label: 'Monitor', exact: true },
      { path: '/wash/stock', label: 'Stock' },
      { path: '/wash/report', label: 'Report' },
      { path: '/wash/setup', label: 'Setup' },
    ],
    details: [],
  },
  {
    key: 'admin', label: 'Admin', icon: 'admin_panel_settings', prefix: '/admin',
    tabs: [
      { path: '/admin/user', label: 'Users' },
      { path: '/admin/departments', label: 'Departments', exact: true },
      { path: '/admin/events', label: 'Events', exact: true },
      { path: '/admin/email-report', label: 'Email Report' },
      { path: '/admin/announcements', label: 'Announcements' },
      { path: '/admin/public-page', label: 'Public Page' },
      { path: '/admin/uat-reset', label: 'UAT Reset' }, // UAT-RESET: remove before Production
    ],
    details: [
      { pattern: /^\/admin\/events\/[^/]+$/, parent: '/admin/events' },
      { pattern: /^\/admin\/departments\/[^/]+$/, parent: '/admin/departments' },
    ],
  },
];

export interface NavMatch {
  section: NavSection;
  /** The tab that lights up (the parent tab on a detail page); null for an unknown page in the section. */
  tab: NavTab | null;
  detail: boolean;
}

/** The URL without query string or fragment, and without a trailing slash. */
export function cleanPath(url: string): string {
  const p = (url || '/').split(/[?#]/)[0];
  return p.length > 1 ? p.replace(/\/+$/, '') : p;
}

export function sectionByKey(key: SectionKey): NavSection | undefined {
  return NAV_SECTIONS.find(s => s.key === key);
}

/** Which section, tab and detail page a URL belongs to; null outside the sections (Main pages, Profile, Login). */
export function matchUrl(url: string): NavMatch | null {
  const path = cleanPath(url);
  const section = NAV_SECTIONS.find(s => path === s.prefix || path.startsWith(s.prefix + '/'));
  if (!section) return null;
  const detail = section.details.find(d => d.pattern.test(path));
  if (detail) {
    return { section, tab: section.tabs.find(t => t.path === detail.parent) || null, detail: true };
  }
  const tab = section.tabs.find(t => t.exact ? path === t.path : (path === t.path || path.startsWith(t.path + '/')));
  return { section, tab: tab || null, detail: false };
}
