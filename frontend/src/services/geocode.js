/**
 * Зворотне геокодування: координати → назва міста.
 *
 * Через бібліотеку Maps JS, а не через REST `maps/api/geocode/json`, і це не
 * стилістичний вибір. Веб-сервіси Google (Geocoding, Directions…) **не
 * приймають ключі, обмежені HTTP-реферером** — на такий ключ вони відповідають
 * `REQUEST_DENIED: API keys with referer restrictions cannot be used with this
 * API`. Ключ фронтенду запікається в публічний бандл, тож він мусить бути
 * обмежений реферером; отже REST-шлях і обмежений ключ несумісні за
 * конструкцією. Бібліотека Maps JS з таким ключем працює — вона й лишається.
 *
 * Мапа вже вантажить `google.maps` (useJsApiLoader), тож окремого завантаження
 * тут не треба. Якщо бібліотеки ще немає — повертаємо null, і викликач просто
 * лишається без назви міста, як і раніше при помилці мережі.
 */

/** Від найточнішого до найгрубішого: місто, потім район, потім область. */
export const CITY_COMPONENT_TYPES = [
  'locality',
  'postal_town',
  'administrative_area_level_2',
  'administrative_area_level_1',
];

/**
 * Перша назва міста з відповіді геокодера.
 *
 * Порядок типів важливіший за порядок результатів: Google часто віддає
 * спочатку точну адресу з `locality`, але буває й навпаки, і тоді вибір
 * «перший компонент, що підійшов» давав область замість міста.
 */
const componentOf = (results, type) => {
  for (const result of results || []) {
    for (const component of result?.address_components || []) {
      if ((component.types || []).includes(type)) return component;
    }
  }
  return null;
};

/** «UA», «JP», … from the geocoder's answer; '' when it names no country. */
export const countryCodeFromGeocoderResults = (results) =>
  String(componentOf(Array.isArray(results) ? results : [], 'country')?.short_name || '').toUpperCase();

// Tokyo's wards are the geocoder's localities; the city is the metropolis
// (the same rule as services/placesLookup cityOf).
const METROPOLIS_AS_CITY = { JP: ['Tokyo', 'Токіо', '東京都'] };

export const cityFromGeocoderResults = (results) => {
  if (!Array.isArray(results)) return null;
  const region = componentOf(results, 'administrative_area_level_1')?.long_name;
  if ((METROPOLIS_AS_CITY[countryCodeFromGeocoderResults(results)] || []).includes(region)) return region;
  for (const type of CITY_COMPONENT_TYPES) {
    for (const result of results) {
      for (const component of result?.address_components || []) {
        if ((component.types || []).includes(type)) return component.long_name;
      }
    }
  }
  return null;
};

/**
 * Назва міста українською, а за кордоном англійською: українською Google
 * називає пів світу російськими формами (Йокогама й Краків по-російському), а мапа не
 * показує російського ніколи. Тому відповідь не з України питаємо ще раз
 * англійською (так само записуються заклади за кордоном).
 */
export const reverseGeocodeCity = async (lat, lng, { language = 'uk' } = {}) => {
  const maps = typeof window !== 'undefined' && window.google && window.google.maps;
  if (!maps || !maps.Geocoder) return null;

  try {
    const geocoder = new maps.Geocoder();
    const response = await geocoder.geocode({ location: { lat, lng }, language });
    const results = response && response.results;
    const code = countryCodeFromGeocoderResults(results);
    if (language !== 'en' && code && code !== 'UA') {
      const english = await geocoder.geocode({ location: { lat, lng }, language: 'en' });
      const city = cityFromGeocoderResults(english && english.results);
      if (city) return city;
    }
    return cityFromGeocoderResults(results);
  } catch (error) {
    console.error('GEOCODER ERROR:', error);
    return null;
  }
};
