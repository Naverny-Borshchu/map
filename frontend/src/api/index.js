import { tokenStorage } from "../services/tokenStorage";
import { AUTH_SESSION_EXPIRED_EVENT, clearAuthSession } from '../services/authSession';
import { hasRating } from "../utils/rating";
import { normalizeId } from "../utils/ids";
import { track } from "../analytics";

const API_BASE_URL = process.env.REACT_APP_API_URL || 'https://api.navernyborshchu.com/api';


/** Thrown before a write leaves the device when nobody is signed in. */
export const AUTH_REQUIRED_ERROR = 'AUTH_REQUIRED';

const getAccessToken = () => tokenStorage.getAccess();

// Delegates to the one place that knows what a session is made of. This used
// to clear its own list (auth, user, userProfile) while authSession cleared a
// longer one (plus accessToken and mode), so which keys survived an expiry
// depended on which code path noticed it first.
const clearExpiredSession = () => {
  clearAuthSession();
  window.dispatchEvent(new Event(AUTH_SESSION_EXPIRED_EVENT));
};

let refreshPromise = null;

// Contract: TokenRefreshView accepts { refresh } and returns { access,
// refresh? }. SimpleJWT includes the second field when rotation is enabled.
const refreshAccessToken = async () => {
  const refresh = tokenStorage.getRefresh();
  if (!refresh) throw new Error(AUTH_REQUIRED_ERROR);

  if (!refreshPromise) {
    refreshPromise = (async () => {
      const response = await fetch(`${API_BASE_URL}/auth/token/refresh/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh }),
      });
      const data = await handleResponse(response);
      if (!data?.access) throw new Error(AUTH_REQUIRED_ERROR);
      tokenStorage.setTokens(data.access, data.refresh || refresh);
      return data.access;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
};

const fetchWithAuthRetry = async (makeRequest, authRequired) => {
  if (authRequired && !getAccessToken()) {
    try {
      await refreshAccessToken();
    } catch (error) {
      clearExpiredSession();
      throw new Error(AUTH_REQUIRED_ERROR);
    }
  }

  let response = await makeRequest();
  if (!authRequired || response.status !== 401) return response;

  try {
    await refreshAccessToken();
  } catch (error) {
    clearExpiredSession();
    throw new Error(AUTH_REQUIRED_ERROR);
  }
  response = await makeRequest();
  return response;
};

const getHeaders = (authRequired = false, hasBody = false) => {
  const headers = {};
  if (hasBody) {
    headers['Content-Type'] = 'application/json';
  }
  if (authRequired) {
    const token = getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }
  return headers;
};

/** DRF's {"field": ["message"]} → "field: message", so the screen can say it. */
const describeError = (body, status) => {
  if (!body || typeof body !== 'object') return `HTTP error! status: ${status}`;
  if (body.detail) return body.detail;
  if (body.message) return body.message;

  const fields = Object.entries(body)
    .map(([field, messages]) => {
      const text = Array.isArray(messages) ? messages.join(' ') : String(messages);
      return field === 'non_field_errors' ? text : `${field}: ${text}`;
    })
    .filter(Boolean);

  return fields.length ? fields.slice(0, 3).join('; ') : `HTTP error! status: ${status}`;
};

const handleResponse = async (response) => {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(describeError(error, response.status));
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
};

const request = async (endpoint, options = {}) => {
  const {
    method = 'GET',
    body,
    authRequired = false,
    isFormData = false,
    query = {},
  } = options;

  const params = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      params.set(key, String(value));
    }
  });

  const queryString = params.toString();
  const url = `${API_BASE_URL}${endpoint}${queryString ? `?${queryString}` : ''}`;
  const hasBody = body !== undefined && body !== null && !isFormData;

  // Refresh-only sessions are valid: fetchWithAuthRetry obtains a new access
  // token before the write. A true guest has neither token and is rejected
  // locally, before any anonymous mutation reaches the API.
  if (authRequired && method !== 'GET' && !getAccessToken() && !tokenStorage.getRefresh()) {
    throw new Error(AUTH_REQUIRED_ERROR);
  }

  const response = await fetchWithAuthRetry(() => fetch(url, {
    method,
    headers: isFormData ? getHeaders(authRequired, false) : getHeaders(authRequired, hasBody),
    body: body === undefined || body === null ? undefined : (isFormData ? body : JSON.stringify(body)),
  }), authRequired);

  return handleResponse(response);
};

// Largest page the backend allows (CustomPageNumberPagination.max_page_size).
// Requesting the max collapses the number of round-trips when walking every
// page, which keeps a full-dataset load well under the API rate limit.
const MAX_PAGE_SIZE = 100;

// Fetch all pages from a paginated endpoint
const fetchAllPages = async (endpoint, options = {}) => {

  let allResults = [];
  let nextUrl = `${API_BASE_URL}${endpoint}`;
  const { authRequired = false, query = {} } = options;

  const firstParams = new URLSearchParams();
  Object.entries(query).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      firstParams.set(key, String(value));
    }
  });
  // Ask for the biggest allowed page so a full listing takes as few
  // requests as possible (e.g. 99 places in 1 request instead of 5).
  if (!firstParams.has('page_size')) {
    firstParams.set('page_size', String(MAX_PAGE_SIZE));
  }
  if (firstParams.toString()) {
    nextUrl = `${nextUrl}?${firstParams.toString()}`;
  }

  while (nextUrl) {
    const currentUrl = nextUrl;
    const response = await fetchWithAuthRetry(
      () => fetch(currentUrl, { headers: getHeaders(authRequired, false) }),
      authRequired,
    );
    const data = await handleResponse(response);
    if (Array.isArray(data)) {
      return data;
    }
    allResults = allResults.concat(data.results || []);
    nextUrl = data.next;
  }

  return allResults;
};

// Map API place to frontend format
const mapPlace = (apiPlace) => ({
  id: normalizeId(apiPlace.id),
  name: apiPlace.name,
  adress: apiPlace.address || '',
  location: {
    lat: parseFloat(apiPlace.latitude),
    lng: parseFloat(apiPlace.longitude),
  },
  country: apiPlace.country || '',
  city: apiPlace.city || '',
  // API now returns numeric `type` ids and a human `type_label`;
  // filters use labels from typePlaces.json, so keep the comparable label here.
  type: apiPlace.type_label || apiPlace.type || '',
});

// Map API borsch to frontend format
const mapBorsch = (apiBorsch) => {
  const ratings = apiBorsch.ratings || [];
  const hasServerAggregate = Number(apiBorsch.rating_count) > 0;
  let rating_salt = hasServerAggregate ? String(apiBorsch.rating_salt ?? '') : '';
  let rating_meat = hasServerAggregate ? String(apiBorsch.rating_meat ?? '') : '';
  let rating_beet = hasServerAggregate ? String(apiBorsch.rating_beet ?? '') : '';
  let rating_density = hasServerAggregate ? String(apiBorsch.rating_density ?? '') : '';
  let rating_aftertaste = hasServerAggregate ? String(apiBorsch.rating_aftertaste ?? '') : '';
  let rating_serving = hasServerAggregate ? String(apiBorsch.rating_serving ?? '') : '';
  let overall_rating = hasServerAggregate ? String(apiBorsch.overall_rating ?? '') : '';

  // The serializer's aggregate fields are the public source of truth. Nested
  // reviews may be partial, filtered, or stale, so only use them as a legacy
  // fallback when the server has not returned an aggregate.
  if (!hasServerAggregate && ratings.length > 0) {
    const totals = ratings.reduce((acc, r) => ({
      salt: acc.salt + (parseFloat(r.rating_salt) || 0),
      meat: acc.meat + (parseFloat(r.rating_meat) || 0),
      beet: acc.beet + (parseFloat(r.rating_beet) || 0),
      density: acc.density + (parseFloat(r.rating_density) || 0),
      aftertaste: acc.aftertaste + (parseFloat(r.rating_aftertaste) || 0),
      serving: acc.serving + (parseFloat(r.rating_serving) || 0),
      overall: acc.overall + (parseFloat(r.overall_rating) || 0),
      count: acc.count + 1,
    }), { salt: 0, meat: 0, beet: 0, density: 0, aftertaste: 0, serving: 0, overall: 0, count: 0 });

    const n = totals.count;
    rating_salt = (totals.salt / n).toFixed(1);
    rating_meat = (totals.meat / n).toFixed(1);
    rating_beet = (totals.beet / n).toFixed(1);
    rating_density = (totals.density / n).toFixed(1);
    rating_aftertaste = (totals.aftertaste / n).toFixed(1);
    rating_serving = (totals.serving / n).toFixed(1);
    overall_rating = (totals.overall / n).toFixed(1);
  }

  // Fallback: compute overall from rating_sum/rating_count if no ratings array
  if (!hasRating(overall_rating) && apiBorsch.rating_sum && apiBorsch.rating_count) {
    overall_rating = (apiBorsch.rating_sum / apiBorsch.rating_count).toFixed(1);
  }

  // Fallback: if no ratings array but has rating_sum/count, compute individual ratings
  if (ratings.length === 0 && apiBorsch.rating_count > 0) {
    const avg = apiBorsch.rating_sum / apiBorsch.rating_count;
    rating_salt = avg.toFixed(1);
    rating_meat = avg.toFixed(1);
    rating_beet = avg.toFixed(1);
    rating_density = avg.toFixed(1);
    rating_aftertaste = avg.toFixed(1);
    rating_serving = avg.toFixed(1);
    overall_rating = avg.toFixed(1);
  }

  // If still empty, use "—" for display (not 0)
  if (!rating_salt) rating_salt = '—';
  if (!rating_meat) rating_meat = '—';
  if (!rating_beet) rating_beet = '—';
  if (!rating_density) rating_density = '—';
  if (!rating_aftertaste) rating_aftertaste = '—';
  if (!rating_serving) rating_serving = '—';
  if (!hasRating(overall_rating)) overall_rating = '—';

  return {
    id_borsch: normalizeId(apiBorsch.id),
    name: apiBorsch.name || '',
    place_id: normalizeId(apiBorsch.place),
    place_name: apiBorsch.place_name || '',
    place_city: apiBorsch.place_city || '',
    type_meat: apiBorsch.type_meat || '',
    rating_salt,
    rating_meat,
    rating_beet,
    rating_density,
    rating_aftertaste,
    rating_serving,
    overall_rating,
    // "290.00" -> "≈290 ₴"; цена 0/пусто в базе = не показываем
    price: parseFloat(apiBorsch.price) > 0 ? `≈${parseFloat(apiBorsch.price)} ₴` : '',
    weight: apiBorsch.grams ? `${apiBorsch.grams} g.` : '',
    photo_urls: apiBorsch.photo_urls || [],
    extras: apiBorsch.extras || '',
    dish_features: apiBorsch.dish_features || '',
    date: apiBorsch.date || '',
    rating_count: apiBorsch.rating_count || 0,
    rating_sum: apiBorsch.rating_sum || 0,
    // «Розвідка борщу»: null = старий бекенд без цих полів (механіка вимкнена),
    // 0 = спільнота ще не куштувала, >0 = досліджений борщ
    community_review_count: apiBorsch.community_review_count ?? null,
    discovered_by: apiBorsch.discovered_by ?? null,
    discovered_at: apiBorsch.discovered_at || '',
  };
};

const mapMeatTypeToApi = (value) => {
  const map = {
    "Без м'яса": 'no_meat',
    "Курка": 'chicken',
    "Свинина": 'pork',
    "Яловичина": 'beef',
    "Інше": 'other',
    "no_meat": 'no_meat',
    "chicken": 'chicken',
    "pork": 'pork',
    "beef": 'beef',
    "other": 'other',
  };
  return map[value] || 'other';
};

/**
 * Імʼя автора відгуку для показу.
 *
 * У частини користувачів `username` на бекенді дорівнює пошті (реєстрація через
 * email або Google), і сторінка борщу друкувала її повністю — публічно, кожному
 * відвідувачу. Корінь чиниться в серіалізаторі, тут лишається другий запобіжник:
 * клієнт не має покладатись на те, що жоден інстанс API не віддасть пошту.
 */
export const displayAuthorName = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const at = raw.indexOf('@');
  return at > 0 ? raw.slice(0, at) : raw;
};

const mapReview = (apiReview) => ({
  id: normalizeId(apiReview.id),
  id_borsch: normalizeId(apiReview.borsch ?? apiReview.borschi),
  user_id: apiReview.user ? normalizeId(apiReview.user) : (apiReview.temp_user_id || ''),
  author_username: displayAuthorName(apiReview.author_username),
  messege: apiReview.message || apiReview.comment || '',
  rating_salt: String(apiReview.rating_salt ?? ''),
  rating_meat: String(apiReview.rating_meat ?? ''),
  rating_beet: String(apiReview.rating_beet ?? ''),
  rating_density: String(apiReview.rating_density ?? ''),
  rating_aftertaste: String(apiReview.rating_aftertaste ?? ''),
  rating_serving: String(apiReview.rating_serving ?? ''),
  overall_rating: String(apiReview.overall_rating ?? ''),
  created_at: apiReview.created_at || '',
});

// API for places
/**
 * Coordinates as the backend can store them: DecimalField(9, 6).
 * Google hands out fourteen decimal places, which is 400 Bad Request here and
 * about a nanometre of precision in reality.
 */
export const toStoredCoord = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Number(n.toFixed(6));
};

export const placesAPI = { 
  getAllCities:async () => {   
    const res = await fetch(
      `${API_BASE_URL}/places/cities/`                
    );
    
    const data = await res.json();
    // endpoint returns a plain array of {city, lat, lng};
    // tolerate the old {cities: [...]} wrapper just in case
    return Array.isArray(data) ? data : data.cities || [];
  },
  
  getAll: async (city) => {
    // Follow pagination: filtering happens client-side, so we need
    // every place of the city, not just the first 20 results.
    return fetchAllPages('/places/', { query: { city } });
  },
  getByIds: async (ids) => {
    return fetchAllPages('/places/', { query: { ids } });
  },
  getById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/places/${id}/`, { headers: getHeaders() });
    const data = await handleResponse(response);
    return mapPlace(data);
  },
  getByType: async (type) => {   
    const res = await fetch(      
      `${API_BASE_URL}/places/?type=${encodeURIComponent(type)}`           
  );
    
    const data = await res.json();
    return Array.isArray(data) ? data : data.results || [];    
   
  },
  // Пошук закладів по назві/адресі (повертає "сирі" API-обʼєкти з id)
  search: async (query) => {
    return fetchAllPages('/places/', { query: { search: query } });
  },
  create: async (placeData) => {
    // Контракт бекенду (PlaceCreateSerializer): location_lat/location_lng, country обовʼязкові;
    // type — FK на PlaceType (передаємо тільки якщо є валідний id)
    const payload = {
      name: placeData.name || '',
      address: placeData.adress || placeData.address || '',
      city: placeData.city || '',
      country: placeData.country || 'Україна',
      location_lat: toStoredCoord(placeData.location?.lat ?? placeData.latitude ?? 0),
      location_lng: toStoredCoord(placeData.location?.lng ?? placeData.longitude ?? 0),
      ...(placeData.type_id && { type: placeData.type_id }),
    };
    const created = await request('/places/', { method: 'POST', body: payload, authRequired: true });
    // Події пишемо після відповіді бекенду, а не по кліку: інакше в даних
    // з'являються «додавання», яких насправді не сталось.
    track('place_added', { place_id: created?.id, city: payload.city });
    return mapPlace(created);
  },

  update: async (id, updates) => {
    const payload = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.adress !== undefined && { address: updates.adress }),
      ...(updates.address !== undefined && { address: updates.address }),
      ...(updates.city !== undefined && { city: updates.city }),
      ...(updates.country !== undefined && { country: updates.country }),
      ...(updates.type_id !== undefined && { type: updates.type_id }),
      ...(updates.location?.lat !== undefined && { location_lat: toStoredCoord(updates.location.lat) }),
      ...(updates.location?.lng !== undefined && { location_lng: toStoredCoord(updates.location.lng) }),
      ...(updates.latitude !== undefined && { location_lat: toStoredCoord(updates.latitude) }),
      ...(updates.longitude !== undefined && { location_lng: toStoredCoord(updates.longitude) }),
    };
    const updated = await request(`/places/${id}/`, { method: 'PATCH', body: payload, authRequired: true });
    return mapPlace(updated);
  },

  delete: async (id) => {
    await request(`/places/${id}/`, { method: 'DELETE', authRequired: true });
    return true;
  }
};

