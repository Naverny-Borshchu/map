import { useMemo, useState } from 'react';
import { useNavigate } from "react-router-dom";
import { useFilters } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { IconClose as IconDelete } from '../Icons';
import { BowlLoader } from '../EmptyState';
import { ReactComponent as IconSearch } from './search.svg';
import { ReactComponent as IconSearchGray } from './searchGray.svg';
import { cityCenter, CITY_FOCUS_ZOOM } from '../../utils/cityCenter';
import { useGoogleSuggestions } from '../../hook/useGoogleSuggestions';
import { fetchCityDetails } from '../../services/googlePlaces';
import { track } from '../../analytics';
import { CITY_LABELS } from '../../i18n/translations';
import style from './CitySelect.module.scss';
import { useT } from '../../i18n';
import { useCityLabel } from '../../i18n';

const norm = (s) => String(s || '').trim().toLocaleLowerCase('uk');

/** Every name a city of ours answers to: as stored, and its labels. */
const namesOf = (city) => [city, ...Object.values(CITY_LABELS).map((labels) => labels[city])]
  .filter(Boolean)
  .map(norm);

/** Our city the typed or Google's name means, if it is one of ours. */
export const ownCity = (cities, name) => {
  const n = norm(name);
  if (!n) return null;
  return (cities || []).find((item) => namesOf(item.city).includes(n)) || null;
};

/**
 * «Населений пункт»: our cities, and since 11.2026 any city in the world.
 * The menu used to know only the cities that already have a borshch, so a
 * person in Tokyo with location denied (Threads and Telegram deny it without
 * asking) was stuck on Kyiv. Typing now filters our cities and, under them,
 * asks Google for the rest; a city from Google moves the map there.
 */
