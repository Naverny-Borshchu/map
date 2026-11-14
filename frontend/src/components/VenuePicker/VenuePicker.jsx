import { BowlLoader } from '../EmptyState';
import { IconMapPin, IconSearch } from '../Icons';
import { formatDistanceLocal } from '../../utils/nearestPlaces';
import { useI18n, useVenueLabel, useCityLabel } from '../../i18n';
import q from '../QuestFlow/QuestFlow.module.scss';
import style from '../../page/BowlFlow/BowlFlow.module.scss';

/** One venue as a big card on the red stage: name, address, distance. */
export const VenueCard = ({ place: p, distance = null, onPick }) => {
  const { t, lang } = useI18n();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  return (
    <button type="button" className={style.venue} onClick={() => onPick(p)}>
      <span className={style.venueIcon} aria-hidden="true"><IconMapPin size={22} /></span>
      <span className={style.venueWords}>
        <span className={style.venueName}>{venueLabel(p.name)}</span>
        <span className={style.venueAddr}>
          {[p.address || p.adress, p.city && cityLabel(p.city)].filter(Boolean)[0] || ''}
        </span>
      </span>
      {distance !== null && distance !== undefined && (
        <span className={style.venueDist}>{formatDistanceLocal(distance, t, lang)}</span>
      )}
    </button>
  );
};

/**
 * The venue screen of every flow that starts at a table in a venue: the three
 * nearest venues as cards when the phone knows where it is («Ти зараз тут?»),
 * a search field under them, and the matches as the same cards.
 *
 * nearby   the result of hook/useNearbyVenues
 * loading  venues or borshch still loading
 * titles   { here, where }: the heading with and without nearby venues
 * kicker   the line above the heading (flow name and step)
 */
export const VenuePicker = ({ nearby, loading = false, titles, kicker = null, headingRef = null, onPick }) => {
  const { t } = useI18n();
  const { geo, nearest, query, setQuery, results } = nearby;
  const askHere = geo.status === 'ok' && nearest.length > 0;
  const note = {
    locating: t('bowl.locating'),
    denied: t('bowl.geoDenied'),
    unavailable: t('bowl.geoUnavailable'),
  }[geo.status] || (geo.status === 'ok' && !loading && nearest.length === 0 ? t('bowl.noneNear') : '');

  return (
    <>
      {kicker}
      <h2 className={q.question} ref={headingRef} tabIndex={-1}>{askHere ? titles.here : titles.where}</h2>
      {note && <p className={q.hint} role="status">{note}</p>}
      {geo.status === 'locating' && <div className={style.loaderRow}><BowlLoader size={40} /></div>}
      {askHere && (
        <div className={style.venues}>
          {nearest.map(({ place, distance }) => (
            <VenueCard key={place.id} place={place} distance={distance} onPick={onPick} />
          ))}
        </div>
      )}
      {geo.status === 'ok' && loading && <div className={style.loaderRow}><BowlLoader size={40} /></div>}

      <label className={style.search}>
        <span className="nb-sr-only">{t('bowl.searchLabel')}</span>
        <IconSearch size={20} aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('bowl.searchPlaceholder')}
          autoComplete="off"
          enterKeyHint="search"
        />
      </label>
      {query.trim() && (
        results.length
          ? (
            <div className={style.venues}>
              {results.map(({ place, distance }) => (
                <VenueCard key={place.id} place={place} distance={distance} onPick={onPick} />
              ))}
            </div>
          )
          : <p className={q.hint}>{t('bowl.searchEmpty')}</p>
      )}
    </>
  );
};
