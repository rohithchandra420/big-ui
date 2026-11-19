/**
 * Joining Time — who may mark a person Reported (or undo it). Mirror of
 * big-api utils/reportedAccess.js (user-approved 2026-11-16); keep both in
 * step. The server checks it again on every call — this only hides buttons.
 * - DEV / DIR / ADMIN: anyone;
 * - the Volunteer TL (a TL of a `volunteer`-key department): any VOL or TL;
 * - a TL of the person's HOME department (their first department): that VOL / TL.
 */
export const TOP_ROLES = ['DEV', 'DIR', 'ADMIN'];

export interface ReportedActor {
  role: string;
  /** The actor's departments: id + access key. */
  depts: { id: string; key: string }[];
}

/** `targetHome` = the person's home department id ('' = none / the Volunteer pool). */
export function canSetReported(actor: ReportedActor | null, targetRole: string, targetHome: string): boolean {
  if (!actor) return false;
  if (TOP_ROLES.includes(actor.role)) return true;
  if (actor.role !== 'TL' || !['VOL', 'TL'].includes(targetRole)) return false;
  if (actor.depts.some(d => d.key === 'volunteer')) return true;
  return !!targetHome && actor.depts.some(d => d.id === targetHome);
}
