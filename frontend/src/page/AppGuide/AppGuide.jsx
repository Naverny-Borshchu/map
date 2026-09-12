import typography from "../../styles/typography.module.css";
import layout from "../../styles/layout.module.scss";
import { Mascot } from "../../components/Mascot";
import { useT } from "../../i18n";
import style from "./AppGuide.module.scss";

/**
 * The guide used to be a heading over an empty page — a link from Help that
 * led nowhere. It now explains the three things the app is for, in the same
 * order a new user meets them, and can replay the intro.
 */
const SECTIONS = [
  { key: 'find', emoji: '🗺️' },
  { key: 'rate', emoji: '⭐' },
  { key: 'add', emoji: '➕' },
];

export const AppGuide = () => {
  const t = useT();

  const replayIntro = () => {
    try { localStorage.removeItem('nb-intro-done'); } catch (e) { /* ignore */ }
    window.location.assign('/');
  };

  return (
    <div className={layout.wrapper}>
      <div className={style.head}>
        <Mascot mood="happy" size={72} />
        <h1 className={typography.mobileTitle}>{t('guide.title')}</h1>
      </div>

      <div className={style.sections}>
        {SECTIONS.map(({ key, emoji }) => (
          <section className={style.card} key={key}>
            <h2 className={style.cardTitle}>
              <span aria-hidden="true">{emoji}</span>
              {t(`guide.${key}Title`)}
            </h2>
            <p className={style.cardText}>{t(`guide.${key}Text`)}</p>
          </section>
        ))}
      </div>

      <button type="button" className={style.replay} onClick={replayIntro}>
        {t('guide.replay')}
      </button>
    </div>
  );
};
