import { guessType, kmlProblem, parseKml, parseLatLng, streetViewUrl, typeInfo } from './venue-map.utils';

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
    expect(guessType('Workshop Hall C')).toBe('workshop');
    expect(guessType('First Aid Point 2')).toBe('medical');
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
    expect(kmlProblem('<kml><Placemark><name>Wall</name><Polygon/></Placemark></kml>')).toContain('1 shape or line but no pins');
  });

  it('falls back to Other for an unknown type, and builds a Street View link', () => {
    expect(typeInfo('castle').value).toBe('other');
    expect(streetViewUrl(12.5, 77.5)).toBe('https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=12.5,77.5');
  });
});
