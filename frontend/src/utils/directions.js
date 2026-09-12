/**
 * Google Maps "get directions" link for a place.
 *
 * We deliberately send the business NAME + ADDRESS as the destination rather
 * than raw coordinates: Google then resolves it to the actual business listing,
 * so the destination card is its Business Profile (hours, photos, reviews)
 * instead of an anonymous dropped pin. Coordinates are only a fallback for
 * places with no usable text.
 *
 * The Maps URLs API is the officially supported form and deep-links straight
 * into the Google Maps app on both Android and iOS.
 */
export const directionsUrl = (place) => {
  if (!place) return null;

  // `adress` is a legacy misspelling still present on some objects
  const address = place.address || place.adress || '';
  const query = [place.name, address].filter(Boolean).join(', ').trim();

  if (query) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
  }

  const lat = place.latitude ?? place.location_lat;
  const lng = place.longitude ?? place.location_lng;
  if (lat && lng) {
    return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
  }

  return null;
};
