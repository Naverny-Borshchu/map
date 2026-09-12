import { createContext, 
useContext, 
useState,
useRef,
useCallback 
}from 'react';
import { EMPTY_FILTERS, PLACE_TYPES, MEAT_TYPES, countActiveFilters } from '../utils/filtering';

// Filter vocabulary lives in utils/filtering.js so the matcher and the UI
// cannot drift apart.
export const ALL_TYPES = PLACE_TYPES;
export const ALL_MEATS = MEAT_TYPES;

// Kept for the older price UI; the sheet now uses buckets.
export const PRICE_MIN = 50;
export const PRICE_MAX = 5000;

// EMPTY means "no constraint" — the old default pre-selected everything, so
// there was no way to tell a default apart from a deliberate choice.
export const DEFAULT_FILTERS = { ...EMPTY_FILTERS };

const FiltersContext = createContext();

export const FiltersProvider = ({ children }) => {
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [city, setCity] = useState('Київ');
  const[center,setCenter]=useState({lat:50.450001,lng:30.523333});
  const [filters, setFilters] = useState(DEFAULT_FILTERS);

  // A one-shot "focus the map here (and optionally zoom)" signal. The Map
  // watches it; the nonce lets the same target fire again.
  const [mapTarget, setMapTarget] = useState(null);
  const focusNonce = useRef(0);
  const focusMap = useCallback((lat, lng, zoom) => {
    setMapTarget({ lat, lng, zoom, nonce: ++focusNonce.current });
  }, []);

  const updateFilters = (patch) => {
    setFilters(prev => ({ ...prev, ...patch }));
  };

  const updateCity = (city) => {
    setCity(city);

    // 💥 ВАЖНО: сброс фильтров при смене города
    setFilters(DEFAULT_FILTERS);
  };
  
  // Обновить центр 
  const updateCenter = useCallback((newLocation) => {
    setCenter(newLocation);
  }, []);

  const resetAllFilters = () => {
    setFilters(DEFAULT_FILTERS);
    setIsSearchActive(false);
  };

    // Обновление поискового запроса
  const updateSearchQuery = (query) => {
    setFilters(prev => ({
      ...prev,
      search: query
    }));
  };
  const activateSearch = () => {
    setIsSearchActive(true);
  };
  
    // Проверка активности фильтров
    // (все типы выбраны = фильтр по типу неактивен)
  const hasActiveFilters = () => countActiveFilters(filters) > 0 || filters.search !== '';

  /** How many filters are on — drives the badge on the Фільтри button. */
  const activeFilterCount = () => countActiveFilters(filters);



  const value = {
    city,
    center,
    mapTarget,
    focusMap,
    filters,
    isSearchActive,
    updateCity,
    updateCenter,
    resetAllFilters,
    updateFilters,
    updateSearchQuery,
    activateSearch,
    hasActiveFilters,
    activeFilterCount
  };
  return (
    <FiltersContext.Provider value={value}>
      {children}
    </FiltersContext.Provider>
  );
};

export const useFilters = () => {
  const context = useContext(FiltersContext);
  if (!context) {
    throw new Error('useFilters must be used within FiltersProvider');
  }
  return context;
};

