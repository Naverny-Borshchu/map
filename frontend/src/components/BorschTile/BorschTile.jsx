import { FotoBorschGallary } from '../FotoBorschGallary';
import { RatingIconsSvg } from '../RatingIconsSvg';
import { IconHeart, IconShare, IconMapPin, IconBowl } from '../Icons';
import { shareBorsch } from '../../utils/share';
import { priceLabel } from '../../utils/price';
import { useT, useDishLabel, useVenueLabel } from '../../i18n';
import style from './BorschTile.module.scss';

/**
 * One borshch in the profile lists (favourites, my reviews, added): photo with
 * share and like over it, the dish, the score in bowls, the venue and a way
 * into the borshch page. The three screens carried three copies of this card,
 * each with its own share code and its own hardcoded words.
 */
export const BorschTile = ({ borsch, venueName, scoreLabel, liked, onToggleLike, onOpen }) => {
  const t = useT();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const price = priceLabel(borsch.price, t);

  return (
    <article className={style.card}>
      <div className={style.photo}>
        {borsch.photo_urls?.length ? (
          <FotoBorschGallary images={borsch.photo_urls} height="100%" />
        ) : (
          <span className={style.noPhoto} aria-hidden="true"><IconBowl size={44} /></span>
        )}
        <div className={style.actions}>
          <button type="button" className={style.round} onClick={() => shareBorsch(borsch.id_borsch, t)} aria-label={t('card.share')}>
            <IconShare size={20} />
          </button>
          <button
            type="button"
            className={`${style.round} ${style.like} ${liked ? style.liked : ''}`}
            onClick={onToggleLike}
            aria-pressed={!!liked}
            aria-label={liked ? t('card.unlike') : t('card.like')}
          >
            <IconHeart size={20} filled={!!liked} />
          </button>
        </div>
      </div>
      <div className={style.body}>
        <div className={style.head}>
          <h3 className={style.name}>{dishLabel(borsch.name)}</h3>
          {price && <p className={style.price}>{price}</p>}
        </div>
        {scoreLabel && <p className={style.scoreLabel}>{scoreLabel}</p>}
        <RatingIconsSvg overall_rating={borsch.overall_rating} size={18} />
        <div className={style.foot}>
          <p className={style.venue}>
            <IconMapPin size={16} />
            <span>{venueName ? venueLabel(venueName) : t('card.unknownPlace')}</span>
          </p>
          <button type="button" className={style.open} onClick={onOpen}>
            {t('card.about')}
          </button>
        </div>
      </div>
    </article>
  );
};

export default BorschTile;
