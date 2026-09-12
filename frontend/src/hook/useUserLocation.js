import { useEffect, useState } from 'react';
import { getUserLocation, LOCATION_EVENT } from '../utils/distance';

/**
 * The visitor's position, kept up to date.
 *
 * Reading localStorage once during render was not enough: geolocation resolves
 * asynchronously, so a screen mounted before it landed never showed distances.
 */
export const useUserLocation = () => {
  const [loc, setLoc] = useState(getUserLocation);

  useEffect(() => {
    const sync = () => setLoc(getUserLocation());
    window.addEventListener(LOCATION_EVENT, sync);
    window.addEventListener('storage', sync);
    // one late check covers a position that arrived between render and mount
    const t = setTimeout(sync, 1500);
    return () => {
      window.removeEventListener(LOCATION_EVENT, sync);
      window.removeEventListener('storage', sync);
      clearTimeout(t);
    };
  }, []);

  return loc;
};
