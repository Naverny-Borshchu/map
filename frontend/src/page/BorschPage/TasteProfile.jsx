import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { useI18n } from '../../i18n';
import { BowlArt, DensityRail } from '../../components/QuestFlow/BowlArt';
import { RatingIconsSvg } from '../../components/RatingIconsSvg';
import { SALT_BEST, SALT_MAX, lowerFirst } from '../../components/QuestFlow/answers';
import {
  distMean,
  formatMean,
  hasDensity,
  hasDescription,
  hasSalt,
  hasSides,
  hasTastes,
  meanCount,
  modeOf,
  roundedStep,
  sidesSplit,
  tasteAvailable,
} from '../../utils/tasteProfile';
import style from './TasteProfile.module.scss';

/**
 * The borshch card after Оцінювання 3.0 (NAV-216): «Який він» (how much meat
 * and beetroot, how thick, how salty, what comes with it) and «Оцінки» (the
 * three tastes, one to five bowls). The old criteria bars are gone: «Солоність
 * 8.4» read as praise while it meant «very oversalted».
 *
 * profile   utils/tasteProfile normalizeProfile, or null (an API without it,
 *           or a borshch nobody described yet): «Опис ще збираємо…»
 */

/** Position of a mean on a scale of `max` stops, at the centre of its stop. */
const pos = (mean, max) => `${((mean - 0.5) / max) * 100}%`;

const Dots = ({ total, upTo }) => (
  <span className={style.dots} aria-hidden="true">
    {Array.from({ length: total }, (_, i) => <i key={i} className={i <= upTo ? style.dotOn : ''} />)}
  </span>
);

const AmountRow = ({ kicker, dist, words, draw, offset, tail }) => {
  const { t } = useI18n();
  const mode = modeOf(dist);
  if (!mode) return null;
  return (
    <div className={style.drow}>
      <div className={style.dtext}>
        <p className={style.dk}>{kicker}</p>
        <p className={style.dv}>
          {t(`${words}.${mode.index + offset}`)}
          {tail && <span className={style.dv2}> · {tail}</span>}
        </p>
        <p className={style.dn}>
          <Dots total={dist.counts.length} upTo={mode.index} />
          <span>{t('taste.say', { n: mode.count, total: mode.total })}</span>
        </p>
      </div>
      <BowlArt kind={draw} level={mode.index + offset} className={style.picto} />
    </div>
  );
};

const TASTES = [
  { key: 'meat_taste', label: 'taste.meatTaste' },
  { key: 'aftertaste', label: 'taste.aftertaste' },
  { key: 'serving_taste', label: 'taste.servingTaste' },
];

