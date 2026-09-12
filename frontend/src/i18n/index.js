import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { translations, LANGUAGES, CITY_LABELS } from './translations';
import { venueLabel as rawVenueLabel } from './venueNames';
import { dishLabel as rawDishLabel } from './dishNames';

const LANG_KEY = 'lang';
const DEFAULT_LANG = 'uk';

/* Мови, для яких українська — доречніший показ, ніж англійська: та сама
   аудиторія й той самий контекст закладів. */
const PREFERS_UK = /^(uk|ru|be)$/;

export const getLanguage = () => {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && translations[saved]) return saved;
  } catch (e) { /* storage unavailable */ }
  try {
    const nav = (navigator.language || '').slice(0, 2).toLowerCase();
    if (translations[nav]) return nav;
    if (PREFERS_UK.test(nav)) return DEFAULT_LANG;
    /* Мова, якої ми не маємо (de, pl, fr, es…) — це НЕ привід показувати
       українську: людина її майже напевно не читає, а англійську радше так.
       Раніше тут був фолбек у DEFAULT_LANG, і відвідувач із німецьким або
       польським браузером бачив український інтерфейс. Заміряно на проді:
       en-* — англійська, de-DE / pl-PL / fr-FR — українська.

       Лендінг це правило вже застосовує (i18n/lang-switch.js у репозиторії
       landing: uk|ru|be → українська, решта → англійська), тож до цієї правки
       німецький відвідувач отримував англійський лендінг і українську мапу —
       розрив рівно посередині шляху. */
    if (nav) return 'en';
  } catch (e) { /* no navigator */ }
  return DEFAULT_LANG;
};

const I18nContext = createContext(null);

export const I18nProvider = ({ children }) => {
  const [lang, setLangState] = useState(getLanguage);

  const setLang = useCallback((next) => {
    if (!translations[next]) return;
    try { localStorage.setItem(LANG_KEY, next); } catch (e) { /* ignore */ }
    document.documentElement.setAttribute('lang', next);
    setLangState(next);
  }, []);

  const t = useCallback(
    (key, vars) => {
      const dict = translations[lang] || translations[DEFAULT_LANG];
      // fall back to Ukrainian, then to the key itself, so a missing string is
      // visible in development rather than rendering as blank
      // plural: prefer key_one for 1, key_few for 2..4 (uk), else the base key
      let lookup = key;
      if (vars && typeof vars.count === 'number') {
        const n = Math.abs(vars.count) % 100;
        const n1 = n % 10;
        if (vars.count === 1 && dict[`${key}_one`]) lookup = `${key}_one`;
        else if (lang === 'uk' && n1 >= 2 && n1 <= 4 && (n < 12 || n > 14) && dict[`${key}_few`]) lookup = `${key}_few`;
      }
      let s = dict[lookup] ?? dict[key] ?? translations[DEFAULT_LANG][key] ?? key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
        });
      }
      return s;
    },
    [lang]
  );

  // Venue names stay as stored; city names get a localized label where we know one.
  const cityLabel = useCallback(
    (city) => (CITY_LABELS[lang] && CITY_LABELS[lang][city]) || city,
    [lang]
  );

  // Venue names: Latin label for the English UI, stored value untouched.
  const venueLabel = useCallback((name) => rawVenueLabel(name, lang), [lang]);

  // Dish names are translated (not transliterated) — see i18n/dishNames.js
  const dishLabel = useCallback((name) => rawDishLabel(name, lang), [lang]);

  const value = useMemo(
    () => ({ t, lang, setLang, languages: LANGUAGES, cityLabel, venueLabel, dishLabel }),
    [t, lang, setLang, cityLabel, venueLabel, dishLabel]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
};

/** Convenience: just the translate function. */
export const useT = () => useI18n().t;

/** Localized display label for a stored city name. */
export const useCityLabel = () => useI18n().cityLabel;

/** Latin display label for a venue name (English UI only). */
export const useVenueLabel = () => useI18n().venueLabel;

/** Translated dish name (English UI only). */
export const useDishLabel = () => useI18n().dishLabel;
