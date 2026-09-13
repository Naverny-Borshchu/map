import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useLocation, useMatch } from "react-router-dom";
import { ReactComponent as IconAddMob } from './addActiveMob.svg';
import { ReactComponent as IconAddDesctop } from './addActiveDesctop.svg';
import { ReactComponent as IconAcount } from './acount.svg';
import { ReactComponent as IconAcountActive } from './acountActive.svg';
import { ReactComponent as IconLinkedIn} from './linked.svg';
import { ReactComponent as IconInstagram} from './akar-icons_instagram-fill.svg';
import { MODES } from '../../components/Map/Map';
import { useMediaQuery } from "../../hook/useMediaQuery";
import { MapPage } from "../../page/MapPage";
import { ListPage } from "../../page/ListPage";
import { BorschPage} from "../../page/BorschPage";
import {EvaluationsPage} from "../../page/EvaluationsPage";
import { Filters } from '../../components/Filters/Filters';
import { hasFullscreenMap } from "../../variant";
import { Onboarding } from "../Onboarding";
import { useUser } from "../../context/UserContext";
import { ViewSwapIcon } from "./ViewSwapIcon";
import { BugReport } from "../BugReport";

import style from "./Layout.module.scss";
import { useT } from "../../i18n";

// Three tabs: [map/list] | + | [Ви].
//
// The A/B between a wide pair (Мапа, Обране | + | Відгуки, Ви) and a narrow one
// is over — Andrii picked three. The first tab is no longer a destination but a
// switch between the map and the list, which retires the segmented "Мапа |
// Список" control that used to float over the map and spend width naming the
// view you were already looking at. Обране and Відгуки moved into Ви.

