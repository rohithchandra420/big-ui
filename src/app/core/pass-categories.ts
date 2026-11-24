// Pass kinds (PassType.category / ShopCart.category). KEEP IN STEP with big-api
// `utils/passCategories.js`. Renamed 2026-11-24 from 'festival' / 'tent' /
// 'addon' (big-api migration `migrations/renamePassCategories.js`).
//   FESTIVAL: a Festival Pass: one person; takes one bed of a stay.
//   STAY:     a Stay Pass: gives `beds` beds in an accommodation unit.
//   ADDON:    an add-on (Extra bed, Car Pass…): no person, no bed.
export const FESTIVAL = 'festival_pass' as const;
export const STAY = 'stay_pass' as const;
export const ADDON = 'addon_pass' as const;

export type PassCategory = typeof FESTIVAL | typeof STAY | typeof ADDON;

export const PASS_CATEGORIES: PassCategory[] = [FESTIVAL, STAY, ADDON];

/** What the app shows for each kind. */
export const PASS_CATEGORY_LABELS: Record<PassCategory, string> = {
  [FESTIVAL]: 'Festival Pass',
  [STAY]: 'Stay Pass',
  [ADDON]: 'Add-on'
};
