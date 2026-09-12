import { Link } from "react-router-dom";
import { usePlaces } from "../../context/PlacesContext";
import { formatGrade, hasRating } from "../../utils/rating";
import style from "./BorschListItem.module.scss";
import { useT } from "../../i18n";
import { formatDistance } from "../../utils/distance";
import { useCityLabel } from "../../i18n";
import { useVenueLabel } from "../../i18n";
import { useDishLabel } from "../../i18n";

const srcOf = (path) =>
  path?.startsWith("http") ? path : `https://map.navernyborshchu.com${path}`;

/**
 * Compact list row for a borsch. The list used to reuse the full popup card
 * (photo carousel + share/like overlay + two buttons) per row, which is far
 * too heavy for a scrollable list of a hundred+ items.
 */
export const BorschListItem = ({ borsch, distance = null }) => {
  const { getPlaceById } = usePlaces();
  const t = useT();
  const cityLabel = useCityLabel();
  const venueLabel = useVenueLabel();
  const dishLabel = useDishLabel();

  const place = getPlaceById(borsch.place_id);
  const photo = borsch.photo_urls?.[0];
  const rated = hasRating(borsch.overall_rating);

  return (
    // A real link, not a button: rows are navigation, so they should be
    // openable in a new tab, copyable and previewable like any other link.
    <Link to={`/borsch/${borsch.id_borsch}`} className={style.row}>
      <div className={style.thumb}>
        {photo ? (
          <img src={srcOf(photo)} alt="" loading="lazy" />
        ) : (
          <div className={style.thumbEmpty} aria-hidden="true">🍲</div>
        )}
      </div>

      <div className={style.body}>
        <p className={style.name}>{dishLabel(borsch.name)}</p>
        {place && (
          <p className={style.place}>
            {venueLabel(place.name)}
            {place.city ? ` · ${cityLabel(place.city)}` : ""}
          </p>
        )}
        <p className={style.meta}>
          {distance !== null && <span className={style.distance}>{formatDistance(distance)}</span>}
          {borsch.price ? <span>{borsch.price}</span> : null}
        </p>
      </div>

      <div className={style.side}>
        {rated ? (
          <span className={style.score}>{formatGrade(borsch.overall_rating)}</span>
        ) : (
          <span className={style.scoreEmpty}>—</span>
        )}
        {borsch.rating_count > 0 && (
          <span className={style.count}>{t('list.ratingsShort', { count: borsch.rating_count })}</span>
        )}
      </div>
    </Link>
  );
};
