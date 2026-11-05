import { PublicMapArea, PublicMapPin } from './public-api.service';
import { WordKey } from './i18n';

// Public map helpers (PH4a). Colours / icons match the staff Venue Map
// (big-ui src/app/venue-map/venue-map.utils.ts); words are the public ones.

export interface Look { icon: string; colour: string; word: WordKey; }

export const PIN_LOOK: Record<string, Look> = {
  water:      { icon: 'water_drop', colour: '#0284c7', word: 'map.water' },
  toilets:    { icon: 'wc', colour: '#64748b', word: 'map.toilets' },
  stage:      { icon: 'theater_comedy', colour: '#d97706', word: 'map.stage' },
  gate:       { icon: 'door_front', colour: '#1E4638', word: 'map.gate' },
  entry:      { icon: 'login', colour: '#16a34a', word: 'map.entry' },
  box_office: { icon: 'confirmation_number', colour: '#7c3aed', word: 'map.boxOffice' },
  field:      { icon: 'camping', colour: '#386e5b', word: 'map.field' },
};

export const AREA_LOOK: Record<string, Look & { line?: boolean; dash?: string }> = {
  boundary:      { icon: 'fence', colour: '#86efac', word: 'map.boundary', dash: '8 6' },
  workshop_area: { icon: 'palette', colour: '#7c3aed', word: 'map.workshops' },
  camping:       { icon: 'camping', colour: '#386e5b', word: 'map.camping' },
  washroom:      { icon: 'wc', colour: '#64748b', word: 'map.toilets' },
  parking:       { icon: 'local_parking', colour: '#0f766e', word: 'map.parking' },
  stage_area:    { icon: 'theater_comedy', colour: '#d97706', word: 'map.stage' },
  medical_camp:  { icon: 'local_hospital', colour: '#dc2626', word: 'map.firstAid' },
  nogo:          { icon: 'block', colour: '#b91c1c', word: 'map.nogo', dash: '4 4' },
  path:          { icon: 'directions_walk', colour: '#c9a46b', word: 'map.path', line: true },
  entry:         { icon: 'login', colour: '#16a34a', word: 'map.entry', line: true },
  emergency:     { icon: 'emergency', colour: '#dc2626', word: 'map.emergencyRoute', line: true, dash: '10 6' },
};

/** The middle of a polygon (corners' average is enough at festival scale) or a line's halfway point. */
export function centreOf(a: PublicMapArea): [number, number] {
  const pts = a.points;
  if (AREA_LOOK[a.kind]?.line) return pts[Math.floor(pts.length / 2)];
  const lat = pts.reduce((s, p) => s + p[0], 0) / pts.length;
  const lng = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  return [lat, lng];
}

/** Straight-line distance in metres. */
export function metresBetween(a: [number, number], b: [number, number]): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** About 75 m a minute on a festival ground; at least 1 minute. */
export const walkMinutes = (m: number) => Math.max(1, Math.round(m / 75));

/** A place on the map the page can point to (pin or area). */
export interface Place { id: string; name: string; at: [number, number]; }

export type Shortcut = 'water' | 'firstAid' | 'toilets' | 'boxOffice';

/** Every place of a shortcut kind. */
export function placesFor(kind: Shortcut, pins: PublicMapPin[], areas: PublicMapArea[]): Place[] {
  const pin = (t: string) => pins.filter(p => p.type === t).map(p => ({ id: p.id, name: p.name, at: [p.lat, p.lng] as [number, number] }));
  const area = (k: string) => areas.filter(a => a.kind === k).map(a => ({ id: a.id, name: a.name, at: centreOf(a) }));
  switch (kind) {
    case 'water': return pin('water');
    case 'firstAid': return area('medical_camp');
    case 'toilets': return [...pin('toilets'), ...area('washroom')];
    default: return pin('box_office');
  }
}

/** The nearest place (or the first one when we don't know where the phone is). */
export function nearest(places: Place[], me: [number, number] | null): { place: Place; metres: number | null } | null {
  if (!places.length) return null;
  if (!me) return { place: places[0], metres: null };
  let best = places[0], bestM = metresBetween(me, best.at);
  for (const p of places.slice(1)) {
    const m = metresBetween(me, p.at);
    if (m < bestM) { best = p; bestM = m; }
  }
  return { place: best, metres: bestM };
}

/** Walking directions in the phone's maps app. */
export const directionsUrl = (at: [number, number]) =>
  `https://www.google.com/maps/dir/?api=1&destination=${at[0].toFixed(6)},${at[1].toFixed(6)}&travelmode=walking`;

/** A Maps link to share a spot. */
export const mapsLinkFor = (at: [number, number]) => `https://maps.google.com/?q=${at[0].toFixed(6)},${at[1].toFixed(6)}`;
