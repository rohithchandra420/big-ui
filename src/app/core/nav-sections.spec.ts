import { NAV_SECTIONS, cleanPath, matchUrl } from './nav-sections';

describe('nav-sections', () => {
  it('cleans query, fragment and trailing slash', () => {
    expect(cleanPath('/hospitality/desk?meal=lunch#x')).toBe('/hospitality/desk');
    expect(cleanPath('/admin/user/')).toBe('/admin/user');
    expect(cleanPath('/')).toBe('/');
    expect(cleanPath('')).toBe('/');
  });

  it('leaves Main pages, Profile and Login outside the sections', () => {
    for (const url of ['/', '/billboard?n=1', '/sos', '/venue-map', '/my-department', '/profile', '/login']) {
      expect(matchUrl(url)).withContext(url).toBeNull();
    }
    expect(matchUrl('/hospitalityx')).toBeNull();
  });

  it('lights the right tab, including exact tabs next to their siblings', () => {
    expect(matchUrl('/hospitality')!.tab!.label).toBe('Today');
    expect(matchUrl('/hospitality/desk')!.tab!.label).toBe('Serving desk');
    expect(matchUrl('/workshops')!.tab!.label).toBe('Planner');
    expect(matchUrl('/workshops/reports')!.tab!.label).toBe('Reports');
    expect(matchUrl('/medical')!.tab!.label).toBe('Desk');
    expect(matchUrl('/box-office/bookings')!.section.label).toBe('Box Office');
    expect(matchUrl('/admin/email-report')!.tab!.label).toBe('Email Report');
  });

  it('treats detail pages as their parent tab', () => {
    const cases: [string, string][] = [
      ['/box-office/registration/BK-1042', 'Registration'],
      ['/workshops/sessions/s-1', 'Planner'],
      ['/medical/patients/p-1', 'Records'],
      ['/admin/events/e-7', 'Events'],
      ['/admin/departments/d-1', 'Departments'],
      ['/accommodation/fields/f-1', 'Fields'],
    ];
    for (const [url, parent] of cases) {
      const m = matchUrl(url)!;
      expect(m.detail).withContext(url).toBeTrue();
      expect(m.tab!.label).withContext(url).toBe(parent);
    }
    expect(matchUrl('/box-office/registration')!.detail).toBeFalse();
  });

  it('has unique tab paths and parents that exist', () => {
    const paths = NAV_SECTIONS.flatMap(s => s.tabs.map(t => t.path));
    expect(new Set(paths).size).toBe(paths.length);
    for (const s of NAV_SECTIONS) {
      for (const d of s.details) expect(s.tabs.some(t => t.path === d.parent)).withContext(d.parent).toBeTrue();
    }
  });
});
