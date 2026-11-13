import { useNavigate } from "react-router-dom";
import { useState, useEffect } from 'react';
import { BorschTile } from "../../components/BorschTile";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import style from "./List.module.scss";
import { commentsAPI } from '../../api';
import { useUser } from '../../context/UserContext';
import { useFavorites } from '../../context/FavoritesContext';
import { useRequireAuthAction } from '../../hook/useRequireAuthAction';
import { useT } from "../../i18n";

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
    return place ? place.name : '';
  };

  return (
    <div className={style.page}>
      <PageHeader back="/profile" kicker={t('profile.kicker')} title={t('rev.title')} />
      {loading && <EmptyState loading title={t('common.loading')} compact />}
      {!loading && borschList.length === 0 && (
        <EmptyState
          art="spoon"
          title={t('rev.empty')}
          text={t('rev.emptyHint')}
          action={{ to: '/list', label: t('nav.showList') }}
        />
      )}
      <div className={style.wrappBorsch}>
        {borschList.map((el) => (
          // «Моя оцінка» shows MY score: the list already computes it from my
          // own review (my_overall_rating); the card used to print the
          // community average under that label.
          <BorschTile
            key={el.id_borsch}
            borsch={{ ...el, overall_rating: el.my_overall_rating ?? el.overall_rating }}
            venueName={nameBorsch(el.place_id)}
            scoreLabel={t('fav.myScore')}
            liked={isFavorite(el.id_borsch)}
            onToggleLike={() => handleToggleLike(el.id_borsch)}
            onOpen={() => onClickCard(el.id_borsch)}
          />
        ))}
      </div>
    </div>
  );
};
