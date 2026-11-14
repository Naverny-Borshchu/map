import { Link } from "react-router-dom";
import layout from "../../styles/layout.module.scss";
import { useT } from "../../i18n";
// «Тут Борщу немає»: an empty pot with two drops on the bottom, the same art as the blog 404 (Andrii, 14.11.2026)
import emptyPotArt from "../../assets/illustrations/pot-empty.webp";
import style from "./NotFound.module.scss";

/**
 * Any path the router does not know. It used to render nothing at all: an
 * empty cream page over the tab bar, which reads as «the app is broken».
 */
export const NotFound = () => {
  const t = useT();
  return (
    <div className={`${layout.wrapper} ${style.page}`}>
      <img className={style.art} src={emptyPotArt} alt="" width="420" height="420" />
      <p className={style.code}>404</p>
      <h1 className={style.title}>{t('notFound.title')}</h1>
      <p className={style.text}>{t('notFound.text')}</p>
      <Link to="/" className={style.cta}>{t('common.toMap')}</Link>
    </div>
  );
};

export default NotFound;
