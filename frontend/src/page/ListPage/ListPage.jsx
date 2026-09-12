import { useState } from "react";
import { SORTS } from '../../utils/filterUrl';
import { useSearchParams } from "react-router-dom";
import { ReactComponent as IconLocation } from "../../components/Filters/location-red.svg";
import { BorschListItem } from "../../components/BorschListItem/BorschListItem";
import { Modal } from "../../components/Modal/Modal";
import { CitySelect } from "../../components/CitySelect";
import { usePlaces } from "../../context/PlacesContext";
import { useBorsch } from "../../context/BorschContext";
import { useFilters } from "../../context/FiltersContext";
import { filterBorsches } from "../../utils/filtering";
import { distanceMeters } from "../../utils/distance";
import { sortBorsches } from "../../utils/borschSorting";
import { useUserLocation } from "../../hook/useUserLocation";
import style from "./ListPage.module.scss";
import { useT } from "../../i18n";
import { useCityLabel } from "../../i18n";

export const ListPage = () => {
  const { places, allPlaces } = usePlaces();
  const { borsch } = useBorsch();
  const { filters, city, updateSearchQuery } = useFilters();

  const t = useT();
  const cityLabel = useCityLabel();
  const [cityOpen, setCityOpen] = useState(false);
  // "best" by default: the job is finding a GOOD borsch, and the list used to
  // open in alphabetical order, which answers nobody's question.
  // Sort lives in the URL so a shared list link keeps its ordering.
  const [searchParams, setSearchParams] = useSearchParams();
  const sort = SORTS.includes(searchParams.get('sort')) ? searchParams.get('sort') : 'best';
  const setSort = (next) => {
    const p = new URLSearchParams(searchParams);
    if (next === 'best') p.delete('sort'); else p.set('sort', next);
    setSearchParams(p, { replace: true });
  };
  const userLoc = useUserLocation();
  const [q, setQ] = useState(filters.search || "");

  const runSearch = (value) => {
    setQ(value);
    updateSearchQuery(value.trim());
  };

  // The list is bound to the chosen city; the MAP is deliberately not.
  //
  // PlacesContext loads every place on purpose, so you can pan from Kyiv to
  // Lviv and keep seeing pins. The list is a different promise: with Київ
  // selected it was showing Odesa borsches at the top — usually ones this
  // account had rated or added, because those arrive in the global borsch
  // collection (Yuliia, 2026-08-18). Scope it here rather than in the context,
  // which would take the map's pins with it.
  const selectedCity = String(city || "").trim().toLocaleLowerCase("uk-UA");
  const inSelectedCity = (p) =>
    !selectedCity ||
    String(p.city || "").trim().toLocaleLowerCase("uk-UA") === selectedCity;

  // Filter locally (never mutate the shared places — that hid the map's pins).
  const query = (filters.search || "").trim().toLowerCase();
  const cityPlaces = places.filter(inSelectedCity);
  const visiblePlaces = query
    ? cityPlaces.filter(
        (p) =>
          (p.name || "").toLowerCase().includes(query) ||
          (p.address || "").toLowerCase().includes(query)
      )
    : cityPlaces;

  const placeIds = new Set(visiblePlaces.map((p) => String(p.id)));
  const byId = new Map((allPlaces || []).map((p) => [String(p.id), p]));

  // Run the SAME matcher the filter sheet counts with. Filtering only by the
  // visible PLACES would show every borsch of a matching venue, so the sheet's
  // "show 37 borsches" would not be what the list actually lists.
  const rows = filterBorsches(
    (borsch || []).filter((b) => placeIds.has(String(b.place_id))),
    (id) => byId.get(String(id)),
    filters
  );

  const distOf = (b) => {
    if (!userLoc) return null;
    const pl = byId.get(String(b.place_id));
    if (!pl?.latitude || !pl?.longitude) return null;
    return distanceMeters(userLoc, { lat: Number(pl.latitude), lng: Number(pl.longitude) });
  };

  const sorted = sortBorsches(rows, sort, distOf);

  return (
    <div className={style.page}>
      <header className={style.header}>
        <div className={style.searchRow}>
          <label className={style.searchWrap}>
            <span className={style.searchIcon} aria-hidden="true">🔍</span>
            <input
              className={style.search}
              type="text"
              placeholder={t('list.searchPlaceholder')}
              value={q}
              onChange={(e) => runSearch(e.target.value)}
            />
            {q && (
              <button
                type="button"
                className={style.clear}
                onClick={() => runSearch("")}
                aria-label={t('list.clear')}
              >
                ×
              </button>
            )}
          </label>
          <button
            type="button"
            className={style.cityBtn}
            onClick={() => setCityOpen(true)}
          >
            <IconLocation />
            <span>{cityLabel(city)}</span>
          </button>
        </div>

        {/* The Мапа | Список segmented control used to sit here. It was the
            last copy of a switch that had already moved into the nav as a
            single tab (see Layout and the note in MapPage), so on desktop it
            sat one row below the sidebar's own List tab and did the same
            thing. One obvious place to switch views. */}
        <div className={style.toolbar}>
          <label className={style.sortControl}>
            <span className={style.sortLabel}>{t('sort.label')}</span>
            <select
              className={style.sortSelect}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label={t('sort.label')}
            >
              <option value="best">{t('sort.best')}</option>
              <option value="near">{t('sort.near')}</option>
              <option value="cheapest">{t('sort.cheapest')}</option>
              <option value="expensive">{t('sort.expensive')}</option>
            </select>
          </label>
        </div>

        <p className={style.count}>{t('list.count', { count: sorted.length })}</p>
      </header>

      <div className={style.list}>
        {sorted.length === 0 ? (
          <div className={style.empty}>
            {query ? t('list.emptySearch') : t('list.empty')}
            {query && (
              <button type="button" className={style.emptyReset} onClick={() => runSearch("")}>
                {t('list.resetSearch')}
              </button>
            )}
          </div>
        ) : (
          sorted.map((b) => (
            <BorschListItem key={b.id_borsch} borsch={b} distance={distOf(b)} />
          ))
        )}
      </div>

      {cityOpen && (
        <Modal onClose={() => setCityOpen(false)} version={"filters"}>
          <CitySelect onClose={() => setCityOpen(false)} />
        </Modal>
      )}
    </div>
  );
};