// API for borsch
export const borschAPI = {
  getAll: async () => {
    const apiBorsches = await fetchAllPages('/borsches/');
    return apiBorsches.map(mapBorsch);
  },

  getById: async (id) => {
    const response = await fetch(`${API_BASE_URL}/borsches/${id}/`, { headers: getHeaders() });
    const data = await handleResponse(response);
    return mapBorsch(data);
  },

  create: async (borschData) => {
    const payload = {
      name: borschData.name || '',
      // ids — UUID-рядки, НЕ Number()
      place: borschData.place_id || borschData.place || null,
      type_meat: mapMeatTypeToApi(borschData.type_meat || borschData.meat),
      // Контракт бекенду (BorschCreateSerializer): price_uah і weight_grams обовʼязкові (>0)
      price_uah: Number(String(borschData.price ?? borschData.price_uah ?? '').replace(/[^\d.]/g, '')),
      weight_grams: Number(String(borschData.weight ?? borschData.grams ?? '').replace(/[^\d.]/g, '')),
    };
    const created = await request('/borsches/', { method: 'POST', body: payload, authRequired: true });
    track('borsch_added', {
      borsch_id: created?.id,
      place_id: payload.place,
      price_uah: payload.price_uah,
      weight_grams: payload.weight_grams,
      type_meat: payload.type_meat,
    });
    return mapBorsch(created);
  },

  update: async (id, updates) => {
    const payload = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.place_id !== undefined && { place: updates.place_id }),
      ...(updates.place !== undefined && { place: updates.place }),
      ...(updates.type_meat !== undefined && { type_meat: mapMeatTypeToApi(updates.type_meat) }),
      ...(updates.meat !== undefined && { type_meat: mapMeatTypeToApi(updates.meat) }),
      ...(updates.price !== undefined && {
        price_uah: Number(String(updates.price).replace(/[^\d.]/g, '')),
      }),
      ...(updates.weight !== undefined && {
        weight_grams: Number(String(updates.weight).replace(/[^\d.]/g, '')),
      }),
      ...(updates.grams !== undefined && { weight_grams: updates.grams }),
    };
    const updated = await request(`/borsches/${id}/`, { method: 'PATCH', body: payload, authRequired: true });
    return mapBorsch(updated);
  },

  delete: async (id) => {
    await request(`/borsches/${id}/`, { method: 'DELETE', authRequired: true });
    return true;
  },

  getByPlaceId: async (placeId) => {
    const filtered = await fetchAllPages('/borsches/', { query: { place_id: placeId } });
    return filtered.map(mapBorsch);
  },

  uploadPhoto: async (borschId, file) => {
    const formData = new FormData();
    formData.append('photo', file);
    const uploaded = await request(`/borsches/${borschId}/upload_photo/`, {
      method: 'POST',
      body: formData,
      isFormData: true,
      authRequired: true,
    });
    track('borsch_photo_uploaded', { borsch_id: borschId });
    return uploaded;
  }
};

