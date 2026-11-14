import { useNavigate} from "react-router-dom";
import { useFavorites } from '../../context/FavoritesContext';
import { BorschTile } from "../../components/BorschTile";
import { EmptyState } from "../../components/EmptyState";
import { PageHeader } from "../../components/PageHeader";
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import { useState, useEffect } from 'react';
import style from "./LikeBorsch.module.scss";
import { useT } from "../../i18n";

export const LikeBorsch=()=>{
  const t = useT();   
  const navigate = useNavigate();
  const { getAllBorsch } = useBorsch();
  const { getPlaceById } = usePlaces();
  const [borschList, setBorschList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { favoriteIds, toggle, loading: favoritesLoading } = useFavorites();

  useEffect(() => {
    const loadData = async () => {
      const all = await getAllBorsch();
      // Favourites come from /api/favorites/ for the signed-in account, so this
      // page shows the same list on every device. It used to read a per-device
      // `likedBorsch` array out of localStorage.
      const filtered = favoriteIds.length > 0
        ? all.filter(b => favoriteIds.includes(String(b.id_borsch)))
        : [];
      setBorschList(filtered);
      setLoading(false);
    };
    if (favoritesLoading) return;
    loadData();
    // rebuilds when the account's favourites arrive or change
  }, [getAllBorsch, favoriteIds, favoritesLoading]);

  const onClickCard = (borschId) => {
    navigate(`/borsch/${borschId}`);
  };

  const handleUnlike = (borschId) => {
    toggle(borschId).catch((err) => console.error('Не вдалося оновити обране:', err));
    setBorschList(prev => prev.filter(b => String(b.id_borsch) !== String(borschId)));
  };
  
  const nameBorsch = (place_id) => {
    const place = getPlaceById(place_id);
    return place ? place.name : '';
  };  

  return(
    <div className={style.page}>
      <PageHeader back="/profile" kicker={t('profile.kicker')} title={t('fav.title')} />
        {loading && <EmptyState loading title={t('common.loading')} compact />}
        {!loading && borschList.length === 0 && (
          <EmptyState
            art="find"
            title={t('fav.empty')}
            text={t('fav.emptyHint')}
            action={{ to: '/list', label: t('nav.showList') }}
          />
        )}
        <div className={style.wrappBorsch}>
            {borschList.map((el) => (
              <BorschTile
                key={el.id_borsch}
                borsch={el}
                venueName={nameBorsch(el.place_id) || el.place_name}
                scoreLabel={t('card.rating')}
                liked
                onToggleLike={() => handleUnlike(el.id_borsch)}
                onOpen={() => onClickCard(el.id_borsch)}
              />
            ))}
        </div>
      </div>
  )
}
