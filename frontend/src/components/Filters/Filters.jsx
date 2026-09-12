import { useState, useCallback, useEffect } from 'react';
import {Link} from "react-router-dom";
import { useNavigate } from "react-router-dom";
// import { useLocation } from "react-router-dom";
import { ReactComponent as IconSearch } from './search.svg';
import { ReactComponent as IconSearchGray } from './searchGray.svg';
import { ReactComponent as IconFilterActive } from './filterActive.svg';
import { ReactComponent as IconLocation } from './location-red.svg';
import { ReactComponent as IconRating } from './Swap.svg';
import { GeoButton } from "../GeoButton/GeoButton";
import { Modal } from '../Modal/Modal';
import { CardFilters } from '../CardFilters/CardFilters';
import { useFilters, DEFAULT_FILTERS } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import {CitySelect} from "../../components/CitySelect";
import { SearchAutocomplete } from "../Autocomplete";
import {Logo} from '../Logo';
import style from "./Filters.module.scss";
import { useUser } from "../../context/UserContext";
import { useT } from "../../i18n";
import { useCityLabel } from "../../i18n";


export const Filters = ({ hideBoxFilter = false }) => {
  const [isActiveFilter, setIsActiveFilter] = useState(false);
  const[cityFilter,setIsCityFilter]=useState(false);
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('userProfile')); } catch { return null; }
  });
  // const location = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const cityLabel = useCityLabel();
  const { isAuthenticated } = useUser();
  const { applyFilters,getRating,allPlaces,setSelectedPlaceId } = usePlaces();
  const { borsch } = useBorsch(); 
  const {
    city,
    filters,
    updateSearchQuery,
    updateCenter,
    resetAllFilters,
    activateSearch,
    activeFilterCount
  } = useFilters();
  const {search}=filters;
  const [searchValue, setSearchValue] = useState(search);


  // Signed-in state comes from UserContext, which is token-aware and already
  // reacts to the session-expired event. This used to poll localStorage once a
  // second because a same-tab login does not fire `storage` — a timer running
  // for the life of the page, and a third opinion on whether anyone is signed
  // in (alongside UserContext and the API layer). The profile fields for the
  // avatar still come from `userProfile`; only the trigger changed.
  useEffect(() => {
    const readProfile = () => {
      try { setUser(JSON.parse(localStorage.getItem('userProfile'))); } catch { setUser(null); }
    };
    readProfile();
    window.addEventListener('storage', readProfile);
    return () => window.removeEventListener('storage', readProfile);
  }, [isAuthenticated]);  
  // Синхронизация с фильтрами при изменении
  useEffect(() => {
    setSearchValue(search);
  }, [search]);

  const changeIsActiveFilter = useCallback(() => {
    setIsActiveFilter((prev) => !prev);
  }, []);
   const changeIsCityFilter= useCallback(() => {
    setIsCityFilter((prev) => !prev);
  }, []);

  // Accepts an optional query string: the autocomplete submits the freshest
  // text directly, so Enter never races the searchValue state update.
  const handleSearch = (queryArg) => {
    const query = (typeof queryArg === 'string' ? queryArg : searchValue).trim();

    // обновляем filters context
    updateSearchQuery(query);

    activateSearch();

    // запускаем фильтрацию мест
    applyFilters({
      filters: {
        ...filters,
        search: query
      },
      borsch
    });

    // Find & focus, rather than filter: selecting the match makes the map pan,
    // zoom in and draw it highlighted, while every other borsch stays on the
    // map. Hiding the rest was disorienting.
    if (query) {
      const q = query.toLowerCase();
      const first = (allPlaces || []).find(
        (p) =>
          (p.name || '').toLowerCase().includes(q) ||
          (p.address || '').toLowerCase().includes(q)
      );
      if (first) {
        setSelectedPlaceId(first.id);
      }
    }
  };

  // A suggestion was picked in the dropdown: find & focus that exact place —
  // highlight it and pan the map, without narrowing the global filters.
  const handlePickSuggestion = (item) => {
    setSearchValue(item.displayLabel || item.label || '');
    const place = item.kind === 'venue'
      ? item.place
      : (allPlaces || []).find((p) => String(p.id) === String(item.borsch?.place_id));
    if (place) {
      setSelectedPlaceId(place.id);
      if (Number.isFinite(place.location?.lat) && Number.isFinite(place.location?.lng)) {
        updateCenter(place.location);
      }
    }
  };

  const handleClearSearch = () => {
    resetAllFilters();
    setSearchValue('');
    // resetAllFilters only resets filter state; re-apply so the cleared search
    // actually restores every place (otherwise the map stays narrowed).
    applyFilters({ filters: DEFAULT_FILTERS, borsch });
    // and drop the found-place highlight, or the green ring outlives the search
    setSelectedPlaceId(null);
  };

  return (
    <div className={`${style.filterWrap} nb-topbar`}>
      <div className={`${style.box} nb-topbar-box`}>
        <div className={style.desctop}><Logo/></div>
        <div className={`${style.flex} nb-searchrow`}>
            <div className={`${style.inputWrap} nb-searchwrap`}>
              <button
                type="button"
                className={style.searchButton}
                onClick={handleSearch}
                aria-label="search"
              >
                <IconSearchGray className={`${style.icon} ${style.iconDefault}`} />
                <IconSearch className={`${style.icon} ${style.iconActive}`} />
              </button>
              <SearchAutocomplete
                className={`${style.input} nb-search`}
                id="search"
                placeholder={t('map.searchPlaceholder')}
                value={searchValue}
                onChange={setSearchValue}
                onSubmit={handleSearch}
                onPick={handlePickSuggestion}
              />
            {searchValue && (
              <button
                type="button"
                className={style.clearButton}
                onClick={handleClearSearch}
                aria-label={t('map.clearSearch')}
              >
                ×
              </button>
            )}
            </div>  
            <GeoButton />
            <button
              type="button"
              className={`${style.btnFilterCity} nb-citybtn`}
              onClick={changeIsCityFilter}
              id="filterCity"          
            >
              <IconLocation />              
              <span className={style.btnFilterCityText}>{cityLabel(city)}</span>          
            </button>                               
        </div>
      </div>       
      <div className={style.desctop}>
          {user ? (
            <button
              className={style.userBtn}
              onClick={() => navigate('/profile')}
              title={user.email}
            >
              <img
                src={user.picture || '/avatar.png'}
                alt={user.name}
                className={style.userAvatar}
                onError={(e) => { e.target.src = '/avatar.png'; }}
              />
              <span className={style.userName}>{user.given_name || user.name}</span>
            </button>
          ) : (
            <Link to="/register" className={style.btnReg}>{t('map.register')}</Link>
          )}
      </div>
      {/* {location.pathname === "/" &&   */}
      {!hideBoxFilter && (
        <div className={`${style.boxFilter} nb-filterbtns`}>
          <button
            type="button"
            className={style.btnFilter}
            onClick={changeIsActiveFilter}
            id="filter"
            aria-label={t('map.filters')}
          >
            <span className={style.btnFilterText}>{t('map.filters')}</span>
            <IconFilterActive  />
            {activeFilterCount() > 0 && (
              <span className={style.filterBadge}>{activeFilterCount()}</span>
            )}
            {/* {hasActiveFilters() && <span className={style.activeIndicator}></span>} */}
          </button>
          <button 
            type="button"
            className={style.btnRating}
            onClick={getRating}
          >
            <span className={style.btnRatingText}>{t('map.byRating')}</span>
            <IconRating />
          </button>
        </div>
      )}
      {/* }          */}
      {isActiveFilter && (
        <Modal onClose={changeIsActiveFilter} version={"filters"}>
          <CardFilters onClose={changeIsActiveFilter} />
        </Modal>
      )}   
      {cityFilter && (
        <Modal onClose={changeIsCityFilter} version={"filters"}>
          <CitySelect  onClose={changeIsCityFilter}/>
        </Modal>
      )}     
    </div>
  );
};
