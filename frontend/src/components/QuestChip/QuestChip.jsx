import { useMemo, useState } from 'react';
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import { useFilters } from '../../context/FiltersContext';
import { distanceMeters, formatDistance, getUserLocation } from '../../utils/distance';
import { useT } from '../../i18n';
import style from './QuestChip.module.scss';

/**
 * "Розвідка борщу" quest board.
 *
 * Marking untasted borsches on the map is only half a mechanic: you still have
 * to find them by panning around. This chip does the finding — it counts what
 * is left to scout and walks you to the next one, nearest first, so the loop is
 * tap → travel → rate → tap again.
 *
 * Ordering: never-rated borsches ("Першовар" targets) come before ones that
 * only carry a founders'-catalogue score, then by distance from the visitor
 * (or from the map centre when geolocation was declined).
 *
 * `inline` renders it as a row inside the brand badge (phones, where two
 * floating pills in the same corner was one too many); standalone it still
 * floats over the map, which is how desktop shows it — there is no badge there.
 */
export const QuestChip = ({ inline = false }) => {
  const t = useT();
  const { getQuestBorsches } = useBorsch();
  const { places, selectPlace } = usePlaces();
  const { center, focusMap } = useFilters();
  const [cursor, setCursor] = useState(0);

  const origin = getUserLocation() || center;

  const quests = useMemo(() => {
    const placeById = new Map(places.map((p) => [String(p.id), p]));
    return getQuestBorsches()
      .map(({ borsch, state }) => {
        const place = placeById.get(String(borsch.place_id));
        if (!place || !place.latitude || !place.longitude) return null;
        const point = { lat: Number(place.latitude), lng: Number(place.longitude) };
        return {
          state,
          place,
          point,
          distance: origin ? distanceMeters(origin, point) : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (a.state !== b.state) return a.state === 'virgin' ? -1 : 1;
        return (a.distance ?? Infinity) - (b.distance ?? Infinity);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [places, getQuestBorsches, origin?.lat, origin?.lng]);

  if (!quests.length) return null;

  const target = quests[cursor % quests.length];

  const go = () => {
    focusMap(target.point.lat, target.point.lng, 17);
    selectPlace(target.place.id);
    setCursor((c) => (c + 1) % quests.length);
  };

  const virginCount = quests.filter((q) => q.state === 'virgin').length;
  const near = formatDistance(target.distance);

  return (
    <button
      type="button"
      className={`${inline ? style.inline : style.chip} nb-questchip`}
      onClick={go}
    >
      <span className={style.icon} aria-hidden="true">🔍</span>
      <span className={style.text}>
        <strong>
          {virginCount
            ? t(inline ? 'quest.virginShort' : 'quest.virginCount', { count: virginCount })
            : t(inline ? 'quest.unverifiedShort' : 'quest.unverifiedCount', { count: quests.length })}
        </strong>
        <span className={style.sub}>
          {near
            ? t(inline ? 'quest.nextNearShort' : 'quest.nextNear', { d: near })
            : t(inline ? 'quest.nextShort' : 'quest.next')}
        </span>
      </span>
    </button>
  );
};
