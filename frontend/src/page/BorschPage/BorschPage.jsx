import { useState, useEffect } from "react";
import { useFavorites } from '../../context/FavoritesContext';
import { useRequireAuthAction } from '../../hook/useRequireAuthAction';
import {Link,useParams,useNavigate } from "react-router-dom";
import { ReactComponent as IconDelete } from './close.svg';
import { ReactComponent as IconMeat } from './meat.svg';
import { ReactComponent as IconBeetroot } from './beetroot.svg';
import { ReactComponent as IconDensity } from './vegetable.svg';
import { ReactComponent as IconSalt } from './salt.svg';
import { ReactComponent as IconAftertaste } from './aftertaste.svg';
import { ReactComponent as IconServing } from './serving.svg';
import { ReactComponent as IconArrowLeft } from './arrow_left.svg';
import { ReactComponent as IconArrowRight } from './arrow_right.svg';
import { ReactComponent as IconLike } from './like.svg';
import { ReactComponent as IconLikeActive } from './like.svg';
import { ReactComponent as IconLink } from './link.svg';
import { ButtonVertion } from "../../components/ButtonVersion";
import { RatingIconsSvg } from "../../components/RatingIconsSvg";
import { ProgressLine } from "../../components/ProgressLine/ProgressLine";
import { FotoBorschGallary } from "../../components/FotoBorschGallary";
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import { useComments } from '../../context/CommentsContext';
import { placesAPI } from '../../api';
import style from './BorschPage.module.scss';
import typography from '../../styles/typography.module.css';
import { formatGrade } from "../../utils/rating";
import { RouteButton } from "../../components/RouteButton";
import { hasRating } from "../../utils/rating";
import { useT } from "../../i18n";
import { useVenueLabel } from "../../i18n";
import { useDishLabel } from "../../i18n";


