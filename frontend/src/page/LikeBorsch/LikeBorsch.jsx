import { useNavigate} from "react-router-dom";
import { useFavorites } from '../../context/FavoritesContext';
import { ButtonVertion } from "../../components/ButtonVersion";
import { ReactComponent as IconLikeActive } from './likeActive.svg';
import { ReactComponent as IconLink } from './link.svg';
import { FotoBorschGallary } from "../../components/FotoBorschGallary";
import { RatingIconsSvg } from "../../components/RatingIconsSvg";
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import { useState, useEffect } from 'react';
import style from "./LikeBorsch.module.scss";
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
    return place ? place.name : "Невідоме місце";
  };  

   const handleCopyAndShare = (id_borsch) => {
    const url = `${window.location.origin}/borsch/${id_borsch}`;

    // Если Web Share API поддерживается — вызываем нативное окно
    if (navigator.share) {
      navigator.share({
        title: 'Перегляньте цей борщ',
        text: 'Дивись ось цю сторінку борща:',
        url: url,
      })
      .then(() => console.log("Поділитися успішно"))
      .catch((err) => {
        console.error("Помилка при шерингу:", err);
        // Если шеринга нет или отказались — копируем в буфер один раз
        copyToClipboardWithAlert(url);
      });
    } else {
      // Web Share API нет — просто копируем в буфер и alert
      copyToClipboardWithAlert(url);
    }
  };

  const copyToClipboardWithAlert = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          alert(t('card.shareCopied'));
        })
        .catch((err) => {
          console.error("Помилка копіювання:", err);
          fallbackCopy(text);
          alert(t('card.shareCopied'));
        });
    } else {
      fallbackCopy(text);
      alert(t('card.shareCopied'));
    }
  };
  return( 
    <div className={style.page}>
      <h2 className={style.title}>{t('fav.title')}</h2>        
        {loading && <p>Завантаження...</p>}
        {!loading && borschList.length === 0 && (
          <div style={{ padding: '32px 16px', textAlign: 'center', opacity: 0.6 }}>
            <p style={{ fontSize: 32 }}>🍲</p>
            <p>{t('fav.empty')}</p>
            <p style={{ fontSize: 13 }}>{t('fav.emptyHint')}</p>
          </div>
        )}
        <div className={style.wrappBorsch}>
            {borschList.map((el,index)=>{                   
              return (
                <div key={index} className={style.card}>
                  <FotoBorschGallary images={el.photo_urls} height={"120px"}/>                  
                  <div className={style.box}>                
                    <ButtonVertion
                      label={t('card.share')}
                      type="button"
                      onClick={() => handleCopyAndShare(el.id_borsch)}
                      icon={IconLink}
                    />
                    <ButtonVertion
                      label={t('card.share')}
                      type="button"
                      onClick={() => handleUnlike(el.id_borsch)}
                      icon={IconLikeActive}
                    />
                  </div>                  
                  <div className={style.flex}>
                    <p className={style.borschName}>{el.name}</p>
                    <p className={style.borschPrice}>{el.price}</p>                    
                  </div>
                  <p className={style.grade}>{t('fav.myScore')}</p>
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
              )                    
            })} 
        </div>         
      </div>
  )   
}