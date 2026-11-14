import {useNavigate} from "react-router-dom";
import {useRef} from "react";
import {BorschTile} from "../../components/BorschTile";
import {EmptyState} from "../../components/EmptyState";
import {PageHeader} from "../../components/PageHeader";
import {IconChevronLeft, IconChevronRight} from "../../components/Icons";
import {useMediaQuery} from "../../hook/useMediaQuery";
import {useBorsch} from "../../context/BorschContext";
import {useFavorites} from "../../context/FavoritesContext";
import {useRequireAuthAction} from "../../hook/useRequireAuthAction";
import {useT} from "../../i18n";
import layout from '../../styles/layout.module.scss';
import style from "./AddedBorschesPage.module.scss";

export const AddedBorschesPage = () => {
    const t = useT();
    const isDesktop = useMediaQuery("(min-width: 1280px)");
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
            <PageHeader back={isDesktop ? undefined : '/profile'} kicker={t('profile.kicker')} title={t('profile.addedBorsches')}>
                {/* only desktop: the section scrolls sideways there */}
                <div className={style.arrows}>
                    <button type="button" onClick={scrollLeft} aria-label={t('card.prevBorschList')}><IconChevronLeft /></button>
                    <button type="button" onClick={scrollRight} aria-label={t('card.nextBorschList')}><IconChevronRight /></button>
                </div>
            </PageHeader>

            {loading && <EmptyState loading title={t('added.loading')} compact />}
            {!loading && borsch.length === 0 && (
                <EmptyState art="spoon" title={t('added.empty')} action={{ to: '/add-borsch', label: t('nav.addBorsch') }} />
            )}

            <div className={style.wrapBorsch} ref={sliderRef}>
                {borsch.map((el) => (
                    <BorschTile
                        key={el.id_borsch}
                        borsch={el}
                        venueName={el.place_name}
                        liked={isFavorite(el.id_borsch)}
                        onToggleLike={() => toggleLike(el.id_borsch)}
                        onOpen={() => onClickCard(el.id_borsch)}
                    />
                ))}
            </div>
        </div>
    );
}
