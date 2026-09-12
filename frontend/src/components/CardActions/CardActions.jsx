import { ButtonVertion } from "../ButtonVersion";
import { ReactComponent as IconLike } from '../CardBorsch/like.svg';
import { ReactComponent as IconLink } from '../CardBorsch/link.svg';
import style from './CardActions.module.scss';
import { useFavorites } from '../../context/FavoritesContext';
import { useRequireAuthAction } from '../../hook/useRequireAuthAction';
import { useT } from "../../i18n";

const fallbackCopy = (text) => {
  const tempInput = document.createElement("input");
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);
};

const copyToClipboardWithAlert = (text) => {
  const done = () => alert("Посилання скопійоване в буфер. Поділитись можна вручну.");

  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch((err) => {
      console.error("Помилка копіювання:", err);
      fallbackCopy(text);
      done();
    });
    return;
  }

  fallbackCopy(text);
  done();
};

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

  const handleShare = () => {
    const url = `${window.location.origin}/borsch/${borschId}`;

    if (navigator.share) {
      navigator
        .share({
          title: t('card.shareTitle'),
          text: t('card.shareText'),
          url,
        })
        .catch(() => copyToClipboardWithAlert(url));
      return;
    }

    copyToClipboardWithAlert(url);
  };

  return (
    <div className={`${style.actions} ${className}`.trim()}>
      <ButtonVertion type="button" onClick={handleShare} icon={IconLink} label={t('card.share')} />
      <button
        type="button"
        className={`${style.like} ${liked ? style.liked : ''}`}
        onClick={toggleLike}
        aria-pressed={liked}
        aria-label={liked ? t('card.unlike') : t('card.like')}
      >
        <IconLike />
      </button>
    </div>
  );
};