/** «Оцінки»: the three tastes, a mean of 1..5 with five small bowls each. */
const Scores = ({ profile }) => {
  const { t, lang } = useI18n();
  if (!hasTastes(profile)) return null;
  const tastes = TASTES.filter((x) => tasteAvailable(profile[x.key]));
  return (
    <section className={style.sec} aria-labelledby="taste-scores">
      <h2 className={style.title} id="taste-scores">{t('taste.tastesTitle')}</h2>
      <p className={style.sub}>{t('taste.tastesSub')}</p>
      <div className={style.panel}>
        {tastes.map(({ key, label }) => {
          const m = profile[key].mean;
          const step = roundedStep(m, 5);
          return (
            <div className={style.trow} key={key}>
              <div className={style.tname}>
                <p className={style.tn}>{t(label)}</p>
                <p className={style.tw}>{lowerFirst(t(`r3.${key}.${step}`), lang)}</p>
              </div>
              <span role="img" aria-label={t('taste.bowls', { value: formatMean(m, lang) })}>
                <RatingIconsSvg overall_rating={step} max={5} size={18} />
              </span>
              <p className={style.tavg} aria-hidden="true">{formatMean(m, lang)}</p>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export const TasteProfile = ({ profile, rateTo }) => {
  const { t, lang } = useI18n();

  if (!hasDescription(profile)) {
    return (
      <>
        <section className={style.sec} aria-labelledby="taste-desc">
          <div className={style.empty}>
            <h2 className={style.title} id="taste-desc">{t('taste.title')}</h2>
            <p>{t('taste.empty')}</p>
            <Link to={rateTo} className={style.btn}>{t('taste.rateCta')}</Link>
          </div>
        </section>
        <Scores profile={profile} />
      </>
    );
  }

  const beetMode = modeOf(profile.beet_amount);
  const flavor = distMean(profile.beet_flavor);
  const flavorStep = flavor !== null ? roundedStep(flavor, 5) : null;
  const sides = sidesSplit(profile);
  const density = profile.density;
  const salt = profile.salt;
  const saltTotal = meanCount(salt);
  const legacyOnly = profile.reviews === 0;

  const saltNotes = [];
  if (salt.low) saltNotes.push(t('taste.saltLow', { n: salt.low, total: saltTotal }));
  if (salt.high) saltNotes.push(t('taste.saltHigh', { n: salt.high, total: saltTotal }));

  return (
    <>
      <section className={style.sec} aria-labelledby="taste-desc" data-testid="taste-profile">
        <h2 className={style.title} id="taste-desc">{t('taste.title')}</h2>
        <p className={style.sub}>
          {legacyOnly ? t('taste.legacyOnly') : t('taste.sub', { count: profile.reviews })}
        </p>
        <div className={style.panel}>
          <AmountRow kicker={t('taste.meat')} dist={profile.meat_amount} words="r3.meat_amount" draw="meat" offset={0} />

          {beetMode ? (
            <AmountRow
              kicker={t('taste.beet')}
              dist={profile.beet_amount}
              words="r3.beet_amount"
              draw="beet"
              offset={1}
              tail={flavorStep ? t(`taste.flavorTail.${flavorStep}`) : ''}
            />
          ) : flavorStep ? (
            <div className={style.drow}>
              <div className={style.dtext}>
                <p className={style.dk}>{t('taste.beet')}</p>
                <p className={style.dv}>{t(`taste.flavorOnly.${flavorStep}`)}</p>
              </div>
            </div>
          ) : null}

          {hasDensity(profile) && (
            <div className={style.drow}>
              <div className={style.dtext}>
                <p className={style.dk}>{t('taste.density')}</p>
                <p className={style.dv}>
                  <span className={style.num}>{formatMean(density.mean, lang)}</span>
                  {' · '}
                  {t(`r3.density.${roundedStep(density.mean, 10)}`)}
                </p>
                <p className={style.dn}><span>{t('taste.mean', { n: meanCount(density) })}</span></p>
              </div>
              <div className={style.mini} aria-hidden="true">
                <div className={style.miniWedge}>
                  <DensityRail id="dens-rail-card" className={style.wedge} />
                  <i style={{ left: pos(density.mean, 10) }} />
                </div>
                <div className={style.miniCap}>
                  <span>{t('taste.densityLeft')}</span>
                  <span>{t('taste.densityRight')}</span>
                </div>
              </div>
            </div>
          )}

          {hasSalt(profile) && (
            <div className={style.drow}>
              <div className={style.dtext}>
                <p className={style.dk}>{t('taste.salt')}</p>
                <p className={style.dv}>
                  <span className={style.num}>{formatMean(salt.mean, lang)}</span>
                  {' · '}
                  {t(`r3.salt.${roundedStep(salt.mean, SALT_MAX)}`)}
                </p>
                <p className={style.dn}>
                  <span>
                    {saltNotes.length
                      ? saltNotes.map((note, i) => (
                        // the dot stays outside the unbreakable note: the line may wrap there
                        <Fragment key={note}>{i > 0 ? ' · ' : ''}<span className={style.nw}>{note}</span></Fragment>
                      ))
                      : t('taste.mean', { n: saltTotal })}
                  </span>
                </p>
              </div>
              <div
                className={style.mini}
                aria-hidden="true"
                style={{ '--best': pos(SALT_BEST, SALT_MAX) }}
              >
                <span className={style.miniBest}>{t('r3.best')}</span>
                <div className={style.miniLevel}>
                  <i style={{ left: pos(salt.mean, SALT_MAX) }} />
                </div>
                <div className={style.miniCap}>
                  <span>{t('taste.saltLeft')}</span>
                  <span>{t('taste.saltRight')}</span>
                </div>
              </div>
            </div>
          )}

          {hasSides(profile) && (sides.main.length > 0 || sides.rest.length > 0 || sides.mostlyNone) && (
            <div className={`${style.drow} ${style.dsides}`}>
              <div className={style.dtext}>
                <p className={style.dk}>{t('taste.sides')}</p>
                {sides.main.length > 0 ? (
                  <div className={style.chips}>
                    {sides.main.map((c) => <span className={style.chip} key={c}>{t(`r3.side.${c}`)}</span>)}
                  </div>
                ) : sides.mostlyNone ? (
                  <p className={style.dv}>{t('taste.sidesNone')}</p>
                ) : null}
                {sides.rest.length > 0 && (
                  <p className={style.dn}>
                    {t('taste.alsoSides', {
                      list: sides.rest.map((c) => lowerFirst(t(`r3.side.${c}`), lang)).join(', '),
                    })}
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        {legacyOnly && (
          <div className={style.invite}>
            <p>{t('taste.empty')}</p>
            <Link to={rateTo} className={style.btn}>{t('taste.rateCta')}</Link>
          </div>
        )}
      </section>

      <Scores profile={profile} />
    </>
  );
};

export default TasteProfile;
