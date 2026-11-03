import { groupOfUrl, readOpenGroups, writeOpenGroups } from './nav-groups';

describe('sidebar groups (nav-groups)', () => {
  afterEach(() => localStorage.removeItem('navGroups'));

  it('maps a page to its group', () => {
    expect(groupOfUrl('/')).toBe('main');
    expect(groupOfUrl('/billboard?n=1')).toBe('main');
    expect(groupOfUrl('/my-department')).toBe('main');
    expect(groupOfUrl('/box-office/registration/abc')).toBe('box-office');
    expect(groupOfUrl('/accommodation/inventory')).toBe('accommodation');
    expect(groupOfUrl('/workshops/sessions/1')).toBe('workshops');
    expect(groupOfUrl('/hospitality')).toBe('hospitality');
    expect(groupOfUrl('/hospitality/desk')).toBe('hospitality');
    expect(groupOfUrl('/admin/user')).toBe('admin');
    expect(groupOfUrl('/profile')).toBeNull();
    expect(groupOfUrl('/hospitalityx')).toBeNull();
  });

  it('remembers choices in this browser, and survives bad stored data', () => {
    expect(readOpenGroups()).toEqual({});
    writeOpenGroups({ admin: true, main: false });
    expect(readOpenGroups()).toEqual({ admin: true, main: false });
    localStorage.setItem('navGroups', '{not json');
    expect(readOpenGroups()).toEqual({});
  });
});
