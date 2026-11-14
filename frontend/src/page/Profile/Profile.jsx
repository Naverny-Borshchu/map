import {useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ButtonProfile} from '../../components/ButtonProfile';
import {ModalPleaseRegister} from "../../components/ModalPleaseRegister/ModalPleaseRegister";
import plateUrl from '../../assets/images/plate.svg';
import heroArt from '../../assets/illustrations/hero.webp';
import {
    IconHeart, IconBowl, IconPerson, IconSpoonPlus, IconLock, IconLogout,
    IconInfo, IconHelp, IconDoc, IconChevronRight,
} from '../../components/Icons';
import {useMediaQuery} from "../../hook/useMediaQuery";
import layout from '../../styles/layout.module.scss';
import style from './Profile.module.scss';
import {ModalLogout} from "../../components/ModalLogout";
import {ThemeToggle} from "../../components/ThemeToggle";
import {LanguageToggle} from "../../components/LanguageToggle";
import {BugReport} from "../../components/BugReport";
import {PageHeader} from "../../components/PageHeader";
import {PersonalInfo} from "../PersonalInfo";
import {AddedBorschesPage} from "../AddedBorschesPage";
import {PasswordChangePage} from "../PasswordChangePage";
import {useT} from "../../i18n";
import {selectProfileLinks} from "./profileLinks";


