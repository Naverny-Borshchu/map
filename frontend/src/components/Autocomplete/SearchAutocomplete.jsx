/**
 * Venue/dish search box for the topbar.
 *
 * Opens on focus BEFORE anything is typed: with an empty query it suggests
 * the nearest venues (when geolocation was granted) or the top-rated venues
 * of the current city. Typing switches to the fuzzy matcher in utils/search —
 * substring, both-language synonyms, translit and typo tolerance.
 *
 * The Google Places city picker stays in Autocomplete.jsx; this component is
 * for OUR data (places + borsches from context).
 */
import { useMemo, useState } from 'react';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { useFilters } from '../../context/FiltersContext';
import { useI18n } from '../../i18n';
import { venueLabel as rawVenueLabel } from '../../i18n/venueNames';
import { dishLabel as rawDishLabel } from '../../i18n/dishNames';
import { buildIndex, search } from '../../utils/search';
import { getUserLocation, distanceMeters, formatDistance, placePoint } from '../../utils/distance';
import { averageRating, hasRating, formatGrade } from '../../utils/rating';
import style from './SearchAutocomplete.module.css';

const DEFAULT_COUNT = 6;
const RESULT_COUNT = 8;

export const SearchAutocomplete = ({
  id,
  className = '',
  placeholder,
  value,
  onChange,
  onSubmit,
  onPick,
}) => {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);

  const { t, lang, cityLabel } = useI18n();
  const { allPlaces } = usePlaces();
  const { borsch } = useBorsch();
  const { city } = useFilters();

  // Average community rating per place — used to boost ranking ties and to
  // pick the "top rated in your city" default suggestions.
  const ratingByPlace = useMemo(() => {
    const grouped = {};
    (borsch || []).forEach((b) => {
      if (!b?.place_id) return;
      (grouped[b.place_id] = grouped[b.place_id] || []).push(b.overall_rating);
    });
    const out = {};
    Object.entries(grouped).forEach(([pid, ratings]) => {
      const avg = averageRating(ratings);
      if (avg !== null) out[pid] = Number(avg);
    });
    return out;
  }, [borsch]);

  // Both languages are indexed for every item — the uk name as stored plus
  // the SAME label the English UI displays (curated VENUE_LABELS / dish
  // translation). That is what makes «Пузата Хата» ⇄ «Puzata Hata» symmetric.
  const index = useMemo(() => {
    const items = [];
    (allPlaces || []).forEach((p) => {
      if (!p?.name) return;
      items.push({
        id: `venue:${p.id}`,
        kind: 'venue',
        label: p.name,
        labelEn: rawVenueLabel(p.name, 'en'),
        sublabel: p.adress || p.city || '',
        texts: [p.name, rawVenueLabel(p.name, 'en')],
        boost: ratingByPlace[p.id] || 0,
        place: p,
      });
    });
    (borsch || []).forEach((b) => {
      if (!b?.name) return;
      items.push({
        id: `dish:${b.id_borsch}`,
        kind: 'dish',
        label: b.name,
        labelEn: rawDishLabel(b.name, 'en'),
        sublabel: b.place_name || '',
        texts: [b.name, rawDishLabel(b.name, 'en')],
        boost: hasRating(b.overall_rating) ? Number(b.overall_rating) : 0,
        borsch: b,
      });
    });
    return buildIndex(items);
  }, [allPlaces, borsch, ratingByPlace]);

  const query = String(value || '').trim();

  // Suggestions are cheap to compute (a few hundred items), so they are
  // derived inline while the list is open instead of being memoised on state
  // that changes on every keystroke anyway.
  let heading = null;
  let rows = [];
  if (open) {
    if (query) {
      rows = search(index, query, { limit: RESULT_COUNT }).map((r) => ({
        entry: r.item,
        meta: null,
      }));
    } else {
      const venues = index.filter((e) => e.kind === 'venue');
      const loc = getUserLocation();
      if (loc) {
        heading = t('search.nearby');
        rows = venues
          .map((e) => ({ entry: e, dist: distanceMeters(loc, placePoint(e.place)) }))
          .filter((r) => Number.isFinite(r.dist))
          .sort((a, b) => a.dist - b.dist)
          .slice(0, DEFAULT_COUNT)
          .map((r) => ({ entry: r.entry, meta: formatDistance(r.dist) }));
      } else {
        heading = t('search.topCity', { city: cityLabel(city) });
        const inCity = venues.filter((e) => e.place.city === city);
        rows = (inCity.length ? inCity : venues)
          .slice()
          .sort((a, b) => (b.boost || 0) - (a.boost || 0))
          .slice(0, DEFAULT_COUNT)
          .map((e) => ({ entry: e, meta: null }));
      }
    }
  }

  const display = (entry) => (lang === 'en' ? entry.labelEn || entry.label : entry.label);
  const displaySub = (entry) =>
    entry.kind === 'dish' && entry.sublabel
      ? rawVenueLabel(entry.sublabel, lang)
      : entry.sublabel;

  const close = () => {
    setOpen(false);
    setActive(-1);
  };

  const pick = (entry) => {
    close();
    if (onPick) onPick({ ...entry, displayLabel: display(entry) });
  };

  const handleKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      if (!rows.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((prev) => (prev + step + rows.length) % rows.length);
      return;
    }
    if (e.key === 'Enter') {
      if (open && active >= 0 && rows[active]) {
        e.preventDefault();
        pick(rows[active].entry);
        return;
      }
      close();
      if (onSubmit) onSubmit(query);
      return;
    }
    if (e.key === 'Escape') {
      close();
    }
  };

  return (
    <>
      <input
        id={id}
        type="text"
        className={className}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={id ? `${id}-listbox` : undefined}
        onChange={(e) => {
          setOpen(true);
          setActive(-1);
          if (onChange) onChange(e.target.value);
        }}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        onBlur={() => close()}
        onKeyDown={handleKeyDown}
      />
      {open && (rows.length > 0 || query) && (
        <div
          className={style.dropdown}
          // Keep focus in the input so onBlur does not close the list before
          // the click on a suggestion lands.
          onMouseDown={(e) => e.preventDefault()}
        >
          {heading && <div className={style.heading}>{heading}</div>}
          {rows.length === 0 ? (
            <div className={style.empty}>{t('search.noMatches')}</div>
          ) : (
            <ul id={id ? `${id}-listbox` : undefined} role="listbox" className={style.list}>
              {rows.map(({ entry, meta }, i) => (
                <li
                  key={entry.id}
                  role="option"
                  aria-selected={i === active}
                  className={`${style.item} ${i === active ? style.itemActive : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(entry)}
                >
                  <span className={style.kind}>
                    {entry.kind === 'venue' ? t('search.venue') : t('search.dish')}
                  </span>
                  <span className={style.labelWrap}>
                    <span className={style.label}>{display(entry)}</span>
                    {displaySub(entry) && (
                      <span className={style.sublabel}>{displaySub(entry)}</span>
                    )}
                  </span>
                  <span className={style.meta}>
                    {meta || (entry.boost >= 1 ? formatGrade(entry.boost) : '')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  );
};
