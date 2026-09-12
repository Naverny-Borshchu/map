import {Link, useNavigate} from "react-router-dom";
import {useRef} from "react";
import {FotoBorschGallary} from "../../components/FotoBorschGallary";
import {ButtonVertion} from "../../components/ButtonVersion";
import {RatingIconsSvg} from "../../components/RatingIconsSvg";
import { ReactComponent as IconLikeActive } from '../../assets/icons/likeActive.svg';
import { ReactComponent as IconDitail } from '../../assets/icons/ditail.svg';
import { ReactComponent as IconLink } from '../../assets/icons/link.svg';
import { ReactComponent as IconBack } from '../../assets/icons/arrow_back.svg';
import {useBorsch} from "../../context/BorschContext";
import {useFavorites} from "../../context/FavoritesContext";
import {useRequireAuthAction} from "../../hook/useRequireAuthAction";
import {useT} from "../../i18n";
import layout from '../../styles/layout.module.scss';
import typography from "../../styles/typography.module.css";
import style from "./AddedBorschesPage.module.scss";

export const AddedBorschesPage = () => {
    const t = useT();
    const navigate = useNavigate();
    const sliderRef = useRef(null);
    // Real catalogue from the API (same source as the map and borsch pages).
    // The page used to render src/data/borsch.json, whose photo_urls were bare
    // mock filenames ("image1.png") that resolve to nowhere — hence the empty
    // grey photo frames.
    const { borsch, loading } = useBorsch();
    const { isFavorite, toggle } = useFavorites();
    const { requireAuth } = useRequireAuthAction();

    const onClickCard = (borschId) => {
        navigate(`/borsch/${borschId}`);
    };

    // Same share flow as the favourites page: native share sheet when the
    // browser has one, clipboard fallback otherwise.
    const handleShare = (borschId) => {
        const url = `${window.location.origin}/borsch/${borschId}`;
        if (navigator.share) {
            navigator.share({
                title: t('card.shareTitle'),
                text: t('card.shareText'),
                url,
            }).catch(() => {});
            return;
        }
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(url).then(() => alert(t('card.shareCopied')));
        }
    };

    const toggleLike = (borschId) => {
        requireAuth(() => {
            toggle(borschId).catch((error) =>
                console.error('Не вдалося оновити обране:', error));
        });
    };

    const scrollLeft = () => {
        sliderRef.current.scrollBy({ left: -300, behavior: "smooth" });
    };

    const scrollRight = () => {
        sliderRef.current.scrollBy({ left: 300, behavior: "smooth" });
    };

    return (
        <div className={`${layout.wrapper} ${style.desktopWrapper}`}>
            <h1 className={typography.mobileTitle}>{t('profile.addedBorsches')}</h1>
            <Link className={style.back} to={`/profile`}><IconBack/></Link>

            {/* only desktop */}
            <div className={style.arrows}>
                <button onClick={scrollLeft} aria-label={t('card.prevBorschList')}>&lt;</button>
                <button onClick={scrollRight} aria-label={t('card.nextBorschList')}>&gt;</button>
            </div>

            {loading && <p className={style.status}>{t('added.loading')}</p>}
            {!loading && borsch.length === 0 && (
                <p className={style.status}>{t('added.empty')}</p>
            )}

            <div className={style.wrapBorsch} ref={sliderRef}>
                {borsch.map((el) => {
                    const isLiked = isFavorite(el.id_borsch);
                    return (
                        <div key={el.id_borsch} className={style.card}>
                            <FotoBorschGallary images={el.photo_urls} height={"120px"}/>
                            <div className={style.box}>
                                <ButtonVertion
                                    type="button"
                                    label={t('card.share')}
                                    onClick={() => handleShare(el.id_borsch)}
                                    icon={IconLink}
                                />
                                <span className={isLiked ? '' : style.likeInactive}>
                                    <ButtonVertion
                                        type="button"
                                        label={isLiked ? t('card.unlike') : t('card.like')}
                                        onClick={() => toggleLike(el.id_borsch)}
                                        icon={IconLikeActive}
                                    />
                                </span>
                            </div>
                            <div className={style.flex}>
                                <p className={style.borschName}>{el.name}</p>
                                <p className={style.borschPrice}>{el.price}</p>
                            </div>
                            <RatingIconsSvg overall_rating={el.overall_rating}/>
                            <div className={style.flex}>
                                <p>{el.place_name || t('card.unknownPlace')}</p>
                                <ButtonVertion
                                    type="button"
                                    label={t('card.about')}
                                    onClick={() => onClickCard(el.id_borsch)}
                                    icon={IconDitail}
                                />
                            </div>

                        </div>
                    )
                })}
            </div>
        </div>
    );
}
