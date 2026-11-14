import { Link } from "react-router-dom";
import layout from "../../styles/layout.module.scss";
import style from "./HelpPage.module.css";
import { useT } from "../../i18n";
import { PageHeader } from "../../components/PageHeader";
import { BugReport } from "../../components/BugReport";
import letterArt from "../../assets/illustrations/letter.webp";

const IconChevron = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
        <path d="m9.5 5.5 6.5 6.5-6.5 6.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
);

export const HelpPage = () => {
    const t = useT();

    const links = [
        {path: '/faq', label: t('faq.title'), hint: t('help.faqHint')},
        {path: '/app-guide', label: t('help.guide'), hint: t('help.guideHint')},
    ];

    return (
        <div className={layout.wrapper}>
            <PageHeader back kicker={t('help.kicker')} title={t('help.title')} />
            <div className={style.linksContainer}>
                {links.map((link) => (
                    <Link to={link.path} key={link.path} className={style.linkWrap}>
                        <span className={style.linkGroup}>
                            <span className={style.linkLabel}>{link.label}</span>
                            <span className={style.linkHint}>{link.hint}</span>
                        </span>
                        <span className={style.arrow}><IconChevron /></span>
                    </Link>
                ))}
            </div>

            {/* NAV-203: the bug report moved here from the bottom bar. */}
            <section className={style.write}>
                <img className={style.art} src={letterArt} alt="" width="220" height="164" loading="lazy" />
                <h2 className={style.writeTitle}>{t('help.writeTitle')}</h2>
                <BugReport variant="card" />
            </section>
        </div>
    );
}
