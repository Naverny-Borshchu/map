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
export const cityFromGeocoderResults = (results) => {
  if (!Array.isArray(results)) return null;
  for (const type of CITY_COMPONENT_TYPES) {
    for (const result of results) {
      for (const component of result?.address_components || []) {
        if ((component.types || []).includes(type)) return component.long_name;
      }
    }
  }
  return null;
};

export const reverseGeocodeCity = async (lat, lng, { language = 'uk' } = {}) => {
  const maps = typeof window !== 'undefined' && window.google && window.google.maps;
  if (!maps || !maps.Geocoder) return null;

  try {
    const geocoder = new maps.Geocoder();
    const response = await geocoder.geocode({ location: { lat, lng }, language });
    return cityFromGeocoderResults(response && response.results);
  } catch (error) {
    console.error('GEOCODER ERROR:', error);
    return null;
  }
};
