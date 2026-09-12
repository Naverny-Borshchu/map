import {Link} from "react-router-dom";
import arrowIcon from "../../assets/images/profile-arrow-icon.png";
import layout from "../../styles/layout.module.scss";
import typography from "../../styles/typography.module.css";
import style from "./HelpPage.module.css";
import { useT } from "../../i18n";

export const HelpPage = () => {
    const t = useT();

    const links = [
        {path: '/faq', label: 'FAQ'},
        {path: '/app-guide', label: t('help.guide')},
    ];

    return (
        <div className={layout.wrapper}>
            <h1 className={typography.mobileTitle}>{t('help.title')}</h1>
            <div className={style.linksContainer}>
                {links.map((link, i) =>
                    (<Link to={link.path} key={i} className={style.linkWrap}>
                        <div className={style.linkGroup}>
                            <span className={typography.mobileBody}>{link.label}</span>
                        </div>
                        <img src={arrowIcon} alt="Arrow" className={style.arrow}/>
                    </Link>)
                )}
            </div>
        </div>
    );
}