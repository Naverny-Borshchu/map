import {
  zoomForDistance,
  nearestPlace,
  zoomToShowNearest,
  coordsOf,
  focusPlan,
  FOCUS_ZOOM,
  FOCUS_MIN_ZOOM,
  MIN_FIT_ZOOM,
  MAX_FIT_ZOOM,
} from './mapZoom';

const KYIV = { lat: 50.4501, lng: 30.5234 };
const DESKTOP = { width: 1536, height: 1080 };

// Google's own tile maths: at zoom z one pixel is
// 156543.03392 * cos(lat) / 2^z metres. Used to check the answer independently
// of the implementation rather than restating it.
const metresPerPixel = (zoom, lat) =>
  (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;

const fitsOnScreen = (metres, zoom, lat, viewport) => {
  const halfSpan = Math.min(viewport.width, viewport.height) / 2;
  return metres <= metresPerPixel(zoom, lat) * halfSpan;
};

describe('zoomForDistance', () => {
  it('keeps street zoom when the nearest bowl is round the corner', () => {
    expect(zoomForDistance(150, KYIV.lat, DESKTOP)).toBe(MAX_FIT_ZOOM);
  });

  it.each([500, 2000, 8000, 40000])(
    'returns a zoom that actually fits a venue %i m away',
    (metres) => {
      const zoom = zoomForDistance(metres, KYIV.lat, DESKTOP);
      expect(fitsOnScreen(metres, zoom, KYIV.lat, DESKTOP)).toBe(true);
    },
  );

  it('zooms out as the nearest venue gets further away', () => {
    const near = zoomForDistance(500, KYIV.lat, DESKTOP);
    const mid = zoomForDistance(5000, KYIV.lat, DESKTOP);
    const far = zoomForDistance(50000, KYIV.lat, DESKTOP);
    expect(near).toBeGreaterThan(mid);
    expect(mid).toBeGreaterThan(far);
  });

  it('stops at a sensible floor instead of showing the whole planet', () => {
    // nearest borsch on another continent: a world map helps nobody
    expect(zoomForDistance(8_000_000, KYIV.lat, DESKTOP)).toBe(MIN_FIT_ZOOM);
  });

  it('accounts for the narrower phone viewport', () => {
    const phone = zoomForDistance(3000, KYIV.lat, { width: 390, height: 844 });
    const desktop = zoomForDistance(3000, KYIV.lat, DESKTOP);
    expect(phone).toBeLessThanOrEqual(desktop);
    expect(fitsOnScreen(3000, phone, KYIV.lat, { width: 390, height: 844 })).toBe(true);
  });

  it('falls back to street zoom when the viewport is not known yet', () => {
    expect(zoomForDistance(3000, KYIV.lat, {})).toBe(MAX_FIT_ZOOM);
    expect(zoomForDistance(0, KYIV.lat, DESKTOP)).toBe(MAX_FIT_ZOOM);
  });
});

describe('coordsOf', () => {
  it('reads the API shape, where the numbers arrive as strings', () => {
    expect(coordsOf({ latitude: '50.45', longitude: '30.52' }))
      .toEqual({ lat: 50.45, lng: 30.52 });
  });

  it('reads the other shape some callers carry', () => {
    expect(coordsOf({ location: { lat: 50.45, lng: 30.52 } }))
      .toEqual({ lat: 50.45, lng: 30.52 });
  });

  it('refuses a place with no usable coordinates rather than placing it at 0,0', () => {
    expect(coordsOf({ name: 'кудись' })).toBeNull();
    expect(coordsOf({ latitude: 'скоро', longitude: '' })).toBeNull();
    expect(coordsOf(null)).toBeNull();
  });

  it('refuses 0,0: the add form writes lat || 0 when it has no location, and 0,0 is the Gulf of Guinea', () => {
    expect(coordsOf({ latitude: 0, longitude: 0 })).toBeNull();
    expect(coordsOf({ latitude: '0', longitude: '0.0' })).toBeNull();
    expect(coordsOf({ location: { lat: 0, lng: 0 } })).toBeNull();
    // a real point on one of the axes is still a point
    expect(coordsOf({ latitude: 0, longitude: 30.52 })).toEqual({ lat: 0, lng: 30.52 });
  });
});

describe('nearestPlace', () => {
  const places = [
    { name: 'far', latitude: '50.5501', longitude: '30.5234' },   // ~11 km N
    { name: 'near', latitude: '50.4531', longitude: '30.5234' },  // ~330 m N
    { name: 'broken', latitude: null, longitude: null },
  ];

  it('picks the closest and reports how far it is', () => {
    const hit = nearestPlace(KYIV, places);
    expect(hit.place.name).toBe('near');
    expect(hit.metres).toBeGreaterThan(200);
    expect(hit.metres).toBeLessThan(500);
  });

  it('skips places with no coordinates instead of ranking them first', () => {
    expect(nearestPlace(KYIV, [{ name: 'broken' }])).toBeNull();
  });

  it('returns nothing when there is nothing to compare against', () => {
    expect(nearestPlace(KYIV, [])).toBeNull();
    expect(nearestPlace(null, places)).toBeNull();
  });
});

describe('zoomToShowNearest', () => {
  it('gives a zoom that frames the nearest venue', () => {
    const places = [{ latitude: '50.4711', longitude: '30.5234' }]; // ~2.3 km
    const zoom = zoomToShowNearest(KYIV, places, DESKTOP);
    expect(fitsOnScreen(2340, zoom, KYIV.lat, DESKTOP)).toBe(true);
  });

  it('returns null when there is nothing to fit, so the caller leaves zoom alone', () => {
    expect(zoomToShowNearest(KYIV, [], DESKTOP)).toBeNull();
    expect(zoomToShowNearest(KYIV, undefined, DESKTOP)).toBeNull();
  });
});

// 21.11.2026: a borshch in Gudauri opened beside a map of Kyiv. What the map does to show one place.
describe('focusPlan', () => {
  const GUDAURI = { lat: 42.4769, lng: 44.4769 };
  // a stand-in for google.maps.LatLngBounds: a box around Kyiv
  const kyivBox = {
    contains: ({ lat, lng }) => lat > 50.3 && lat < 50.6 && lng > 30.3 && lng < 30.8,
  };

  it('moves when the place is off screen', () => {
    expect(focusPlan({ target: GUDAURI, bounds: kyivBox, zoom: 16 }).move).toBe(true);
  });

  it('keeps the view when the place is already on screen (a card opened from a pin you were looking at)', () => {
    expect(focusPlan({ target: KYIV, bounds: kyivBox, zoom: 16 })).toEqual({ move: false, zoom: null });
  });

  it('moves when the map has no bounds yet: it was just created by the desktop split', () => {
    expect(focusPlan({ target: KYIV, bounds: null, zoom: 16 }).move).toBe(true);
    expect(focusPlan({ target: KYIV, bounds: undefined, zoom: 16 }).move).toBe(true);
  });

  it('zooms in from far out, where one pin is lost among city markers', () => {
    expect(focusPlan({ target: GUDAURI, bounds: null, zoom: 6 }).zoom).toBe(FOCUS_ZOOM);
    expect(focusPlan({ target: GUDAURI, bounds: null, zoom: FOCUS_MIN_ZOOM - 1 }).zoom).toBe(FOCUS_ZOOM);
  });

  it('never zooms out of a closer view the visitor chose', () => {
    expect(focusPlan({ target: KYIV, bounds: null, zoom: FOCUS_MIN_ZOOM }).zoom).toBeNull();
    expect(focusPlan({ target: KYIV, bounds: null, zoom: 19 }).zoom).toBeNull();
  });

  it('zooms to street level when the zoom is unknown', () => {
    expect(focusPlan({ target: KYIV, bounds: null, zoom: undefined }).zoom).toBe(FOCUS_ZOOM);
  });
});
