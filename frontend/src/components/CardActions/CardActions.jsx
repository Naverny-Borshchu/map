import style from './CardActions.module.scss';
import { useFavorites } from '../../context/FavoritesContext';
import { useRequireAuthAction } from '../../hook/useRequireAuthAction';
import { useT } from "../../i18n";
import { shareBorsch } from '../../utils/share';
import { IconHeart, IconShare } from '../Icons';

/**
 * Share + like for a borsch. Extracted from CardBorsch so the popup can lay
 * them out in its own header row next to the close button, instead of the card
 * floating them over its photo.
 */
export const CardActions = ({ borschId, className = '' }) => {
  const t = useT();
  // Favourites live on the server, keyed to the account (Yuliia, 2026-08-17 and
  // again 2026-08-20). They used to be a `likedBorsch` array in localStorage,
  // which meant they were per-device, survived signing out into the next
  // person's session, and never reached the API at all.
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useRequireAuthAction();
  const liked = isFavorite(borschId);

  const toggleLike = () => {
    requireAuth(() => {
      toggle(borschId).catch((err) =>
        console.error('Не вдалося оновити обране:', err));
    });
  };

  return (
    <div className={`${style.actions} ${className}`.trim()}>
      <button
        type="button"
        className={style.btn}
        onClick={() => shareBorsch(borschId, t)}
        aria-label={t('card.share')}
      >
        <IconShare />
      </button>
      <button
        type="button"
        className={`${style.btn} ${style.like} ${liked ? style.liked : ''}`}
        onClick={toggleLike}
        aria-pressed={liked}
        aria-label={liked ? t('card.unlike') : t('card.like')}
      >
        <IconHeart filled={liked} />
      </button>
    </div>
  );
};
