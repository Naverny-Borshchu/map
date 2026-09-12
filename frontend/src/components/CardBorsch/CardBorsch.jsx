import { Link, useNavigate } from "react-router-dom";
import { RatingIconsSvg } from "../../components/RatingIconsSvg";
import { ReactComponent as IconMap } from './map-pin.svg';
import { FotoBorschGallary } from "../../components/FotoBorschGallary";
import { CardActions } from "../../components/CardActions";
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';

import style from './CardBorsch.module.scss';
import { formatGrade, hasRating } from "../../utils/rating";
import { useT } from "../../i18n";
import { useVenueLabel } from "../../i18n";
import { useDishLabel } from "../../i18n";

export const CardBosch=({el,index,isActive,hideActions=false})=>{
  const navigate = useNavigate();
  const { places, selectedPlaceId, selectPlace } = usePlaces();
  const { getBorschExploration } = useBorsch();
  const exploration = getBorschExploration(el);
  const t = useT();
  const venueLabel = useVenueLabel();
  const dishLabel = useDishLabel();

  const onClickCard = (borschId) => {
    navigate(`/borsch/${borschId}`);
  };
  
  const placeOf = (place_id) => places.find(i => String(i.id) === String(place_id));

  const nameBorsch=(place_id)=>{
    const place = placeOf(place_id);
    return place ? venueLabel(place.name) : t('card.unknownPlace');
  };


    
                        
    return (
            <div 
              key={index}
              className={style.card}              
              >
                <FotoBorschGallary images={el.photo_urls} height={"210px"}/>
                {/* The popup lays these out in its own header row next to the
                    close button, so it opts out of the floating overlay. */}
                {!hideActions && <CardActions borschId={el.id_borsch} className={style.box} />}
                <h3 className={style.borschName}>{dishLabel(el.name)}</h3>                   
                <p className={style.grade}>{t('card.rating')}</p>
                {hasRating(el.overall_rating) ? (
                  <div className={style.flex}>
                        <RatingIconsSvg overall_rating={el.overall_rating} />
                        <p className={style.rating}>{formatGrade(el.overall_rating)}{el.rating_count ? <span className={style.rating_grade}> ({el.rating_count})</span> : null}</p>
                  </div>
                ) : (
                  <p className={style.noRating}>{t('card.noRatings')}</p>
                )}
                {/* "Розвідка борщу". A borsch nobody ever rated is a quest (×3
                    XP); one rated only in the founders' catalogue keeps its
                    score and asks to be confirmed (×2 XP) — claiming it was
                    never tasted would be a lie. */}
                {exploration === 'virgin' && (
                  <p className={style.exploreVirgin}>{t('explore.beFirst')}</p>
                )}
                {exploration === 'unverified' && (
                  <p className={style.exploreUnverified}>{t('explore.confirmIt')}</p>
                )}
                {exploration === 'confirmed' && el.discovered_at && (
                  <p className={style.exploreDone}>
                    {el.discovered_by
                      ? t('explore.discoveredBy', {
                          name: el.discovered_by,
                          date: new Date(el.discovered_at).toLocaleDateString('uk-UA'),
                        })
                      : t('explore.discoveredAnon', {
                          date: new Date(el.discovered_at).toLocaleDateString('uk-UA'),
                        })}
                  </p>
                )}
                <div
                    className={`${style.placeRow} ${selectedPlaceId ? String(selectedPlaceId) === String(el.place_id) ? style.placeActive : '' : ''}`}
                    style={{ cursor: 'pointer' }}
                    onClick={() => selectPlace(el.place_id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        selectPlace(el.place_id);
                      }
                    }}
                >
                    <IconMap/>
                    <p className={style.namePlace}>{nameBorsch(el.place_id)}</p>
                </div>
                <div className={style.actionRow}>
                    <button
                        className={style.btnAbout}
                        type="button"
                        onClick={() => onClickCard(el.id_borsch)}
                    >
                        <span>{t('card.about')}</span>
                    </button>
                    {/* rating is the app's primary action, so it leads */}
                    <Link
                        className={style.btnRate}
                        to={`/borsch/${el.id_borsch}/evaluations`}
                    >
                        {t('card.rate')}
                    </Link>
                </div>
            </div>
    )    
}