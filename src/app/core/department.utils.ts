// Auto-derives a compact department badge from its name — uppercase, spaces
// stripped, first 3 characters (e.g. "Box Office" -> "BOX", "General" -> "GEN").
// No schema field for this; always computed client-side from the name already on hand.
export function deptShortCode(name: string): string {
  return (name || '').toUpperCase().replace(/\s+/g, '').substring(0, 3);
}
