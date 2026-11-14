/**
 * The built-in access keys (user decision 2026-11-14) — the same list as
 * big-api `utils/accessKeys.js`; keep the two in step. A key only means
 * something when code checks it, so the list is fixed here: nobody types a new
 * key. A department carries one of these keys; a user's grants are
 * "<key>:<tier>". The server checks every key and tier again.
 *
 * To add a key: add it here and in big-api in the same change that adds the
 * page and its access check.
 */
export type AccessTier = 'read' | 'write' | 'manage';

export interface AccessKeyTier {
  tier: AccessTier;
  /** The chip's word (Medical Desk has one tier, shown as "Use"). */
  label: string;
  /** What the tier gives, shown under the chip row and as the chip's tooltip. */
  gives: string;
}

export interface AccessKey {
  key: string;
  label: string;
  /** One line for the Create Department key picker. */
  about: string;
  /** The tiers that do something. Empty = the key gives no page access. */
  tiers: AccessKeyTier[];
  /** The page treats every tier alike: an old grant of any tier shows as the one listed tier. */
  anyTier?: boolean;
}

export const DEFAULT_ACCESS_KEY = 'general';

export const ACCESS_KEYS: AccessKey[] = [
  {
    key: 'general', label: 'General',
    about: 'No page access. For departments without a page of their own.',
    tiers: []
  },
  {
    key: 'box-office', label: 'Box Office',
    about: 'Members open Bookings, Registration, Inventory and Fields, and admit people.',
    tiers: [
      { tier: 'read', label: 'Read', gives: 'See Bookings, Registration, Inventory and Fields' },
      { tier: 'write', label: 'Write', gives: 'Also replace wrist bands, vacate tents' },
      { tier: 'manage', label: 'Manage', gives: 'Also send Ticket Emails' }
    ]
  },
  {
    key: 'tenting', label: 'Accommodation',
    about: 'Members see Accommodation: Setup, Inventory and Fields. The Team Lead changes them.',
    tiers: [
      { tier: 'read', label: 'Read', gives: 'See Setup, Inventory and Fields' },
      { tier: 'write', label: 'Write', gives: 'Also create, edit and delete units, and vacate tents' },
      { tier: 'manage', label: 'Manage', gives: 'Also create and lay out tent fields' }
    ]
  },
  {
    key: 'workshop', label: 'Workshops',
    about: 'Members run registration lists and the door. The Team Lead plans.',
    tiers: [
      { tier: 'read', label: 'Read', gives: 'See the Reports (with names)' },
      { tier: 'write', label: 'Write', gives: 'Also run registration, lists and the door' },
      { tier: 'manage', label: 'Manage', gives: 'Also plan venues, workshops and the schedule' }
    ]
  },
  {
    key: 'hospitality', label: 'Hospitality',
    about: 'The Team Lead runs the whole Hospitality section.',
    tiers: [
      { tier: 'manage', label: 'Manage', gives: 'The whole Hospitality section' }
    ]
  },
  {
    key: 'medical', label: 'Medical Desk',
    about: 'Members use the Medical Desk (health records).',
    anyTier: true,
    tiers: [
      { tier: 'read', label: 'Use', gives: 'Use the Medical Desk: find people, record visits, read reports' }
    ]
  },
  {
    key: 'wash', label: 'WASH',
    about: 'Members log refills and cleaning. The Team Lead sets up facilities and stock.',
    tiers: [
      { tier: 'read', label: 'Read', gives: 'See the Monitor' },
      { tier: 'write', label: 'Write', gives: 'Also log Refilled / Cleaned / Empty / Out of order' },
      { tier: 'manage', label: 'Manage', gives: 'Also Setup, stickers and stock' }
    ]
  }
];

const BY_KEY = new Map(ACCESS_KEYS.map(k => [k.key, k]));

export const isAccessKey = (key: string | null | undefined): boolean => BY_KEY.has(key || '');

export const accessKey = (key: string | null | undefined): AccessKey | undefined => BY_KEY.get(key || '');

/** "Box Office" for "box-office"; the key itself when it is not a built-in one. */
export const accessKeyLabel = (key: string): string => BY_KEY.get(key)?.label ?? key;

/**
 * The tier a stored grant shows as, or null when it grants nothing (unknown
 * key, or a tier the key doesn't use). Same rule as big-api normalizeGrant().
 */
export function grantTier(grant: string): { key: string; tier: AccessTier } | null {
  const [key, tier, extra] = String(grant || '').split(':');
  const def = BY_KEY.get(key);
  if (!def || extra !== undefined || !['read', 'write', 'manage'].includes(tier)) return null;
  if (def.tiers.some(t => t.tier === tier)) return { key, tier: tier as AccessTier };
  if (def.anyTier && def.tiers.length) return { key, tier: def.tiers[0].tier };
  return null;
}