// API for users (auth flow handled by separate task)
export const userAPI = {
  login: async (credentials) => {
    console.log('API: Login (localStorage only)', credentials);
    return {
      id: Date.now().toString(),
      email: credentials.email,
      name: credentials.name || 'Пользователь'
    };
  },

  register: async (userData) => {
    console.log('API: Register (localStorage only)', userData);
    return {
      id: Date.now().toString(),
      ...userData
    };
  },

  logout: async () => {
    console.log('API: Logout (localStorage only)');
    return true;
  },

  updateProfile: async (updates) => {
    console.log('API: Update profile (localStorage only)', updates);
    return updates;
  },

  changePassword: async (passwordData) => {
    console.log('API: Change password (not implemented)');
    return true;
  }
};

// API for reviews/comments
// Реальні ендпоінти: GET/POST /api/reviews/, фільтр ?borsch_id=<uuid>
export const commentsAPI = {
  getAll: async () => {
    const reviews = await fetchAllPages('/reviews/');
    return reviews.map(mapReview);
  },
  // The reviews screen used to list whatever borsch ids sat in a localStorage
  // `ratedBorsch` array, so your own ratings differed between phone and laptop
  // and vanished if the browser was cleared. The API scopes to the caller with
  // ?mine=true (see ReviewViewSet.get_queryset), so ask it instead.
  getMine: async () => {
    const reviews = await fetchAllPages('/reviews/', {
      query: { mine: 'true' },
      authRequired: true,
    });
    return reviews.map(mapReview);
  },

  getByBorschId: async (borschId) => {
    if (!borschId) return [];
    const reviews = await fetchAllPages('/reviews/', { query: { borsch_id: borschId } });
    return reviews.map(mapReview);
  },

  createByBorschId: async (borschId, reviewData) => {
    const payload = {
      borsch: borschId,
      rating_salt: Number(reviewData.rating_salt),
      rating_meat: Number(reviewData.rating_meat),
      rating_beet: Number(reviewData.rating_beet),
      rating_density: Number(reviewData.rating_density),
      rating_aftertaste: Number(reviewData.rating_aftertaste),
      rating_serving: Number(reviewData.rating_serving),
      overall_rating: Number(reviewData.overall_rating),
      message: reviewData.message || reviewData.comment || reviewData.messege || '',
    };
    const created = await request('/reviews/', {
      method: 'POST',
      body: payload,
      authRequired: true,
    });
    track('review_submitted', {
      borsch_id: borschId,
      overall_rating: payload.overall_rating,
      has_message: Boolean(payload.message),
    });
    return mapReview(created);
  },

  update: async (reviewId, updates) => {
    const payload = {
      ...(updates.message !== undefined && { message: updates.message }),
      ...(updates.comment !== undefined && { message: updates.comment }),
      ...(updates.messege !== undefined && { message: updates.messege }),
      ...(updates.rating_salt !== undefined && { rating_salt: Number(updates.rating_salt) }),
      ...(updates.rating_meat !== undefined && { rating_meat: Number(updates.rating_meat) }),
      ...(updates.rating_beet !== undefined && { rating_beet: Number(updates.rating_beet) }),
      ...(updates.rating_density !== undefined && { rating_density: Number(updates.rating_density) }),
      ...(updates.rating_aftertaste !== undefined && { rating_aftertaste: Number(updates.rating_aftertaste) }),
      ...(updates.rating_serving !== undefined && { rating_serving: Number(updates.rating_serving) }),
      ...(updates.overall_rating !== undefined && { overall_rating: Number(updates.overall_rating) }),
    };
    const updated = await request(`/reviews/${reviewId}/`, {
      method: 'PATCH',
      body: payload,
      authRequired: true,
    });
    return mapReview(updated);
  },

  delete: async (reviewId) => {
    await request(`/reviews/${reviewId}/`, { method: 'DELETE', authRequired: true });
    return true;
  },
};

