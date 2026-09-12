import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef
} from 'react';

import { placesAPI } from '../api';
import { useFilters } from './FiltersContext';
import { placesWithMatches } from '../utils/filtering';
// Fallback until /places/cities/ loads; same shape as the API: {city, lat, lng}
const citiesData = [
  { city: 'Київ', lat: 50.450001, lng: 30.523333 },
  { city: 'Одеса', lat: 46.482526, lng: 30.723309 },
  { city: 'Львів', lat: 49.839684, lng: 24.029716 },
  { city: 'Харків', lat: 49.9935, lng: 36.230383 },
  { city: 'Дніпро', lat: 48.464717, lng: 35.046183 },
];

const PlacesContext = createContext();

export const PlacesProvider = ({ children }) => {
  const { updateCenter } = useFilters();
  const [cities, setCities] = useState(citiesData);
  const [loading, setLoading] = useState(true);
  const [allPlaces, setAllPlaces] = useState([]);
  const [places, setPlaces] = useState([]);
  const [rating, setRating] = useState(false);
  const [selectedPlaceId, setSelectedPlaceId] = useState(null);
  const allPlacesRef = useRef([]);
  // Guards against race conditions: when the city changes mid-flight
  // (e.g. geolocation switches the city while the default "Київ" request
  // is still paginating), the slower stale response must NOT overwrite
  // the newer city's places.
  const loadRequestIdRef = useRef(0);

  // Load EVERY place once, not one city at a time. The map then shows borsches
  // everywhere, so you can pan from Kyiv to Lviv and keep seeing them, and
  // picking a city just recentres the map instead of swapping the dataset.
  // (Fine at today's scale; see the note below on when this must become
  // viewport-based loading.)
  const loadPlaces = useCallback(async () => {
    const requestId = ++loadRequestIdRef.current;

    try {
      setLoading(true);

      const data = await placesAPI.getAll();

      // A newer request started while this one was in flight — drop it
      if (requestId !== loadRequestIdRef.current) return;

      allPlacesRef.current = data;

      setAllPlaces(data);
      setPlaces(data);

    } catch (error) {
      console.error('Ошибка загрузки мест:', error);
    } finally {
      if (requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadListPlaces = useCallback(async () => {
    try {
      const data = await placesAPI.getAllCities();      
      setCities(data)      
    } catch (error) {
      console.error('Ошибка загрузки мест:', error);
    } 
  }, []);

  useEffect(() => {
    loadPlaces();
  }, [loadPlaces]);

    useEffect(() => {
      loadListPlaces();
    }, [loadListPlaces]);

  // Filtering lives in utils/filtering.js, so the map, the list and the live
  // count in the filter sheet all run the SAME matcher.
  const applyFilters = useCallback(
    ({ filters, borsch }) => {
      if (!Array.isArray(allPlaces) || !Array.isArray(borsch)) return;
      setPlaces(placesWithMatches(allPlaces, borsch, filters));
    },
    [allPlaces]
  );

  // Look in the FULL set, not the filtered one: pages that open a specific
  // borsch (its detail and rating screens) need its place regardless of the
  // active city/filters. Searching `places` left those screens stuck on
  // "Завантаження даних..." whenever the place was filtered out.
  const getPlaceById = (id) => {
    const match = (place) => String(place.id) === String(id);
    return allPlacesRef.current.find(match) || places.find(match);
  };

  const updatePlacesBySearch = useCallback((search) => {
      const source = allPlacesRef.current;

      if (!search?.trim()) {
        setPlaces(source);
        return;
      }

      const query = search.toLowerCase().trim();

      const filtered = source.filter((place) =>
        place.name?.toLowerCase().includes(query)
      );

      setPlaces(filtered);
    }, []);

  const addPlace = useCallback((newPlace) => {
    // const placeWithId = {
    //   ...newPlace,
    //   id: Date.now().toString(),
    //   created_at: new Date().toISOString(),
    // };

    // const updated = [
    //   ...allPlacesRef.current,
    //   placeWithId
    // ];

    // allPlacesRef.current = updated;
    // setPlaces(updated); 

    // return placeWithId;
  }, []);

  const getRating=()=>{
    setRating(prev => !prev);
  }

  // Select a place: highlight it on the map and pan/zoom to its coordinates.
  // Toggling the same id off clears the highlight.
  const selectPlace = useCallback((id) => {
    setSelectedPlaceId((prev) => (prev === id ? null : id));

    if (id !== null && id !== undefined) {
      const found = allPlacesRef.current.find(
        (p) => String(p.id) === String(id)
      );
      if (found && found.latitude && found.longitude) {
        updateCenter({
          lat: Number(found.latitude),
          lng: Number(found.longitude),
        });
      }
    }
  }, [updateCenter]);

  const value = {
    places,
    rating,
    cities,
    allPlaces,
    loading,
    selectedPlaceId,
    getRating,
    loadPlaces,
    applyFilters,
    addPlace,
    updatePlacesBySearch,
    getPlaceById,
    selectPlace,
    setSelectedPlaceId,
  };
    return (
    <PlacesContext.Provider value={value}>
      {children}
    </PlacesContext.Provider>
  );
};

export const usePlaces = () => {
  const ctx = useContext(PlacesContext);

  if (!ctx) {
    throw new Error('usePlaces must be used within PlacesProvider');
  }

  return ctx;
};
