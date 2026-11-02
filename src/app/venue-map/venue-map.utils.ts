// Venue Map helpers with no Angular or Leaflet in them, so they're easy to test.

export type LocationType = 'water' | 'toilets' | 'stage' | 'gate' | 'entry' | 'field' | 'other';

export interface LocationTypeInfo { value: LocationType; label: string; icon: string; color: string; }

/**
 * The fixed list of location types (user decision 2026-11-01); same values as the server.
 * No workshop / medical pins (user, 2026-11-02): draw a Workshop area or Medical camp instead.
 */
export const LOCATION_TYPES: LocationTypeInfo[] = [
  { value: 'water',    label: 'Water station',     icon: 'water_drop',       color: '#0284c7' },
  { value: 'toilets',  label: 'Toilets',           icon: 'wc',               color: '#64748b' },
  { value: 'stage',    label: 'Stage',             icon: 'theater_comedy',   color: '#d97706' },
  { value: 'gate',     label: 'Gate / Box Office', icon: 'door_front',       color: '#1E4638' },
  { value: 'entry',    label: 'Entry point',       icon: 'login',            color: '#16a34a' },
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
  if (/toilet|wc|washroom|restroom|loo/.test(n)) return 'toilets';
  if (/stage|amphi/.test(n)) return 'stage';
  if (/entry|entrance/.test(n)) return 'entry';
  if (/gate|box office/.test(n)) return 'gate';
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
  return 'That file has no pins, areas or lines that can be imported (only points, polygons and lines are read).';
}

export const directionsUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;

