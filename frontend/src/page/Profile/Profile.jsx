import {useRef, useState} from 'react';
import {Link, useNavigate} from 'react-router-dom';
import {ButtonProfile} from '../../components/ButtonProfile';
import {ModalPleaseRegister} from "../../components/ModalPleaseRegister/ModalPleaseRegister";
import {ReactComponent as IconBack} from '../../assets/icons/arrow_back.svg';
import {useMediaQuery} from "../../hook/useMediaQuery";
import Logo from '../../assets/images/logo.svg';
import advertIcon from '../../assets/images/profile-advert-img.png';
import personalInfoIcon from '../../assets/images/profile-personal-icon.png';
import reviewsIcon from '../../components/Layout/comment.svg';
import favouritesIcon from '../../components/Layout/like.svg';
import addedBorshchIcon from '../../assets/images/profile-added-borshch-icon.png';
import passwordIcon from '../../assets/images/profile-password-icon.png';
import logoutIcon from '../../assets/images/profile-logout-icon.png';
import aboutIcon from '../../assets/images/profile-info-icon.png';
import helpIcon from '../../assets/images/profile-help-icon.png';
import policyIcon from '../../assets/images/profile-policy-icon.png';
import arrowIcon from '../../assets/images/profile-arrow-icon.png';
import layout from '../../styles/layout.module.scss';
import typography from '../../styles/typography.module.css';
import style from './Profile.module.scss';
import {ModalLogout} from "../../components/ModalLogout";
import {ThemeToggle} from "../../components/ThemeToggle";
import {LanguageToggle} from "../../components/LanguageToggle";
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
                onGoToMap={() => navigate('/')}
            />
        );
    }

    const linksForProfileBtn = [
        // Обране and Відгуки are no longer bottom-nav tabs; Ви is where they live.
        {path: '/favorite', label: t('nav.favourites'), icon: favouritesIcon},
        {path: '/reviews', label: t('profile.myReviews'), icon: reviewsIcon},
        {path: '/profile/personal-information', label: t('profile.personalInfo'), icon: personalInfoIcon},
        {path: '/profile/added-borsches', label: t('profile.addedBorsches'), icon: addedBorshchIcon},
        {path: '/profile/change-password', label: t('profile.password'), icon: passwordIcon},
        {label: t('profile.logout'), icon: logoutIcon, type: 'button'},
    ];

    const linksForSettingsBtn = [
        {path: 'https://navernyborshchu.com/', label: t('profile.about'), icon: aboutIcon},
        {path: '/help', label: t('profile.help'), icon: helpIcon},
        // BUG-15r: реальна політика живе на лендінгу; /faq — це FAQ, не політика
        {path: 'https://navernyborshchu.com/privacy-policy.html', label: t('profile.privacy'), icon: policyIcon},
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


    return (
        <div className={layout.wrapper}>
            {isDesktop ? (
                // 🔹 Десктопна версія
                <div className={style.desktopContainer}>
                    <aside className={style.sidebar}>
                        <h1 className={typography.mobileTitle}>{t('profile.title')}</h1>
                        <div className={style.linksContainer}>
                            {desktopLinks.map(({path, label, icon, type}) =>
                                type === 'button' ? (
                                    <button
                                        key={label}
                                        onClick={handleOpenModal}
                                        className={style.linkWrap}
                                    >
                                        <div className={style.linkGroup}>
                                            <img src={icon} alt="Logout"/>
                                            <span className={typography.mobileBody}>{label}</span>
                                        </div>
                                    </button>
                                ) : (
                                    <button
                                        key={label}
                                        onClick={() => handleLinkNavigation(path, label)}
                                        className={style.linkWrap}
                                    >
                                        <div className={style.linkGroup}>
                                            <img src={icon} alt={label}/>
                                            <span className={typography.mobileBody}>{label}</span>
                                        </div>
                                    </button>
                                )
                            )}
                        </div>


                        {/*<div className={style.linksContainer}>*/}
                        {/*    {otherLinks.map(({label, icon, type}) =>*/}
                        {/*        type === 'button' ? (*/}
                        {/*            <button*/}
                        {/*                key={label}*/}
                        {/*                onClick={handleOpenModal}*/}
                        {/*                className={style.linkWrap}*/}
                        {/*            >*/}
                        {/*                <div className={style.linkGroup}>*/}
                        {/*                    <img src={logoutLink.icon} alt="Logout"/>*/}
                        {/*                    <span className={typography.mobileBody}>{logoutLink.label}</span>*/}
                        {/*                </div>*/}
                        {/*            </button>*/}
                        {/*        ) : (*/}
                        {/*            <button*/}
                        {/*                key={label}*/}
                        {/*                onClick={() => {*/}
                        {/*                    // change the active block depending on the label*/}
                        {/*                    if (label === 'Особиста інформація') setActiveBlock('personal');*/}
                        {/*                    if (label === 'Додані борщі') setActiveBlock('borsches');*/}
                        {/*                    if (label === 'Пароль') setActiveBlock('password');*/}
                        {/*                }}*/}
                        {/*                className={`${style.linkWrap} ${activeBlock === label.toLowerCase() ? style.active : ''}`}*/}
                        {/*            >*/}
                        {/*                <div className={style.linkGroup}>*/}
                        {/*                    <img src={icon} alt={label}/>*/}
                        {/*                    <span className={typography.mobileBody}>{label}</span>*/}
                        {/*                </div>*/}
                        {/*            </button>*/}
                        {/*        )*/}
                        {/*    )}*/}
                        {/*</div>*/}

                        {/*<div className={style.linksContainer}>*/}
                        {/*    {otherLinks.map(({path, label, icon}) =>*/}
                        {/*            <Link key={path} to={path} className={style.linkWrap}>*/}
                        {/*                <div className={style.linkGroup}>*/}
                        {/*                    <img src={icon} alt={label}/>*/}
                        {/*                    <span className={typography.mobileBody}>{label}</span>*/}
                        {/*                </div>*/}
                        {/*            </Link>*/}
                        {/*    )}*/}
                        {/*    {logoutLink && (*/}
                        {/*        <button*/}
                        {/*            key={logoutLink.label}*/}
                        {/*            onClick={handleOpenModal}*/}
                        {/*            className={style.linkWrap}*/}
                        {/*        >*/}
                        {/*            <div className={style.linkGroup}>*/}
                        {/*                <img src={logoutLink.icon} alt="Logout" />*/}
                        {/*                <span className={typography.mobileBody}>{logoutLink.label}</span>*/}
                        {/*            </div>*/}
                        {/*        </button>*/}
                        {/*    )}*/}
                        {/*</div>*/}
                    </aside>

                    <section className={style.content}>
                        <div className={style.advertBanner}>
                            <div className={style.advertText}>
                                <h4 className={`${typography.mobileTitleSmall} ${style.advertHeader}`}>
                                    {t('profile.advertTitle')}
                                </h4>
                                <p className={typography.mobileFootnote}>
                                    {t('profile.advertText')}
                                </p>
                            </div>
                            <img src={advertIcon} alt="Invite your friends"/>
                        </div>

                        <div className={style.themeRow}><ThemeToggle/></div>
                        <div className={style.themeRow}><LanguageToggle/></div>

                        <div ref={personalRef}>
                            <PersonalInfo/>
                        </div>

                        <div ref={borschesRef}>
                            <AddedBorschesPage/>
                        </div>

                        <div ref={passwordRef}>
                            <PasswordChangePage/>
                        </div>

                        {/*{activeBlock === 'personal' && <PersonalInfo/>}*/}
                        {/*{activeBlock === 'borsches' && <AddedBorschesPage/>}*/}
                        {/*{activeBlock === 'password' && <PasswordChangePage />}*/}
                    </section>
                </div>
            ) : (
                // 🔹 Мобільна версія
                <>
                    <h1 className={typography.mobileTitle}>{t('profile.title')}</h1>
                    <Link className={style.back} to={`/`} aria-label={t('nav.map')}><IconBack/></Link>
                    <div className={style.userHeader}>
                        <img
                            src={user.picture || Logo}
                            alt='User avatar'
                            onError={(e) => { e.target.src = Logo; }}
                            style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover' }}
                        />
                        <div>
                            <h2 className={typography.mobileTitleSmall}>{user.given_name || user.name}</h2>
                            <p style={{ fontSize: 13, color: 'var(--color-text-main)', margin: 0 }}>{user.email}</p>
                        </div>
                    </div>

                    <div className={style.advertBanner}>
                        <div className={style.advertText}>
                            <h4 className={`${typography.mobileTitleSmall} ${style.advertHeader}`}>{t('profile.advertTitle')}</h4>
                            <p className={typography.mobileFootnote}>{t('profile.advertText')}</p>
                        </div>
                        <img src={advertIcon} alt="Invite your friends"/>
                    </div>

                    <div className={style.userButtons}>
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
                        <>
                            <div className={style.themeRow}><ThemeToggle/></div>
                            <div className={style.themeRow}><LanguageToggle/></div>
                        </>
                    )}

                    <div className={style.linksContainer}>
                        {activeLinks.map(({path, label, icon, type}) =>
                            type === 'button' ? (
                                <button key={label} onClick={handleOpenModal} className={style.linkWrap}>
                                    <div className={style.linkGroup}>
                                        <img src={logoutIcon} alt="Logout"/>
                                        <span className={typography.mobileBody}>{t('profile.logout')}</span>
                                    </div>
                                </button>
                            ) : path?.startsWith('https://') ? (
                                <a
                                    key={path}
                                    href={path}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className={style.linkWrap}
                                >
                                    <div className={style.linkGroup}>
                                        <img src={icon} alt={label}/>
                                        <span className={typography.mobileBody}>{label}</span>
                                    </div>
                                    <img src={arrowIcon} alt="Arrow" className={style.arrow}/>
                                </a>
                            ) : (
                                <Link key={path} to={path} className={style.linkWrap}>
                                    <div className={style.linkGroup}>
                                        <img src={icon} alt={label}/>
                                        <span className={typography.mobileBody}>{label}</span>
                                    </div>
                                    <img src={arrowIcon} alt="Arrow" className={style.arrow}/>
                                </Link>
                            )
                        )}
                    </div>
                </>)}

            {showModal && <ModalLogout
                onClose={handleCloseModal}
                onLogoutSuccess={handleLogoutSuccess}
            />}
        </div>
    );
}
