import { useNavigate } from "react-router-dom";
import { useState, useEffect } from 'react';
import { ButtonVertion } from "../../components/ButtonVersion";
import { ReactComponent as IconLike } from './like.svg';
import { ReactComponent as IconLink } from './link.svg';
import { FotoBorschGallary } from "../../components/FotoBorschGallary";
import { RatingIconsSvg } from "../../components/RatingIconsSvg";
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import style from "./List.module.scss";
import { commentsAPI } from '../../api';
import { useUser } from '../../context/UserContext';
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
  console.log("Скопійовано через fallback:", text);  
};

export const List = () => {
  const t = useT();
  const navigate = useNavigate();
  const { getAllBorsch } = useBorsch();
  const { getPlaceById } = usePlaces();
  const [borschList, setBorschList] = useState([]);
  const [loading, setLoading] = useState(true);
  // Server-backed and account-scoped: the old `likedBorsch` array was
  // per-device, so the same account saw different favourites on phone and
  // laptop, and a signed-out device kept the previous person's list.
  const { isFavorite, toggle } = useFavorites();
  const { isAuthenticated } = useUser();
  const { requireAuth } = useRequireAuthAction();

  const handleToggleLike = (borschId) => {
    requireAuth(() => {
      toggle(borschId).catch((err) => console.error('Не вдалося оновити обране:', err));
    });
  };

  useEffect(() => {
    const loadData = async () => {
      // Your ratings come from the account, not from this device. The old
      // `ratedBorsch` array in localStorage meant the same account saw a
      // different list on phone and laptop, and clearing the browser lost it
      // (Yuliia, 2026-08-20).
      if (!isAuthenticated) {
        setBorschList([]);
        setLoading(false);
        return;
      }

      try {
        const all = await getAllBorsch();
        const mine = await commentsAPI.getMine();

        // one row per borsch — the newest review wins
        const latestByBorsch = new Map();
        mine.forEach((review) => {
          const key = String(review.id_borsch);
          if (!latestByBorsch.has(key)) latestByBorsch.set(key, review);
        });

        setBorschList(
          (all || [])
            .filter((b) => latestByBorsch.has(String(b.id_borsch)))
            .map((b) => ({
              ...b,
              my_overall_rating: latestByBorsch.get(String(b.id_borsch)).overall_rating,
            }))
        );
      } catch (error) {
        console.error('Не вдалося завантажити мої відгуки:', error);
        setBorschList([]);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [getAllBorsch, isAuthenticated]);

  const onClickCard = (borschId) => {
    navigate(`/borsch/${borschId}`);
  };

  const nameBorsch = (place_id) => {
    const place = getPlaceById(place_id);
    return place ? place.name : "Невідоме місце";
  };

  const handleCopyAndShare = (id_borsch) => {
  const url = `${window.location.origin}/borsch/${id_borsch}`;

  
  if (navigator.share) {
    navigator.share({
      title: 'Перегляньте цей борщ',
      text: 'Дивись ось цю сторінку борща:',
      url: url,
    })
    .then(() => console.log("Поділитися успішно"))
    .catch((err) => {
      console.error("Помилка при шерингу:", err);
    
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          alert("Посилання скопійоване в буфер. Поділитись можна вручну.");
        });
      } else {
        fallbackCopy(url);
      }
    });
  } else {
   
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(() => {
        alert("Посилання скопійоване в буфер. Поділитись можна вручну.");
      });
    } else {
      fallbackCopy(url);
    }
  }
  };



  return (
    <div className={style.page}>
      <h2 className={style.title}>{t('rev.title')}</h2>
      {loading && <p>Завантаження...</p>}
      {!loading && borschList.length === 0 && (
        <div style={{ padding: '32px 16px', textAlign: 'center', opacity: 0.6 }}>
          <p style={{ fontSize: 32 }}>📝</p>
          <p>{t('rev.empty')}</p>
          <p style={{ fontSize: 13 }}>{t('rev.emptyHint')}</p>
        </div>
      )}
      <div className={style.wrappBorsch}>
        {borschList.map((el, index) => (
          <div key={index} className={style.card}>
            <FotoBorschGallary images={el.photo_urls} height={"120px"} />
            <div className={style.box}>
              <ButtonVertion
                type="button"
                onClick={() => handleCopyAndShare(el.id_borsch)}
                icon={IconLink}
              />
              <ButtonVertion
                type="button"
                onClick={() => handleToggleLike(el.id_borsch)}
                icon={IconLike}
                pressed={isFavorite(el.id_borsch)}
                label={isFavorite(el.id_borsch) ? t('card.unlike') : t('card.like')}
              />
            </div>
            <div className={style.flex}>
              <p className={style.borschName}>{el.name}</p>
              <p className={style.borschPrice}>{el.price}</p>
            </div>
            <p className={style.grade}>Моя оцінка</p>
            <RatingIconsSvg overall_rating={el.overall_rating} />
            <div className={style.flex}>
              <p className={style.namePlace}>{nameBorsch(el.place_id)}</p>
              <button
                className={style.btnAbout}
                type="button"
                onClick={() => onClickCard(el.id_borsch)}
              >Про борщик</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
