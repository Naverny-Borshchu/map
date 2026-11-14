import { useJsApiLoader } from '@react-google-maps/api';

/**
 * The one way this app loads the Google Maps JavaScript API.
 *
 * The loader refuses a second call with different options ("Loader must not
 * be called again with different options"), so every screen that needs
 * google.maps (the map, the address check, the Google Places search in the
 * bowl, the tip and the table) asks through here with the very same options.
 * The places library is part of it: the venue search uses
 * google.maps.places, with the same referrer-bound key as the map.
 */
export const MAPS_LIBRARIES = ['places'];

export const MAPS_LOADER_OPTIONS = {
  id: 'google-map-script',
  googleMapsApiKey: process.env.REACT_APP_API_KEY_MAP,
  libraries: MAPS_LIBRARIES,
};

/** { isLoaded, loadError } of the shared Maps script. */
export const useGoogleMaps = () => useJsApiLoader(MAPS_LOADER_OPTIONS);