export const Profile = () => {
    const [activeButton, setActiveButton] = useState('profile'); // 'settings'
    const [showModal, setShowModal] = useState(false);
    const navigate = useNavigate();
    const t = useT();
    const isDesktop = useMediaQuery("(min-width: 1280px)");

    const personalRef = useRef(null);
    const borschesRef = useRef(null);
    const passwordRef = useRef(null);

    const user = JSON.parse(localStorage.getItem('userProfile'));

    if (!user) {
        return (
            <ModalPleaseRegister
                asPage
                onClose={() => navigate('/')}
                onRegisterPage={() => navigate('/register')}
                onLoginPage={() => navigate('/login')}
                onGoToMap={() => navigate('/')}
            />
        );
    }

    const linksForProfileBtn = [
        // Обране and Відгуки are no longer bottom-nav tabs; Ви is where they live.
        {path: '/favorite', label: t('nav.favourites'), icon: IconHeart},
        {path: '/reviews', label: t('profile.myReviews'), icon: IconBowl},
        {path: '/profile/personal-information', label: t('profile.personalInfo'), icon: IconPerson},
        {path: '/profile/added-borsches', label: t('profile.addedBorsches'), icon: IconSpoonPlus},
        {path: '/profile/change-password', label: t('profile.password'), icon: IconLock},
        {label: t('profile.logout'), icon: IconLogout, type: 'button'},
    ];

    const linksForSettingsBtn = [
        {path: 'https://navernyborshchu.com/', label: t('profile.about'), icon: IconInfo},
        {path: '/help', label: t('profile.help'), icon: IconHelp},
        // BUG-15r: реальна політика живе на лендінгу; /faq це FAQ, не політика
        {path: 'https://navernyborshchu.com/privacy-policy.html', label: t('profile.privacy'), icon: IconDoc},
    ]

    const activeLinks = selectProfileLinks({
        isDesktop: false,
        activeButton,
        profileLinks: linksForProfileBtn,
        settingsLinks: linksForSettingsBtn,
    });
    const desktopLinks = selectProfileLinks({
        isDesktop: true,
        activeButton,
        profileLinks: linksForProfileBtn,
        settingsLinks: linksForSettingsBtn,
    });

    const handleOpenModal = () => setShowModal(true);
    const handleCloseModal = () => setShowModal(false);

    const handleLogoutSuccess = () => {
        setShowModal(false);
        navigate("/login");
    };

    const handleLinkNavigation = (path, label) => {
        if (path?.startsWith('https://')) {
            window.open(path, '_blank', 'noopener,noreferrer');
            return;
        }

        // Match on the route, not the visible label: the label is translated,
        // so in English every one of these fell through to navigate() instead
        // of scrolling to the section that is already on screen.
        const section = {
            '/profile/personal-information': personalRef,
            '/profile/added-borsches': borschesRef,
            '/profile/change-password': passwordRef,
        }[path];
        if (section) {
            scrollToBlock(section);
            return;
        }

        if (path) {
            navigate(path);
        }
    };

    const scrollToBlock = (ref) => {
        if (ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };


    const row = ({path, label, icon: Icon, type}) => {
        const inner = (
            <>
                <span className={style.linkGroup}>
                    <span className={style.linkIcon} aria-hidden="true"><Icon size={22} /></span>
                    <span className={style.linkLabel}>{label}</span>
                </span>
                {type !== 'button' && <span className={style.arrow} aria-hidden="true"><IconChevronRight /></span>}
            </>
        );
        if (type === 'button') {
            return (
                <button key={label} type="button" onClick={handleOpenModal} className={`${style.linkWrap} ${style.danger}`}>
                    {inner}
                </button>
            );
        }
        if (isDesktop) {
            return (
                <button key={label} type="button" onClick={() => handleLinkNavigation(path, label)} className={style.linkWrap}>
                    {inner}
                </button>
            );
        }
        if (path?.startsWith('https://')) {
            return (
                <a key={path} href={path} target="_blank" rel="noopener noreferrer" className={style.linkWrap}>
                    {inner}
                </a>
            );
        }
        return (
            <Link key={path} to={path} className={style.linkWrap}>
                {inner}
            </Link>
        );
    };

    const userCard = (
        <div className={style.userHeader}>
            <img
                className={style.avatar}
                src={user.picture || plateUrl}
                alt=""
                onError={(e) => { e.target.src = plateUrl; }}
            />
            <div className={style.userWords}>
                <h2 className={style.userName}>{user.given_name || user.name}</h2>
                <p className={style.userEmail}>{user.email}</p>
            </div>
        </div>
    );

    const advert = (
        <div className={style.advertBanner}>
            <div className={style.advertText}>
                <h3 className={style.advertHeader}>{t('profile.advertTitle')}</h3>
                <p className={style.advertSub}>{t('profile.advertText')}</p>
            </div>
            <img className={style.advertArt} src={heroArt} alt="" width="560" height="560" />
        </div>
    );

    return (
        <div className={`${layout.wrapper} ${style.page}`}>
            {isDesktop ? (
                <div className={style.desktopContainer}>
                    <aside className={style.sidebar}>
                        <PageHeader kicker={t('profile.kicker')} title={t('profile.title')} />
                        {userCard}
                        <nav className={style.linksContainer}>
                            {desktopLinks.map(row)}
                            <BugReport variant="row" className={style.bugRow} />
                        </nav>
                    </aside>

                    <section className={style.content}>
                        {advert}

                        <div className={style.settingsCard}>
                            <h2 className={style.sectionTitle}>{t('profile.settingsTitle')}</h2>
                            <div className={style.themeRow}><ThemeToggle/></div>
                            <div className={style.themeRow}><LanguageToggle/></div>
                        </div>

                        <div ref={personalRef}>
                            <PersonalInfo/>
                        </div>

                        <div ref={borschesRef}>
                            <AddedBorschesPage/>
                        </div>

                        <div ref={passwordRef}>
                            <PasswordChangePage/>
                        </div>
                    </section>
                </div>
            ) : (
                <>
                    <PageHeader back="/" kicker={t('profile.kicker')} title={t('profile.title')} />
                    {userCard}
                    {advert}

                    <div className={style.userButtons} role="tablist">
                        <ButtonProfile
                            name={t('profile.tabProfile')}
                            active={activeButton === 'profile'}
                            onClick={() => setActiveButton('profile')}
                        />
                        <ButtonProfile
                            name={t('profile.tabSettings')}
                            active={activeButton === 'settings'}
                            onClick={() => setActiveButton('settings')}
                        />
                    </div>

                    {activeButton === 'settings' && (
                        <div className={style.settingsCard}>
                            <div className={style.themeRow}><ThemeToggle/></div>
                            <div className={style.themeRow}><LanguageToggle/></div>
                        </div>
                    )}

                    <nav className={style.linksContainer}>
                        {activeLinks.map(row)}
                        {/* NAV-203: the bug report left the tab bar for here and Help. */}
                        {activeButton === 'settings' && <BugReport variant="row" className={style.bugRow} />}
                    </nav>
                </>)}

            {showModal && <ModalLogout
                onClose={handleCloseModal}
                onLogoutSuccess={handleLogoutSuccess}
            />}
        </div>
    );
}
