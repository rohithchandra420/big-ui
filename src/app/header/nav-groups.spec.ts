import { groupOfUrl, readOpenGroups, writeOpenGroups } from './nav-groups';

describe('sidebar groups (nav-groups)', () => {
  afterEach(() => localStorage.removeItem('navGroups'));

  it('only Main is still a group', () => {
    expect(groupOfUrl('/')).toBe('main');
    expect(groupOfUrl('/billboard?n=1')).toBe('main');
    expect(groupOfUrl('/sos')).toBe('main');
    expect(groupOfUrl('/venue-map')).toBe('main');
    expect(groupOfUrl('/my-department')).toBe('main');
    expect(groupOfUrl('/box-office/registration/abc')).toBeNull();
    expect(groupOfUrl('/hospitality/desk')).toBeNull();
    expect(groupOfUrl('/admin/user')).toBeNull();
    expect(groupOfUrl('/profile')).toBeNull();
    expect(groupOfUrl('/billboardx')).toBeNull();
  });

  it('remembers choices in this browser, and survives bad stored data', () => {
    expect(readOpenGroups()).toEqual({});
    writeOpenGroups({ main: false });
    expect(readOpenGroups()).toEqual({ main: false });
    localStorage.setItem('navGroups', '{not json');
    expect(readOpenGroups()).toEqual({});
  });
});
