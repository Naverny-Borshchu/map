/**
 * Choosing a zoom that actually shows the visitor something.
 *
 * "Show borsch near me" used to only recentre the map on the visitor and leave
 * the zoom where it was. Standing 2 km from the nearest bowl at street zoom,
 * you got a map of your own neighbourhood with no pins on it — the button
 * appeared to do nothing, which is worse than not offering it.
 *
 * So pick the zoom from the distance to the nearest venue: close in when there
 * is one round the corner, out far enough to include it when there is not.
 */

import { distanceMeters } from './distance';

/** Web Mercator metres-per-pixel at zoom 0 on the equator. */
const EQUATOR_MPP = 156543.03392;

/** Street level: any closer and a neighbour pin can fall outside the view. */
export const MAX_FIT_ZOOM = 16;
/**
 * Roughly a large region. Below this the map is a country outline and the pin
 * tells the visitor nothing useful, so we stop rather than keep zooming out.
 */
export const MIN_FIT_ZOOM = 8;

/**
 * The largest zoom at which a point `metres` away from the centre is still
 * comfortably on screen.
 *
 * `fill` is how much of the half-viewport the distance may take up: 0.8 leaves
 * the pin inside the frame with margin rather than clipped to its very edge.
 */
export const zoomForDistance = (metres, lat, viewport = {}, fill = 0.8) => {
  const width = Number(viewport.width) || 0;
  const height = Number(viewport.height) || 0;
  const halfSpan = Math.min(width, height) / 2;
  if (!Number.isFinite(metres) || metres <= 0 || halfSpan <= 0) return MAX_FIT_ZOOM;

  const latitude = Number.isFinite(lat) ? lat : 0;
  // metresPerPixel(z) = EQUATOR_MPP * cos(lat) / 2^z, and we need the point to
  // land within `fill` of the half-viewport: metres <= mpp * halfSpan * fill.
  const needed = metres / (halfSpan * fill);
  const zoom = Math.log2((EQUATOR_MPP * Math.cos((latitude * Math.PI) / 180)) / needed);

  if (!Number.isFinite(zoom)) return MAX_FIT_ZOOM;
  return Math.max(MIN_FIT_ZOOM, Math.min(MAX_FIT_ZOOM, Math.floor(zoom)));
};

/**
 * Coordinates off a place, in the two shapes the app actually stores them in:
 * the API sends `latitude`/`longitude` as strings, some callers carry a
 * `location` object instead. A place without usable numbers is skipped rather
 * than treated as sitting at 0,0 in the Atlantic.
 */
export const coordsOf = (place) => {
  if (!place) return null;
  const lat = Number(place.latitude ?? place.location?.lat);
  const lng = Number(place.longitude ?? place.location?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // 0,0 is not a place in our data, it is «unknown»: the add form writes `lat || 0` when it has none
  return lat === 0 && lng === 0 ? null : { lat, lng };
};

/** Below this zoom one pin is lost among city markers and clusters: showing a place zooms in from there. */
export const FOCUS_MIN_ZOOM = 15;
/** Street level, where the pin and its neighbours read clearly (the zoom a picked list row has always used). */
export const FOCUS_ZOOM = 16;

/**
 * What the map has to do to show one place (21.11.2026: a borshch in Gudauri opened beside a map of Kyiv).
 * Move only when the point is off screen, or when the map has no bounds yet (it was just created); a card
 * opened from a pin the visitor is looking at keeps their view. Zoom in only from far out, never out.
 * `bounds` is anything with contains({lat, lng}), i.e. google.maps.LatLngBounds.
 */
/**
 * The box a map of `size` px shows around `center` at `zoom` (Web Mercator: one 256 px tile spans 360° of longitude at
 * zoom 0), shrunk by `inset` so a pin under the edge controls does not count as on screen. For a map that does not
 * exist yet: the desktop split creates a new one on every route change, and it opens at a known view (lastView in
 * Map.jsx). Without this the card moved a map whose pin was already in sight (map1, 21.11.2026).
 */
export const viewBounds = (center, zoom, size, inset = 0.9) => {
  if (!center || !Number.isFinite(zoom) || !size || !(size.width > 0) || !(size.height > 0)) return null;
  const halfLng = (size.width / 2) * (360 / (256 * 2 ** zoom)) * inset;
  const metresPerPx = (EQUATOR_MPP * Math.cos((center.lat * Math.PI) / 180)) / 2 ** zoom;
  const halfLat = (((size.height / 2) * metresPerPx) / 111320) * inset;
  return {
    contains: ({ lat, lng }) => Math.abs(lat - center.lat) <= halfLat && Math.abs(lng - center.lng) <= halfLng,
  };
};

export const focusPlan = ({ target, bounds, zoom }) => ({
  move: !bounds || !bounds.contains(target),
  zoom: Number.isFinite(zoom) && zoom >= FOCUS_MIN_ZOOM ? null : FOCUS_ZOOM,
});

/** The closest place to `from`, with its distance. Null when there is none. */
export const nearestPlace = (from, places) => {
  if (!from || !Array.isArray(places)) return null;
  let best = null;
  for (const place of places) {
    const coords = coordsOf(place);
    if (!coords) continue;
    const metres = distanceMeters(from, coords);
    if (metres === null) continue;
    if (!best || metres < best.metres) best = { place, coords, metres };
  }
  return best;
};

/**
 * The zoom to use after moving the map to `from`, so that at least the nearest
 * venue is in frame. Returns null when there is nothing to fit, and the caller
 * then leaves the zoom alone rather than guessing.
 */
export const zoomToShowNearest = (from, places, viewport) => {
  const near = nearestPlace(from, places);
  if (!near) return null;
  return zoomForDistance(near.metres, from.lat, viewport);
};