const fallbackCopy = (text) => {
  const tempInput = document.createElement("input");
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);
  console.log("Скопійовано через fallback:", text); 
};
export const BorschPage=({ borschId: propId })=>{
  const [currentPage, setCurrentPage] = useState(0); const commentsPerPage = 2;
  // Account-scoped and server-backed; see FavoritesContext.
  const { isFavorite, toggle } = useFavorites();
  const { requireAuth } = useRequireAuthAction();

  const handleToggleLike = (borschId) => {
    requireAuth(() => {
      toggle(borschId).catch((err) => console.error('Не вдалося оновити обране:', err));
    });
  };
    const params = useParams();
    const  id = propId || params?.borschId;
    // must come after `id`: on a deep link propId is undefined and the borsch
    // id arrives from the route, so keying off propId meant the heart never lit
    const isLiked = isFavorite(id);
    const navigate = useNavigate();
    const t = useT();
    const venueLabel = useVenueLabel();
    const dishLabel = useDishLabel();

    const { getBorschById, loading: borschLoading } = useBorsch();
    const { getPlaceById, loading: placesLoading } = usePlaces();
    const { getCommentsByBorschId } = useComments();

    // BUG-6r: deep-link на борщ поза вибраним містом. PlacesContext тримає
    // тільки заклади поточного міста, тож заклад цього борща може бути
    // відсутній — довантажуємо його окремо по id через placesAPI.getById.
    const borschOne = id ? getBorschById(id) : null;
    const contextPlace = borschOne ? getPlaceById(borschOne.place_id) : null;
    const missingPlaceId =
      !placesLoading && borschOne && !contextPlace ? borschOne.place_id : null;

    const [fetchedPlace, setFetchedPlace] = useState(null);
    const [placeFetchState, setPlaceFetchState] = useState('idle'); // idle | loading | done | error

    useEffect(() => {
      if (!missingPlaceId) return;

      let cancelled = false;
      setPlaceFetchState('loading');

      placesAPI.getById(missingPlaceId)
        .then((p) => {
          if (cancelled) return;
          setFetchedPlace(p);
          setPlaceFetchState('done');
        })
        .catch((err) => {
          if (cancelled) return;
          console.error('Не вдалося довантажити заклад по id:', err);
          setPlaceFetchState('error');
        });

      return () => { cancelled = true; };
    }, [missingPlaceId]);

      if (!id) {
        return (
          <div style={{ padding: 20 }}>
            <p>Не передано ID борща</p>
          </div>
        );
      }

    const place = contextPlace ||
      (fetchedPlace && borschOne && String(fetchedPlace.id) === String(borschOne.place_id)
        ? fetchedPlace
        : null);
    const borschComents = getCommentsByBorschId(id);


    if (borschLoading || placesLoading || (missingPlaceId && placeFetchState !== 'error' && !place)) {
      return (
        <div className={style.BorschPage}>
          <p>Завантаження борща...</p>
        </div>
      );
    }

    if (!borschOne || !place) {
      return (
        <div className={style.BorschPage}>
          <p>Борщ не знайдено</p>
          <button onClick={() => navigate('/')} className={style.btn}>На головну</button>
        </div>
      );
    }

    // Реальні відгуки з бекенду: імʼя автора приходить у author_username
    const result = borschComents
        .filter(comment => comment.messege && comment.messege.trim())
        .map((comment, index) => ({
            name: comment.author_username || `Користувач ${index + 1}`,
            photo: "avatar.png",
            overall_rating: comment.overall_rating,
            created_at: comment.created_at ? String(comment.created_at).slice(0, 10) : '',
            messege: comment.messege
        }));


    const paginatedComments = result.slice(
    currentPage * commentsPerPage,
    currentPage * commentsPerPage + commentsPerPage
    );

    const totalPages = Math.ceil(result.length / commentsPerPage);

    const handleNext = () => {
    setCurrentPage((prev) => Math.min(prev + 1, totalPages - 1));
    };

    const handlePrev = () => {
    setCurrentPage((prev) => Math.max(prev - 1, 0));
    };   
    const clickClose = () => {
        navigate("/");
    }

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
  return( 
    <div className={style.BorschPage}>       
        <div className={style.btnClose}>       
            <ButtonVertion
                type="button"
                onClick={clickClose}
                icon={IconDelete}
                label={t('card.close')}
            />
        </div>        
        <div className={style.wrap}>
            <h2 className={style.title}>{venueLabel(place.name)}</h2>
            <div className={style.card}>
                <div className={style.box}>
                    <ButtonVertion
                        type="button"
                        onClick={() => handleCopyAndShare(id)}
                        icon={IconLink}
                        label={t('card.share')}
                    />
                    <ButtonVertion
                        type="button"
                        onClick={() => handleToggleLike(id)}
                        icon={isLiked ? IconLikeActive : IconLike}
                        label={isLiked ? t('card.unlike') : t('card.like')}
                        pressed={isLiked}
                    />
                </div>                
                {borschOne && <FotoBorschGallary images={borschOne.photo_urls} height={"215px"}/>}                
                <h4 className={style.nameBorsch}>{dishLabel(borschOne.name)}</h4>
                <p className={style.adress}>{place.address || place.adress}</p>
                <div className={style.flex}>
                    <p>{borschOne.weight}</p>
                    <p>{borschOne.price}</p>
                </div>
                <h4 className={style.nameBorsch}>{t('card.rating')}</h4>
                <div className={style.flex}>
                    {hasRating(borschOne.overall_rating) ? (
                      <>
                        <p className={style.grade}>{formatGrade(borschOne.overall_rating)}</p>
                        <RatingIconsSvg overall_rating={borschOne.overall_rating} size={18}/>
                      </>
                    ) : (
                      <p className={style.grade}>{t('card.noRatings')}</p>
                    )}
                    <p className={typography.mobileCaption}>{borschComents.length} Reviews</p>
                </div>
                <div className={style.gradesFlex}>
                    <ProgressLine title={t('rate.meat')} value={borschOne.rating_meat} icon={IconMeat}/>
                    <ProgressLine title={t('rate.beetroot')} value={borschOne.rating_beet} icon={IconBeetroot}/>
                    <ProgressLine title={t('rate.density')} value={borschOne.rating_density} icon={IconDensity}/>
                    <ProgressLine title={t('rate.salt')} value={borschOne.rating_salt} icon={IconSalt}/>
                    <ProgressLine title={t('rate.aftertaste')} value={borschOne.rating_aftertaste} icon={IconAftertaste}/>
                    <ProgressLine title={t('rate.serving')} value={borschOne.rating_serving} icon={IconServing}/>
                </div> 
                <div className={style.boxBtn}>
                    <RouteButton place={place} label={t('card.routeLong')} className={style.routeBtn}/>
                    <Link to={`/borsch/${id}/evaluations`} className={style.btn}>{t('card.rate')}</Link>
                </div>
                <div className={style.comentsBox}>
                   { paginatedComments.map((item, index) => (
                        <div key={index}>
                            <div className={style.avatarBox}>
                                <div className={style.photoBox}>
                                    <img
                                    src={`/${item.photo}`}
                                    alt={`${item.name}`}
                                    className={style.photoStyle}
                                    />
                                </div>
                                <div className={style.textWrapp}>
                                    <div className={style.textBox}>
                                        <h4 className={style.textAvatar}>{item.name}</h4>
                                        <p className={style.textDate}>{item.created_at}</p>
                                    </div>
                                    <RatingIconsSvg overall_rating={item.overall_rating} size={15}/>
                                </div>
                            </div>
                            <p>{item.messege}</p>
                        </div>
                    ))} 
                    {totalPages > 1 && (
                        <div className={style.paginationControls}>
                            <button onClick={handlePrev} disabled={currentPage === 0} >
                                <IconArrowLeft/>
                            </button>                            
                            <button onClick={handleNext} disabled={currentPage === totalPages - 1}>
                                <IconArrowRight/>
                            </button>
                        </div>
                    )}                 
                </div>                          
            </div>  
        </div>                     
    </div>   
  )   
}