export const favoritesAPI = {
  getAll: async () => fetchAllPages('/favorites/', { authRequired: true }),
  create: async (borschId) => request('/favorites/', { method: 'POST', body: { borsch: borschId }, authRequired: true }),
  delete: async (favoriteId) => request(`/favorites/${favoriteId}/`, { method: 'DELETE', authRequired: true }),
  // Перемикнути лайк на бекенді; повертає true якщо лайк став активним
  toggleByBorschId: async (borschId) => {
    const favorites = await fetchAllPages('/favorites/', { authRequired: true });
    const existing = favorites.find((f) => String(f.borsch) === String(borschId));
    if (existing) {
      await request(`/favorites/${existing.id}/`, { method: 'DELETE', authRequired: true });
      track('favorite_toggled', { borsch_id: borschId, active: false });
      return false;
    }
    await request('/favorites/', { method: 'POST', body: { borsch: borschId }, authRequired: true });
    track('favorite_toggled', { borsch_id: borschId, active: true });
    return true;
  },
};

export const placeTypesAPI = {
  getAll: async () => fetchAllPages('/place-types/'),
};

export const usersAPI = {
  getAll: async () => fetchAllPages('/users/'),
  getById: async (id) => request(`/users/${id}/`),
};

export const api = {
  places: placesAPI,
  borsch: borschAPI,
  user: userAPI,
  comments: commentsAPI,
  favorites: favoritesAPI,
  placeTypes: placeTypesAPI,
  users: usersAPI,
};

export default api;
