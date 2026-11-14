import { useState, useEffect } from "react";
import { useFavorites } from '../../context/FavoritesContext';
import { useRequireAuthAction } from '../../hook/useRequireAuthAction';
import {Link,useParams,useNavigate } from "react-router-dom";
import { ReactComponent as IconMeat } from './meat.svg';
import { ReactComponent as IconBeetroot } from './beetroot.svg';
import { ReactComponent as IconDensity } from './vegetable.svg';
import { ReactComponent as IconSalt } from './salt.svg';
import { ReactComponent as IconAftertaste } from './aftertaste.svg';
import { ReactComponent as IconServing } from './serving.svg';
import { IconClose, IconHeart, IconShare, IconChevronLeft, IconChevronRight, IconMapPin } from "../../components/Icons";
import { EmptyState } from "../../components/EmptyState";
import { shareBorsch } from "../../utils/share";
import { priceLabel, weightLabel } from "../../utils/price";
import { RatingIconsSvg } from "../../components/RatingIconsSvg";
import { ProgressLine } from "../../components/ProgressLine/ProgressLine";
import { FotoBorschGallary } from "../../components/FotoBorschGallary";
import { useBorsch } from '../../context/BorschContext';
import { usePlaces } from '../../context/PlacesContext';
import { useComments } from '../../context/CommentsContext';
import { placesAPI } from '../../api';
import style from './BorschPage.module.scss';
import { formatGrade } from "../../utils/rating";
import { RouteButton } from "../../components/RouteButton";
import { VenueReport } from '../../components/VenueReport';
import { hasRating } from "../../utils/rating";
import { useT } from "../../i18n";
import { useVenueLabel } from "../../i18n";
import { useDishLabel } from "../../i18n";
import { useCityLabel } from "../../i18n";


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
    const cityLabel = useCityLabel();

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
          <div className={style.BorschPage}>
            <EmptyState art="spoon" title={t('borsch.noId')} action={{ to: '/', label: t('common.toMap') }} />
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
          <EmptyState loading title={t('borsch.loading')} />
        </div>
      );
    }

    if (!borschOne || !place) {
      return (
        <div className={style.BorschPage}>
          <EmptyState
            art="spoon"
            title={t('borsch.notFound')}
            text={t('borsch.notFoundText')}
            action={{ onClick: () => navigate('/'), label: t('common.toMap') }}
          />
        </div>
      );
    }

    // Реальні відгуки з бекенду: імʼя автора приходить у author_username
    const result = borschComents
        .filter(comment => comment.messege && comment.messege.trim())
        .map((comment, index) => ({
            name: comment.author_username || t('borsch.userFallback', { n: index + 1 }),
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

  const rated = hasRating(borschOne.overall_rating);
  const price = priceLabel(borschOne.price, t);
  const weight = weightLabel(borschOne.weight, t);

  return(
    <div className={style.BorschPage}>
        {/* Photo first, full bleed, with the actions over it: on a phone the
            borshch is what you came to see. */}
        <div className={style.hero}>
            {borschOne.photo_urls?.length ? (
              <FotoBorschGallary images={borschOne.photo_urls} height={"100%"}/>
            ) : (
              <div className={style.heroEmpty} aria-hidden="true" />
            )}
            <div className={style.heroBar}>
                <button type="button" className={style.roundBtn} onClick={clickClose} aria-label={t('card.close')}>
                    <IconClose />
                </button>
                <div className={style.heroActions}>
                    <button type="button" className={style.roundBtn} onClick={() => shareBorsch(id, t)} aria-label={t('card.share')}>
                        <IconShare />
                    </button>
                    <button
                        type="button"
                        className={`${style.roundBtn} ${style.like} ${isLiked ? style.liked : ''}`}
                        onClick={() => handleToggleLike(id)}
                        aria-pressed={isLiked}
                        aria-label={isLiked ? t('card.unlike') : t('card.like')}
                    >
                        <IconHeart filled={isLiked} />
                    </button>
                </div>
            </div>
        </div>

        <div className={style.wrap}>
            {place.city && <p className={style.kicker}>{cityLabel(place.city)}</p>}
            <h1 className={style.title}>{venueLabel(place.name)}</h1>
            <p className={style.dish}>{dishLabel(borschOne.name)}</p>

            {(weight || price) && (
              <div className={style.facts}>
                {weight && <span className={style.fact}><small>{t('borsch.portion')}</small>{weight}</span>}
                {price && <span className={style.fact}><small>{t('borsch.price')}</small>{price}</span>}
              </div>
            )}

            <p className={style.adress}>
                <IconMapPin size={18} />
                <span>{place.address || place.adress}</span>
            </p>
            {/* Двоє людей у першу годину запуску написали в чат те саме:
                поруч на мапі стоять місця, яких давно нема, і одне, що
                переїхало. Сказати про це в самому застосунку не було де.
                Рядок стоїть саме під адресою: там людина й помічає, що адреса
                застаріла. */}
            <VenueReport
              placeLabel={venueLabel(place.name)}
              placeName={place.name}
              placeId={place.id || place.place_id}
              borschId={id}
            />

            <section className={style.scoreCard} aria-label={t('card.rating')}>
                <p className={style.scoreLabel}>{t('card.rating')}</p>
                <div className={style.scoreRow}>
                    {rated ? (
                      <>
                        <p className={style.grade}>{formatGrade(borschOne.overall_rating)}</p>
                        <RatingIconsSvg overall_rating={borschOne.overall_rating} size={18}/>
                      </>
                    ) : (
                      <p className={style.gradeEmpty}>{t('card.noRatings')}</p>
                    )}
                </div>
                <p className={style.reviewCount}>{t('card.reviewCount', { count: borschComents.length })}</p>

                <div className={style.boxBtn}>
                    <Link to={`/borsch/${id}/evaluations`} className={style.btn}>{t('card.rate')}</Link>
                    <RouteButton place={place} label={t('card.routeLong')} className={style.routeBtn}/>
                </div>
            </section>

            <section className={style.criteria}>
                <h2 className={style.sectionTitle}>{t('borsch.criteria')}</h2>
                <div className={style.gradesFlex}>
                    <ProgressLine title={t('rate.meat')} value={borschOne.rating_meat} icon={IconMeat}/>
                    <ProgressLine title={t('rate.beetroot')} value={borschOne.rating_beet} icon={IconBeetroot}/>
                    <ProgressLine title={t('rate.density')} value={borschOne.rating_density} icon={IconDensity}/>
                    <ProgressLine title={t('rate.salt')} value={borschOne.rating_salt} icon={IconSalt}/>
                    <ProgressLine title={t('rate.aftertaste')} value={borschOne.rating_aftertaste} icon={IconAftertaste}/>
                    <ProgressLine title={t('rate.serving')} value={borschOne.rating_serving} icon={IconServing}/>
                </div>
            </section>

            {paginatedComments.length > 0 && (
            <section className={style.comentsBox}>
                <h2 className={style.sectionTitle}>{t('borsch.reviewsTitle')}</h2>
                   { paginatedComments.map((item, index) => (
                        <article key={index} className={style.review}>
                            <div className={style.avatarBox}>
                                <div className={style.photoBox}>
                                    <img
                                    src={`/${item.photo}`}
                                    alt=""
                                    className={style.photoStyle}
                                    />
                                </div>
                                <div className={style.textWrapp}>
                                    <div className={style.textBox}>
                                        <h3 className={style.textAvatar}>{item.name}</h3>
                                        <p className={style.textDate}>{item.created_at}</p>
                                    </div>
                                    <RatingIconsSvg overall_rating={item.overall_rating} size={14}/>
                                </div>
                            </div>
                            <p className={style.reviewText}>{item.messege}</p>
                        </article>
                    ))}
                    {totalPages > 1 && (
                        <div className={style.paginationControls}>
                            <button onClick={handlePrev} disabled={currentPage === 0} aria-label={t('borsch.prevReviews')}>
                                <IconChevronLeft/>
                            </button>
                            <span className={style.pageNum}>{currentPage + 1}/{totalPages}</span>
                            <button onClick={handleNext} disabled={currentPage === totalPages - 1} aria-label={t('borsch.nextReviews')}>
                                <IconChevronRight/>
                            </button>
                        </div>
                    )}
            </section>
            )}
        </div>
    </div>
  )
}