/** Google Maps' own Street View at that spot (a plain link — no embedded Street View). */
export const streetViewUrl = (lat: number, lng: number) =>
  `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;

// ── Areas and lines (story A2) ─────────────────────────────────────────

export type AreaKind = 'boundary' | 'workshop_area' | 'camping' | 'washroom' | 'parking' | 'stage_area'
  | 'medical_camp' | 'office' | 'crew_area' | 'nogo' | 'other_area'
  | 'fence' | 'road' | 'path' | 'entry' | 'emergency' | 'other_line';
export type AreaShape = 'polygon' | 'line';
export type LatLng = [number, number];

/** weight = line / outline thickness on the map (2 everywhere, roads thicker). */
export interface AreaKindInfo { value: AreaKind; label: string; shape: AreaShape; color: string; icon: string; weight?: number; }

/** Fixed list (user decision 2026-11-01); same values as the server. The boundary is admins-only and one per event. */
export const AREA_KINDS: AreaKindInfo[] = [
  // Light green, so the boundary stands out from the dark green of grass and trees on the map
  { value: 'boundary',      label: 'Festival boundary',     shape: 'polygon', color: '#86efac', icon: 'fence' },
  { value: 'workshop_area', label: 'Workshop area',         shape: 'polygon', color: '#7c3aed', icon: 'palette' },
  { value: 'camping',       label: 'Camping zone',          shape: 'polygon', color: '#386e5b', icon: 'camping' },
  { value: 'washroom',      label: 'Washroom area',         shape: 'polygon', color: '#64748b', icon: 'wc' },
  { value: 'parking',       label: 'Parking',               shape: 'polygon', color: '#0f766e', icon: 'local_parking' },
  { value: 'stage_area',    label: 'Stage area',            shape: 'polygon', color: '#d97706', icon: 'theater_comedy' },
  // Same red and cross as the "Medical / First aid" location type
  { value: 'medical_camp',  label: 'Medical camp',          shape: 'polygon', color: '#dc2626', icon: 'local_hospital' },
  { value: 'office',        label: 'Office',                shape: 'polygon', color: '#4f46e5', icon: 'business_center' },
  { value: 'crew_area',     label: 'Crew area',             shape: 'polygon', color: '#a16207', icon: 'badge' },
  { value: 'nogo',          label: 'No-go zone',            shape: 'polygon', color: '#7f1d1d', icon: 'block' },
  { value: 'other_area',    label: 'Other area',            shape: 'polygon', color: '#0284c7', icon: 'pentagon' },
  { value: 'fence',         label: 'Fence',                 shape: 'line',    color: '#78350f', icon: 'fence' },
  { value: 'road',          label: 'Road',                  shape: 'line',    color: '#374151', icon: 'add_road', weight: 6 },
  { value: 'path',          label: 'Path (walkable only)',  shape: 'line',    color: '#d6b98c', icon: 'directions_walk' },
  { value: 'entry',         label: 'Entry / exit',          shape: 'line',    color: '#16a34a', icon: 'login' },
  { value: 'emergency',     label: 'Emergency exit route',  shape: 'line',    color: '#dc2626', icon: 'emergency' },
  { value: 'other_line',    label: 'Other line',            shape: 'line',    color: '#475569', icon: 'polyline' }
];

/**
 * Where Directions / Street View / the map icon go for an area or line: the middle of a
 * polygon (area-weighted centroid — falls back to the corners' average for a degenerate
 * shape), or the point halfway along a line.
 */
export function shapeCenter(points: LatLng[], shape: AreaShape): LatLng {
  if (!points.length) return [0, 0];
  if (shape === 'line') {
    const seg = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
    let left = seg.reduce((s, d) => s + d, 0) / 2;
    for (let i = 0; i < seg.length; i++) {
      if (left <= seg[i] && seg[i] > 0) {
        const t = left / seg[i], [a, b] = [points[i], points[i + 1]];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      }
      left -= seg[i];
    }
    return points[points.length - 1];
  }
  let a2 = 0, cy = 0, cx = 0;
  points.forEach(([y1, x1], i) => {
    const [y2, x2] = points[(i + 1) % points.length];
    const f = x1 * y2 - x2 * y1;
    a2 += f; cx += (x1 + x2) * f; cy += (y1 + y2) * f;
  });
  if (Math.abs(a2) < 1e-12) {
    return [points.reduce((s, p) => s + p[0], 0) / points.length, points.reduce((s, p) => s + p[1], 0) / points.length];
  }
  return [cy / (3 * a2), cx / (3 * a2)];
}

/** Outline / line thickness: 2 for everything except roads. */
export const areaWeight = (k: string): number => areaInfo(k).weight ?? 2;

export const areaInfo = (k: string): AreaKindInfo =>
  AREA_KINDS.find(x => x.value === k) || AREA_KINDS.find(x => x.value === 'other_area')!;

/** Ray casting; points are [lat, lng]. A festival ground is small enough to treat as flat. */
export function pointInPolygon([lat, lng]: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [yi, xi] = polygon[i], [yj, xj] = polygon[j];
    if ((yi > lat) !== (yj > lat) && lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export const allInside = (points: LatLng[], polygon: LatLng[]) => points.every(p => pointInPolygon(p, polygon));

/** Size of a polygon on the Earth in m² (spherical approximation, plenty for a festival ground). */
export function polygonAreaM2(points: LatLng[]): number {
  const R = 6378137, rad = Math.PI / 180;
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const [lat1, lng1] = points[i], [lat2, lng2] = points[(i + 1) % points.length];
    sum += (lng2 - lng1) * rad * (2 + Math.sin(lat1 * rad) + Math.sin(lat2 * rad));
  }
  return Math.abs(sum * R * R / 2);
}

/** "850 m²", "2.4 ha" */
export function formatArea(m2: number): string {
  return m2 < 10000 ? `${Math.round(m2).toLocaleString('en-IN')} m²` : `${(m2 / 10000).toFixed(1)} ha`;
}

/** A starting kind from a shape's name and shape ("North fence" → fence). */
export function guessAreaKind(name: string, shape: AreaShape): AreaKind {
  const n = name.toLowerCase();
  if (shape === 'line') {
    if (/emergency/.test(n)) return 'emergency';
    if (/fence|wall/.test(n)) return 'fence';
    if (/entry|entrance|exit|gate/.test(n)) return 'entry';
    if (/road|street|drive|lane/.test(n)) return 'road';
    if (/path|walk|trail|route/.test(n)) return 'path';
    return 'other_line';
  }
  if (/boundary|perimeter|festival ground|outer wall/.test(n)) return 'boundary';
  if (/workshop/.test(n)) return 'workshop_area';
  if (/medical|first aid|clinic/.test(n)) return 'medical_camp';
  if (/camp|tent/.test(n)) return 'camping';
  if (/toilet|wash|wc/.test(n)) return 'washroom';
  if (/park/.test(n)) return 'parking';
  if (/stage/.test(n)) return 'stage_area';
  if (/office/.test(n)) return 'office';
  if (/crew|backstage/.test(n)) return 'crew_area';
  if (/no.?go|restricted|danger/.test(n)) return 'nogo';
  return 'other_area';
}

export interface KmlShape { name: string; shape: AreaShape; kind: AreaKind; points: LatLng[]; }

/** Polygons (outer edge) and lines from a .kml file; points are read by parseKml(). */
export function parseKmlShapes(xml: string): KmlShape[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) return [];
  const read = (text: string | null | undefined): LatLng[] => (text || '').trim().split(/\s+/).map(t => {
    const [lng, lat] = t.split(',').map(Number);   // KML order: lng,lat[,alt]
    return [lat, lng] as LatLng;
  }).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180);
  const out: KmlShape[] = [];
  Array.from(doc.getElementsByTagName('Placemark')).forEach((pm, i) => {
    const name = (pm.getElementsByTagName('name')[0]?.textContent || '').trim().slice(0, 60);
    const ring = pm.getElementsByTagName('outerBoundaryIs')[0]?.getElementsByTagName('coordinates')[0];
    const line = pm.getElementsByTagName('LineString')[0]?.getElementsByTagName('coordinates')[0];
    if (ring) {
      const pts = read(ring.textContent);
      const last = pts[pts.length - 1];
      if (pts.length > 1 && last[0] === pts[0][0] && last[1] === pts[0][1]) pts.pop();   // KML repeats the first point
      if (pts.length >= 3) out.push({ name: name || `Imported area ${i + 1}`, shape: 'polygon', kind: guessAreaKind(name, 'polygon'), points: pts.slice(0, 500) });
    } else if (line) {
      const pts = read(line.textContent);
      if (pts.length >= 2) out.push({ name: name || `Imported line ${i + 1}`, shape: 'line', kind: guessAreaKind(name, 'line'), points: pts.slice(0, 500) });
    }
  });
  return out;
}
