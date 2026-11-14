import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { useLocation, useMatch } from "react-router-dom";
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
import { IconPlus, IconUser } from "./NavIcons";
import { Toaster } from "../Toast";
import { BugReport } from "../BugReport";

import style from "./Layout.module.scss";
import { useT } from "../../i18n";

// Three slots: [map/list] | Додати борщ | [Ви].
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
          aria-label={isSidebarCollapsed ? t('layout.expandPanel') : t('layout.collapsePanel')}
          title={isSidebarCollapsed ? t('layout.expandPanel') : t('layout.collapsePanel')}
        >
          <span aria-hidden="true">{isSidebarCollapsed ? '›' : '‹'}</span>
        </button>
        <MapPage />
      </div>
    </div>
  );

  return (
    <div className={`${style.container} nb-shell`}>
      <Onboarding />
      <Toaster />
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

            {/* За замовчуванням показуємо children, щоб працювали всі інші маршрути */}
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
        <nav aria-label={t('nav.aria')}>
          {/* NAV-203 (Andrii, 10.11.2026: «дуже погано виглядає»). The bar is a
              three-column grid, 1fr | auto | 1fr, so the add action sits on
              the exact centre of the screen whatever the side labels say, and
              inside the bar rather than hanging above it. It is the brand's
              primary pill, red with the dark-red underside, with its words on
              it: a bare «+» was the one control nobody could name. The bug
              report left the bar: it is a form, not a place, and it now lives
              in Help, in the profile and in the desktop sidebar. */}
          <ul className={style.navContainer}>
            {/* One tap swaps map ⇄ list. The label and glyph name the view you
                are about to get, and the arrows say you can tap back. */}
            <li className={style.slot}>
              <NavLink
                to={onList ? '/' : { pathname: '/list', search: location.search }}
                className={`${style.link} nb-navlink`}
                aria-label={onList ? t('nav.showMap') : t('nav.showList')}
                onClick={() => localStorage.setItem('mode', MODES.MOVE)}
              >
                <span className={`${style.icon} nb-navicon`}>
                  <ViewSwapIcon to={onList ? 'map' : 'list'} size={24} />
                </span>
                <span className={`${style.text} nb-navtext`}>
                  {onList ? t('nav.map') : t('map.list')}
                </span>
              </NavLink>
            </li>

            <li className={style.slotCenter}>
              <NavLink
                to="/add-borsch"
                className={({ isActive }) =>
                  `${style.addBorsch} nb-addbtn ${isActive ? style.addActive : ''}`
                }
                onClick={() => localStorage.setItem('mode', MODES.SET_MARKER)}
              >
                <IconPlus className={style.addIcon} aria-hidden="true" />
                <span className={style.addText}>{t('nav.addBorsch')}</span>
              </NavLink>
            </li>
            {/* Ви carries the reviews and favourites the tabs no longer show.
                On desktop a signed-in visitor already has a clickable avatar in
                the header that goes to the same place, so the tab is a
                duplicate there (Yuliia, 2026-08-18). Guests keep it, because
                the header shows them a register button instead, and phones keep
                it always: they have no header avatar at all. */}
            {!(isDesktop && isAuthenticated) && (
            <li className={style.slot}>
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  `${style.link} nb-navlink ${isActive ? style.active : ""}`
                }
              >
                <span className={`${style.icon} nb-navicon`}>
                  <IconUser />
                </span>
                <span className={`${style.text} nb-navtext`}>{t('nav.you')}</span>
              </NavLink>
            </li>
            )}
          </ul>
        </nav>
        {isDesktop && (
        <div className={style.boxContact}>
          <h3 className={style.title}>{t('layout.socialTitle')}</h3>
          <p className={style.boxText}>
            {t('layout.socialLine1')} {t('layout.socialLine2')}
          </p>

          <div className={style.boxSocio}>
            <a
              href="https://www.instagram.com/naverny_borshchu/"
              target="_blank"
              rel="noopener noreferrer"
              className={style.socialLink}
              aria-label="Instagram"
            >
              <IconInstagram className={style.social} />
            </a>
            <a
              href="https://www.linkedin.com/company/naverny-borshchu/"
              target="_blank"
              rel="noopener noreferrer"
              className={style.socialLink}
              aria-label="LinkedIn"
            >
              <IconLinkedIn className={style.social} />
            </a>
          </div>
          <BugReport variant="link" />
        </div>
        )}
      </header>
    </div>
  );
};
