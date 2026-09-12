// /places/cities/ returns the *average* coordinate of a city's places, which
// for Kyiv lands ~6 km west of the centre (30.436 vs Khreshchatyk's 30.523)
// because outlying districts drag the mean. Prefer a real city centre when we
// know one, and fall back to the API's average otherwise.
const KNOWN_CENTERS = {
  'київ': { lat: 50.450001, lng: 30.523333 },
  'одеса': { lat: 46.482526, lng: 30.723309 },
  'львів': { lat: 49.839684, lng: 24.029716 },
  'харків': { lat: 49.9935, lng: 36.230383 },
  'дніпро': { lat: 48.464717, lng: 35.046183 },
};

// zoom applied when the user explicitly focuses a city
export const CITY_FOCUS_ZOOM = 12;

export const cityCenter = (cityItem) => {
  if (!cityItem) return null;
  const known = KNOWN_CENTERS[String(cityItem.city || '').trim().toLowerCase()];
  if (known) return known;
  return { lat: Number(cityItem.lat), lng: Number(cityItem.lng) };
};
