import {
  allInside, areaInfo, areaWeight, shapeCenter, formatArea, guessAreaKind, guessType, kmlProblem, parseKml, parseKmlShapes, parseLatLng,
  pointInPolygon, polygonAreaM2, streetViewUrl, typeInfo
} from './venue-map.utils';

describe('venue-map utils', () => {
  it('parses coordinates pasted from Google Maps, and rejects nonsense', () => {
    expect(parseLatLng('12.9763, 77.5929')).toEqual([12.9763, 77.5929]);
    expect(parseLatLng(' -33.8568,151.2153 ')).toEqual([-33.8568, 151.2153]);
    expect(parseLatLng('12.97 77.59')).toEqual([12.97, 77.59]);
    expect(parseLatLng('north gate')).toBeNull();
    expect(parseLatLng('95, 10')).toBeNull();
    expect(parseLatLng('10, 200')).toBeNull();
  });

  it('guesses a type from a place name', () => {
    expect(guessType('Water Station 4')).toBe('water');
    expect(guessType('Crew Mess')).toBe('other');            // the Mess Hall is an area now
    expect(guessType('Workshop Hall C')).toBe('other');     // workshops / medical are areas now
    expect(guessType('First Aid Point 2')).toBe('other');
    expect(guessType('Toilet Block East')).toBe('toilets');
    expect(guessType('Main Stage')).toBe('stage');
    expect(guessType('Side Gate')).toBe('gate');
    expect(guessType('North Camping')).toBe('field');
    expect(guessType('Lost & found')).toBe('other');
  });

  it('reads point placemarks from KML (lng,lat order), skipping shapes and bad points', () => {
    const kml = `<?xml version="1.0"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document>
      <Placemark><name>Water Station 4</name><Point><coordinates>77.5941,12.9772,0</coordinates></Point></Placemark>
      <Placemark><name>Boundary</name><Polygon><outerBoundaryIs><LinearRing><coordinates>77.59,12.97 77.6,12.98</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
      <Placemark><name>Broken</name><Point><coordinates>abc</coordinates></Point></Placemark>
      <Placemark><Point><coordinates>77.5908,12.9763</coordinates></Point></Placemark>
    </Document></kml>`;
    expect(parseKml(kml)).toEqual([
      { name: 'Water Station 4', lat: 12.9772, lng: 77.5941, type: 'water' },
      { name: 'Imported place 4', lat: 12.9763, lng: 77.5908, type: 'other' }
    ]);
  });

  it('returns nothing for a file that is not KML', () => {
    expect(parseKml('not xml at all <')).toEqual([]);
  });

  it('trims long names to 60 characters', () => {
    const long = 'x'.repeat(80);
    const [p] = parseKml(`<kml><Placemark><name>${long}</name><Point><coordinates>1,2</coordinates></Point></Placemark></kml>`);
    expect(p.name.length).toBe(60);
  });

  it('explains why a file gave no places', () => {
    expect(kmlProblem('PK\u0003\u0004 zipped bytes')).toContain('KMZ');
    expect(kmlProblem('hello')).toContain('isn\'t a KML file');
    expect(kmlProblem('<kml><Document></Document></kml>')).toBe('No places found in that file.');
    expect(kmlProblem('<kml><Document><NetworkLink><Link><href>https://example.com/kml</href></Link></NetworkLink></Document></kml>'))
      .toContain('only links to a map online');
    expect(kmlProblem('<kml><Placemark><name>Wall</name><Polygon/></Placemark></kml>')).toContain('no pins, areas or lines');
  });

  it('falls back to Other for an unknown type, and builds a Street View link', () => {
    expect(typeInfo('castle').value).toBe('other');
    expect(streetViewUrl(12.5, 77.5)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=12.5,77.5');
  });
});

describe('venue-map area helpers', () => {
  const square: [number, number][] = [[12.97, 77.59], [12.97, 77.60], [12.98, 77.60], [12.98, 77.59]];

  it('knows inside from outside', () => {
    expect(pointInPolygon([12.975, 77.595], square)).toBeTrue();
    expect(pointInPolygon([12.985, 77.595], square)).toBeFalse();
    expect(allInside([[12.971, 77.591], [12.979, 77.599]], square)).toBeTrue();
    expect(allInside([[12.971, 77.591], [12.99, 77.599]], square)).toBeFalse();
  });

  it('measures a polygon (a 0.01° square near Bengaluru is about 120 ha)', () => {
    const m2 = polygonAreaM2(square);
    expect(m2).toBeGreaterThan(1.15e6);
    expect(m2).toBeLessThan(1.25e6);
    expect(formatArea(m2)).toMatch(/^12\d\.\d ha$/);
    expect(formatArea(850.4)).toBe('850 m²');
  });

  it('guesses area kinds from names', () => {
    expect(guessAreaKind('Festival boundary', 'polygon')).toBe('boundary');
    expect(guessAreaKind('Washroom block', 'polygon')).toBe('washroom');
    expect(guessAreaKind('Crew Dining Hall', 'polygon')).toBe('mess_hall');
    expect(guessAreaKind('North camping', 'polygon')).toBe('camping');
    expect(guessAreaKind('Main entry', 'line')).toBe('entry');
    expect(guessAreaKind('Emergency exit route', 'line')).toBe('emergency');
    expect(guessAreaKind('Back road', 'line')).toBe('road');
    expect(guessAreaKind('Lakeside walking path', 'line')).toBe('path');
    expect(guessAreaKind('Crew area', 'polygon')).toBe('crew_area');
    expect(guessAreaKind('Medical camp', 'polygon')).toBe('medical_camp');
    expect(guessAreaKind('Something', 'polygon')).toBe('other_area');
    expect(areaInfo('castle').value).toBe('other_area');
  });

  it('draws everything 2 thick except roads; Medical camp has the red cross', () => {
    expect(areaWeight('path')).toBe(2);
    expect(areaWeight('camping')).toBe(2);
    expect(areaWeight('road')).toBeGreaterThan(2);
    expect(areaInfo('medical_camp').icon).toBe('local_hospital');
    expect(typeInfo('medical').value).toBe('other');   // no medical pin type any more
  });

  it('finds the middle of an area and the halfway point of a line', () => {
    const [lat, lng] = shapeCenter(square, 'polygon');
    expect(lat).toBeCloseTo(12.975, 6);
    expect(lng).toBeCloseTo(77.595, 6);
    expect(shapeCenter([[0, 0], [0, 2], [0, 10]], 'line')).toEqual([0, 5]);
    expect(shapeCenter([[1, 1], [1, 1], [1, 1]], 'polygon')).toEqual([1, 1]);
  });

  it('reads polygons (dropping the repeated first point) and lines from KML', () => {
    const shapes = parseKmlShapes('<kml>' +
      '<Placemark><name>Camping zone</name><Polygon><outerBoundaryIs><LinearRing>' +
      '<coordinates>77.59,12.97,0 77.60,12.97,0 77.60,12.98,0 77.59,12.97,0</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>' +
      '<Placemark><name>Fence</name><LineString><coordinates>77.59,12.97 77.60,12.97</coordinates></LineString></Placemark>' +
      '<Placemark><name>Pin</name><Point><coordinates>77.59,12.97</coordinates></Point></Placemark></kml>');
    expect(shapes).toEqual([
      { name: 'Camping zone', shape: 'polygon', kind: 'camping', points: [[12.97, 77.59], [12.97, 77.6], [12.98, 77.6]] },
      { name: 'Fence', shape: 'line', kind: 'fence', points: [[12.97, 77.59], [12.97, 77.6]] }
    ]);
  });
});
