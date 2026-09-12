import { useState } from "react";
import { useBorsch } from '../../context/BorschContext';
import { CardBosch } from "../../components/CardBorsch/CardBorsch";
import { CardActions } from "../../components/CardActions";
import { RouteButton } from "../../components/RouteButton";
import { usePlaces } from "../../context/PlacesContext";
import style from './Gallery.module.scss';
import { useT } from "../../i18n";

/**
 * The popup shown when a place marker is tapped: the borsches rated at that
 * place, one card at a time.
 *
 * It used to be a coverflow strip with hardcoded 380px/320px cards and a
 * `translateX(index * 200px)` slide, offset by `margin-left: -90px` — wider
 * than a phone viewport, so it hung off the screen and neighbouring cards were
 * unreachable. Now a single card is sized to the viewport, with explicit
 * prev/next controls.
 */
export const Gallery = ({ onClose, id_place }) => {
  const [index, setIndex] = useState(0);
  const { getBorschByPlaceId } = useBorsch();
  const { getPlaceById } = usePlaces();
  const t = useT();

  const list = getBorschByPlaceId(id_place) || [];
  const total = list.length;

  const closeButton = (
    <button
      type="button"
      className={style.close}
      onClick={onClose}
      aria-label={t('card.close')}
    >
      ×
    </button>
  );

  if (!total) {
    return (
      <div className={style.container}>
        <div className={style.topBar}>{closeButton}</div>
        <p className={style.empty}>{t('card.emptyPlace')}</p>
      </div>
    );
  }

  const safeIndex = Math.min(index, total - 1);
  const go = (delta) => setIndex((i) => (i + delta + total) % total);

  return (
    <div className={style.container}>
      <div className={style.stage}>
        {/* share · like · close sit inside the dialog, over the photo's
            top-right corner */}
        <div className={style.actionsOverlay}>
          <RouteButton place={getPlaceById(id_place)} iconOnly />
          <CardActions borschId={list[safeIndex]?.id_borsch} />
          {closeButton}
        </div>

        {total > 1 && (
          <button
            type="button"
            className={`${style.nav} ${style.prev}`}
            onClick={() => go(-1)}
            aria-label={t('card.prevBorsch')}
          >
            ‹
          </button>
        )}

        <div className={style.cardWrap}>
          {/* keyed by borsch: otherwise FotoBorschGallary kept its photo index
              across flips — borsch A on photo 3 → borsch B with 1 photo showed
              a broken image */}
          <CardBosch key={list[safeIndex]?.id_borsch} index={safeIndex} el={list[safeIndex]} isActive hideActions />
        </div>

        {total > 1 && (
          <button
            type="button"
            className={`${style.nav} ${style.next}`}
            onClick={() => go(1)}
            aria-label={t('card.nextBorsch')}
          >
            ›
          </button>
        )}
      </div>

      {total > 1 && (
        <div className={style.pager}>
          <div className={style.dots}>
            {list.map((_, i) => (
              <button
                key={i}
                type="button"
                className={`${style.dot} ${i === safeIndex ? style.dotActive : ''}`}
                onClick={() => setIndex(i)}
                aria-label={`${i + 1}`}
              />
            ))}
          </div>
          <span className={style.counter}>
            {safeIndex + 1} / {total}
          </span>
        </div>
      )}
    </div>
  );
};
