import layout from "../../styles/layout.module.scss";
import { useT } from "../../i18n";
import { PageHeader } from "../../components/PageHeader";
import findArt from "../../assets/illustrations/find.webp";
import rateArt from "../../assets/illustrations/rate.webp";
import addArt from "../../assets/illustrations/add.webp";
import style from "./AppGuide.module.scss";

/**
 * The three things the app is for, in the order a new user meets them, with
 * the landing's «How it works» illustrations, and a way to replay the intro.
 */
const SECTIONS = [
  { key: 'find', art: findArt },
  { key: 'rate', art: rateArt },
  { key: 'add', art: addArt },
];

export const AppGuide = () => {
  const t = useT();

  const replayIntro = () => {
    try { localStorage.removeItem('nb-intro-done'); } catch (e) { /* ignore */ }
    window.location.assign('/');
  };

  return (
    <div className={layout.wrapper}>
      <PageHeader back kicker={t('guide.kicker')} title={t('guide.title')} lead={t('guide.lead')} />

      <ol className={style.sections}>
        {SECTIONS.map(({ key, art }, i) => (
          <li className={style.card} key={key}>
            <div className={style.art}>
              <img src={art} alt="" width="720" height="537" loading="lazy" />
            </div>
            <div className={style.body}>
              <span className={style.num} aria-hidden="true">{i + 1}</span>
              <h2 className={style.cardTitle}>{t(`guide.${key}Title`)}</h2>
              <p className={style.cardText}>{t(`guide.${key}Text`)}</p>
            </div>
          </li>
        ))}
      </ol>

      <button type="button" className={style.replay} onClick={replayIntro}>
        {t('guide.replay')}
      </button>
    </div>
  );
};
