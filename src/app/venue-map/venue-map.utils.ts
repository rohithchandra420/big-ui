// Venue Map helpers with no Angular or Leaflet in them, so they're easy to test.

export type LocationType = 'workshop' | 'water' | 'medical' | 'toilets' | 'stage' | 'gate' | 'field' | 'other';

export interface LocationTypeInfo { value: LocationType; label: string; icon: string; color: string; }

/** The fixed list of location types (user decision 2026-11-01); same values as the server. */
export const LOCATION_TYPES: LocationTypeInfo[] = [
  { value: 'workshop', label: 'Workshop venue',    icon: 'palette',          color: '#7c3aed' },
  { value: 'water',    label: 'Water station',     icon: 'water_drop',       color: '#0284c7' },
  { value: 'medical',  label: 'First aid',         icon: 'medical_services', color: '#dc2626' },
  { value: 'toilets',  label: 'Toilets',           icon: 'wc',               color: '#64748b' },
  { value: 'stage',    label: 'Stage',             icon: 'theater_comedy',   color: '#d97706' },
  { value: 'gate',     label: 'Gate / Box Office', icon: 'door_front',       color: '#1E4638' },
  { value: 'field',    label: 'Tent field',        icon: 'camping',          color: '#386e5b' },
  { value: 'other',    label: 'Other',             icon: 'location_on',      color: '#475569' }
];

export const typeInfo = (t: string): LocationTypeInfo =>
  LOCATION_TYPES.find(x => x.value === t) || LOCATION_TYPES[LOCATION_TYPES.length - 1];

/** "12.9763, 77.5929" (as copied from Google Maps) → [lat, lng]; null if not valid. */
export function parseLatLng(text: string): [number, number] | null {
  const m = (text || '').match(/(-?\d+(?:\.\d+)?)\s*[,\s]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = +m[1], lng = +m[2];
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : null;
}

/** A sensible starting type from a place's name ("Water Station 4" → water). */
export function guessType(name: string): LocationType {
  const n = name.toLowerCase();
  if (/water|drink|tap/.test(n)) return 'water';
  if (/workshop|hall|studio|class/.test(n)) return 'workshop';
  if (/first aid|medic|doctor|clinic|aid/.test(n)) return 'medical';
  if (/toilet|wc|washroom|restroom|loo/.test(n)) return 'toilets';
  if (/stage|amphi/.test(n)) return 'stage';
  if (/gate|entry|entrance|box office/.test(n)) return 'gate';
  if (/tent|camp|field/.test(n)) return 'field';
  return 'other';
}

export interface KmlPoint { name: string; lat: number; lng: number; type: LocationType; }

/**
 * Point placemarks from a .kml file (Google Earth / My Maps export). Shapes and
 * lines are skipped (they come with the boundaries story). Names are trimmed to
 * the server's 60-character limit.
 */
export function parseKml(xml: string): KmlPoint[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const out: KmlPoint[] = [];
  const placemarks = Array.from(doc.getElementsByTagName('Placemark'));
  placemarks.forEach((pm, i) => {
    const point = pm.getElementsByTagName('Point')[0];
    const coords = point?.getElementsByTagName('coordinates')[0]?.textContent?.trim();
    if (!coords) return;
    const [lng, lat] = coords.split(/[\s,]+/).map(Number);   // KML order is lng,lat[,alt]
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return;
    const name = (pm.getElementsByTagName('name')[0]?.textContent || `Imported place ${i + 1}`).trim().slice(0, 60) || `Imported place ${i + 1}`;
    out.push({ name, lat, lng, type: guessType(name) });
  });
  return out;
}

/**
 * Why a file gave no places, in words staff can act on. Called only when
 * parseKml() found nothing.
 */
export function kmlProblem(text: string): string {
  if (text.startsWith('PK')) {
    return 'This is a KMZ (zipped) file. Export it again as KML — in Google My Maps tick "Export as KML instead of KMZ".';
  }
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length || !doc.getElementsByTagName('kml').length) {
    return 'That file isn\'t a KML file.';
  }
  const placemarks = doc.getElementsByTagName('Placemark').length;
  if (!placemarks && doc.getElementsByTagName('NetworkLink').length) {
    // My Maps' "Keep data up to date with network link KML" export: only a link to Google, no pins in the file.
    return 'This file only links to a map online and has no places in it. Export again from Google My Maps with ' +
      '"Keep data up to date with network link KML" unticked and "Export as KML instead of KMZ" ticked.';
  }
  if (!placemarks) return 'No places found in that file.';
  return `That file has ${placemarks} shape${placemarks === 1 ? '' : 's'} or line${placemarks === 1 ? '' : 's'} but no pins — only pins can be imported for now.`;
}

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/** Google Maps' own Street View at that spot (a plain link — no embedded Street View). */
export const streetViewUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
