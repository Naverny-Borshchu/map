import { useEffect, useMemo, useRef } from 'react';
import { ReactComponent as IconLogo } from '../Logo/logo.svg';
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import { useFilters } from '../../context/FiltersContext';
import { filterBorsches } from '../../utils/filtering';
import { QuestChip } from '../QuestChip';
import style from './MapBrandBadge.module.scss';
import { useT } from '../../i18n';

/**
 * Floating brand badge for the full-screen map variants (map1+).
 *
 * Sits bottom-left over the map, Google-Maps-style, and carries the borsch
 * counter as its subtitle — that lets the variant stylesheet drop the separate
 * counter strip that used to eat a row at the top of the screen.
 *
 * The scouting quest lives here too. It used to be a second floating pill a few
 * pixels away in the same corner band, which read as two competing badges; one
 * plaque now says how many borsches are on the map and how many of them nobody
 * has tasted yet, and the second line is the button that walks you to the
 * nearest one.
 */
export const MapBrandBadge = () => {
  const boxRef = useRef(null);
  const { borsch, loading } = useBorsch();
  const { allPlaces } = usePlaces();
  const { filters } = useFilters();
  const t = useT();

  // Count what is ACTUALLY on the map. It used to report the whole dataset, so
  // with a filter on the badge promised 100 while sixteen pins were showing.
  const count = useMemo(() => {
    const byId = new Map((allPlaces || []).map((p) => [String(p.id), p]));
    return filterBorsches(borsch, (id) => byId.get(String(id)), filters).length;
  }, [borsch, allPlaces, filters]);

  // --nb-badge-h lets the variant stylesheet lift the view toggle clear of this
  // plaque on screens too narrow to fit both side by side.
  useEffect(() => {
    const el = boxRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const publish = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) document.documentElement.style.setProperty('--nb-badge-h', `${h}px`);
    };
    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={boxRef} className={`${style.badge} nb-brandbadge`}>
      <div className={style.brand}>
        <IconLogo className={style.logo} aria-label="Наверни Борщу" />
        <span className={style.count}>
          {loading ? t('map.loadingShort') : t('map.borschesOnMap', { count })}
        </span>
      </div>
      {!loading && <QuestChip inline />}
    </div>
  );
};