export const CitySelect = ({onClose}) => {
  const { cities} = usePlaces();
  const {
    city,
    focusMap,
    updateCity,
    resetAllFilters,
  } = useFilters();
  const [searchValue, setSearchValue] = useState('');
  const [picking, setPicking] = useState(false);
  const [failed, setFailed] = useState(false);
  const navigate = useNavigate();
  const t = useT();
  const cityLabel = useCityLabel();

  const typed = searchValue.trim();
  // our cities whose name or label holds what was typed
  const matches = useMemo(() => {
    const n = norm(typed);
    if (!n) return [];
    return (cities || []).filter((item) => namesOf(item.city).some((name) => name.includes(n)));
  }, [cities, typed]);
  const { list, state, endSession } = useGoogleSuggestions(typed, { kind: 'city' });
  // a city of ours stays ours, even when Google offers it too
  const googleCities = list.filter((s) => !ownCity(cities, s.main));

  const goToOwn = (cityData) => {
    const c = cityCenter(cityData);
    updateCity(cityData.city);
    focusMap(c.lat, c.lng, CITY_FOCUS_ZOOM);
    navigate(`/`);
    // picking a city is a completed action — the sheet used to stay open
    if (onClose) onClose();
  };

  const handleChange = (e) => {
    const cityName = e.currentTarget.value;
    // /places/cities/ now returns a plain array of {city, lat, lng}
    const cityData = cities?.find(
      item =>
        item.city.trim().toLowerCase() ===
        cityName.trim().toLowerCase()
    );

    if (!cityData) return;
    goToOwn(cityData);
  };

  const pickGoogle = async (suggestion) => {
    if (picking) return;
    setPicking(true);
    setFailed(false);
    try {
      const found = await fetchCityDetails(suggestion);
      endSession();
      if (!found) throw new Error('no city');
      const own = ownCity(cities, found.name);
      track('city_google_picked', { own: Boolean(own), country: found.countryCode || null });
      if (own) {
        goToOwn(own);
        return;
      }
      updateCity(found.name);
      focusMap(found.location.lat, found.location.lng, CITY_FOCUS_ZOOM);
      navigate(`/`);
      if (onClose) onClose();
    } catch (e) {
      console.error('Не вдалося взяти місто з Google:', e);
      setFailed(true);
      setPicking(false);
    }
  };

  const handleSearchChange = (e) => {
    setSearchValue(e.target.value);
    setFailed(false);
  };

  // Enter: our city of that name, else the first of ours that fits, else
  // Google's first
  const handleSearch = () => {
    const exact = ownCity(cities, typed);
    if (exact) { goToOwn(exact); return; }
    if (matches.length) { goToOwn(matches[0]); return; }
    if (googleCities.length) pickGoogle(googleCities[0]);
  };

  const handleClearSearch = () => {
    resetAllFilters();
    setSearchValue('');
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const sorted = (cities || []).slice().sort((a, b) => b.borsch_count - a.borsch_count);
  const cityButton = (item) => (
    <button
      key={item.city}
      type="button"
      className={city === item.city? style.activeCityButton: style.cityButton}
      onClick={handleChange}
      value={item.city || ''}
    >
      {cityLabel(item.city)}
    </button>
  );

  return (
    <div className={style.cardFilters}>
      <button type="button" onClick={onClose} className={style.btnClose} aria-label={t('card.close')}>
        <IconDelete />
      </button>
      <h2 className={style.title}>{t('city.title')}</h2>
      <div className={style.inputWrap}>
              <button
                type="button"
                className={style.searchButton}
                onClick={handleSearch}
                aria-label={t('city.searchAria')}
              >
                <IconSearchGray className={`${style.icon} ${style.iconDefault}`} />
                <IconSearch className={`${style.icon} ${style.iconActive}`} />
              </button>
              <input
                className={style.input}
                type="text"
                id="search"
                placeholder={t('city.placeholder')}
                value={searchValue}
                onChange={handleSearchChange}
                onKeyDown={handleKeyPress}
                autoComplete="off"
                data-testid="city-search"
              />
              {searchValue && (
              <button
                type="button"
                className={style.clearButton}
                onClick={handleClearSearch}
                aria-label={t('city.clear')}
              >
                ×
              </button>
            )}
        </div>
      {typed ? (
        <div className={style.boxType}>
          {matches.length > 0 && (
            <>
              <h3 className={style.subTitle}>{t('city.ours')}</h3>
              <div className={style.cityOptions}>{matches.map(cityButton)}</div>
            </>
          )}
          {(state === 'searching' || picking) && (
            <div className={style.loaderRow} role="status">
              <BowlLoader size={32} label={t(picking ? 'city.moving' : 'gplace.searching')} />
            </div>
          )}
          {failed && <p className={style.problem} role="alert">{t('city.googleError')}</p>}
          {!picking && googleCities.length > 0 && (
            <section aria-labelledby="city-google-title">
              <h3 className={style.subTitle} id="city-google-title">{t('city.google')}</h3>
              <div className={style.googleCities}>
                {googleCities.map((s) => (
                  <button
                    key={s.placeId}
                    type="button"
                    className={style.googleCity}
                    onClick={() => pickGoogle(s)}
                    data-testid="city-google-option"
                  >
                    <span className={style.googleCityName}>{s.main}</span>
                    {s.secondary && <span className={style.googleCityWhere}>{s.secondary}</span>}
                  </button>
                ))}
              </div>
              <p className={style.attribution}>{t('gplace.attribution')}</p>
            </section>
          )}
          {!picking && state !== 'searching' && !matches.length && !googleCities.length && (
            <p className={style.nothing} role="status">{t(state === 'off' ? 'city.nothingOurs' : 'city.nothing')}</p>
          )}
        </div>
      ) : (
      <div className={style.boxType}>
        <h3 className={style.subTitle}>{t('city.popular')}</h3>
        <div className={style.cityOptions}>{sorted.slice(0, 5).map(cityButton)}</div>
        <h3 className={style.subTitle}>{t('city.all')}</h3>
        <div className={style.cityOptions}>{sorted.slice(5).map(cityButton)}</div>
      </div>
      )}
    </div>
  );
};