export const Layout = ({ children }) => {
  const t = useT();
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const { isAuthenticated } = useUser();
  const location = useLocation();
  const matchBorsch = useMatch("/borsch/:borschId");  
  const matchBorschEvaluations = useMatch("/borsch/:borschId/evaluations");
  // the map/list tab is a switch, so it needs to know which side it is on
  const onList = location.pathname === '/list';
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(
    () => localStorage.getItem('sidebarCollapsed') === '1'
  );

  // Full-screen variants float their controls above the bottom nav. Publish the
  // nav's measured height as --nb-nav-h so those offsets stay exact instead of
  // guessing at a number that drifts with font size and safe-area insets.
  useEffect(() => {
    if (!hasFullscreenMap) return undefined;

    const publishViewport = () => {
      const h = Math.round(window.innerHeight);
      if (h > 0) document.documentElement.style.setProperty('--nb-vh', `${h}px`);
    };

    publishViewport();
    window.addEventListener('resize', publishViewport);
    window.addEventListener('orientationchange', publishViewport);
    // fires the moment the toolbar collapses, before any resize settles
    window.visualViewport?.addEventListener('resize', publishViewport);
    return () => {
      window.removeEventListener('resize', publishViewport);
      window.removeEventListener('orientationchange', publishViewport);
      window.visualViewport?.removeEventListener('resize', publishViewport);
    };
  }, []);

  const navRef = useRef(null);
  useEffect(() => {
    if (!hasFullscreenMap) return;
    const el = navRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;

    const publish = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      if (h > 0) {
        document.documentElement.style.setProperty('--nb-nav-h', `${h}px`);
      }
    };

    publish();
    const ro = new ResizeObserver(publish);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('sidebarCollapsed', next ? '1' : '0');
      return next;
    });
  };

  // Desktop map view: collapsible sidebar (list/borsch panel) next to the map
  const renderSplit = (sidebarContent) => (
    <div
      className={`${style.split} ${isSidebarCollapsed ? style.splitCollapsed : ''}`}
    >
      <aside className={style.sidebarPanel} aria-hidden={isSidebarCollapsed}>
        {sidebarContent}
      </aside>
      <div className={style.mapPanel}>
        <button
          type="button"
          className={style.sidebarToggle}
          onClick={toggleSidebar}
          aria-label={isSidebarCollapsed ? 'Розгорнути панель' : 'Згорнути панель'}
          title={isSidebarCollapsed ? 'Розгорнути панель' : 'Згорнути панель'}
        >
          {isSidebarCollapsed ? '›' : '‹'}
        </button>
        <MapPage />
      </div>
    </div>
  );

  return (
    <div className={`${style.container} nb-shell`}>
      <Onboarding />
      <main className={`${style.main} nb-main`}>
        {isDesktop ? (
          <>
            {location.pathname === "/" && renderSplit(<ListPage />)}

            {matchBorsch && !matchBorschEvaluations &&
              renderSplit(<BorschPage borschId={matchBorsch.params.borschId} />)}

            {matchBorschEvaluations &&
              renderSplit(
                <EvaluationsPage borschId={matchBorschEvaluations.params.borschId} />
              )}

            {/* 🔹 По умолчанию — показываем children, чтобы работали все другие маршруты */}
            {!(
              location.pathname === "/" ||
              matchBorsch ||
              matchBorschEvaluations
            ) && children}
          </>
        ) : (
          children
        )}
      </main>
      <header ref={navRef} className={`${style.header} nb-bottomnav`}>
          {/* Desktop: "Фільтри" / "За рейтингом" buttons follow the list panel —
              visible only on "/" while the list sidebar is expanded (Yuliia, 2026-07-03) */}
          {isDesktop && (
            <Filters
              hideBoxFilter={location.pathname !== "/" || isSidebarCollapsed}
            />
          )}
        <nav>
          <ul className={style.navContainer}>
            {/* One tap swaps map ⇄ list. The label and glyph name the view you
                are about to get, and the arrows say you can tap back. */}
            <li>
              <NavLink
                to={onList ? '/' : { pathname: '/list', search: location.search }}
                className={`${style.link} nb-navlink ${style.active}`}
                aria-label={onList ? t('nav.showMap') : t('nav.showList')}
                onClick={() => localStorage.setItem('mode', MODES.MOVE)}
              >
                <span className={`${style.icon} nb-navicon`}>
                  <ViewSwapIcon to={onList ? 'map' : 'list'} />
                </span>
                <span className={`${style.text} nb-navtext`}>
                  {onList ? t('nav.map') : t('map.list')}
                </span>
              </NavLink>
            </li>

            <li>
              {!isDesktop && <NavLink
                to="/add-borsch"
                className={`${style.addBorsch} nb-addbtn`}
                aria-label={t('nav.addBorsch')}
                onClick={() => localStorage.setItem('mode', MODES.SET_MARKER)}
              >
                <IconAddMob/>                
              </NavLink>}
              {isDesktop && <NavLink
                to="/add-borsch"
                className={({ isActive }) =>
                  `${style.link} nb-navlink ${isActive ? style.active : ""}`
                }
                onClick={() => localStorage.setItem('mode', MODES.SET_MARKER)}
              >              
                <IconAddDesctop className={`${style.icon} nb-navicon ${style.iconDefault}`}/>
                <IconAddMob className={`${style.icon} nb-navicon ${style.iconHover}`} />               
                <span className={`${style.text} nb-navtext`}>{t('nav.addBorsch')}</span>
                </NavLink>}
            </li>
            {/* Ви carries the reviews and favourites the tabs no longer show.
                On desktop a signed-in visitor already has a clickable avatar in
                the header that goes to the same place, so the tab is a
                duplicate there (Yuliia, 2026-08-18). Guests keep it, because
                the header shows them a register button instead, and phones keep
                it always — they have no header avatar at all. */}
            {!(isDesktop && isAuthenticated) && (
            <li>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `${style.link} nb-navlink ${isActive ? style.active : ""}`
                }
              >
                <IconAcount className={`${style.icon} nb-navicon ${style.iconDefault}`} />
                <IconAcountActive
                  className={`${style.icon} nb-navicon ${style.iconHover}`}
                />
                <span className={`${style.text} nb-navtext`}>{t('nav.you')}</span>
              </NavLink>
            </li>
            )}

            {/* Жучок стоїть останнім і навмисно в тій самій смузі, що й
                навігація: це єдина частина екрана, яка не зникає ні на мапі,
                ні всередині оцінювання, а скарга потрібна саме там, де щось
                зламалось. Ховати її в профіль означало б просити людину
                спершу знайти шлях у застосунку, який щойно не спрацював. */}
            <li>
              <BugReport />
            </li>
          </ul>
        </nav>
        <div className={style.boxContact}>
          <h3 className={style.title}>{t('layout.socialTitle')}</h3>
          <div className={style.boxText}>
            <p>{t('layout.socialLine1')}</p>
            <p>{t('layout.socialLine2')}</p>
          </div>
          
          <div  className={style.boxSocio}>
            <a
              href="https://www.instagram.com/naverny_borshchu/"
              target="_blank"
              rel="noopener noreferrer"
              className={style.socialLink}
            >
              <IconInstagram className={style.social} />
            </a>
            <a
              href="https://www.linkedin.com/company/naverny-borshchu/"
              target="_blank"
              rel="noopener noreferrer"
              className={style.socialLink}              
            >
              <IconLinkedIn  className={style.social} />                            
            </a> 
                  
          </div>
        </div>        
      </header>
    </div>
  );
};
