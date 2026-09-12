/**
 * Latin labels for Cyrillic venue names, used when the UI language is English.
 *
 * Two layers:
 *  1. VENUE_LABELS — venues that have a real English/branded name. Curated by
 *     hand from Google Places (languageCode=en); Google's raw output could not
 *     be trusted wholesale — it returned a street address for one venue and a
 *     lamp manufacturer for another, plus marketing tails.
 *  2. transliterate() — the fallback, so a venue nobody curated still renders
 *     readable Latin rather than Cyrillic. Follows the Ukrainian national
 *     romanisation standard (KMU 2010).
 *
 * The stored name is never changed — this is display only.
 */

export const VENUE_LABELS = {
  'Гудман': 'Goodman',
  'Дача': 'Dacha',
  'Глек': 'Glek',
  'Канапа': 'Kanapa',
  'Колиба Хаус': 'Kolyba House',
  'Колиба Перемичка': 'Kolyba Peremychka',
  'Кулінарна студія Крива Липа': 'Kryva Lypa Culinary Studio',
  'Моменти на Хрещатик': 'Moments on Khreshchatyk',
  'Улюблений Дядя': 'Favorite Uncle',
  'Сім Поросят': 'Seven Piggies',
  'Пузата хата': 'Puzata Hata',
  'Первак': 'Pervak',
  'NUMO (Буковель)': 'NUMO (Bukovel)',
  'SUNDUK PUB Леонтовича': 'Sunduk Pub',
  'БАБИН БОГРАЧ': 'Babyn Bohrach',
  'ЖАРіМЯСО': 'Zharymiaso',
  "О'Панас": "O'Panas",
  'Закарпатська Колиба на КПІ | На-Децу-До-Ґазди': 'Na-Detsu-Do-Gazdy',
  'Варенична Балувана Галя': 'Varenychna Baluvana Halia',
  'Остання Барикада': 'Ostannia Barykada',
  'Царське село': 'Tsarske Selo',
  'За двома зайцями': 'Za Dvoma Zaitsiamy',
  'Супстанція': 'Supstantsiia',
  'Автостанція Поділ': 'Podil Bus Station',
  'Маріо': 'Mario',
  'НА НЕБІ ГРИЛЬ & ВИНО': 'NA NEBI grill & wine',
  'Здоровий глузд': 'Zdorovyi Hluzd',
  'Стигла Встигла': 'Styhla Vstyhla',
  'ТРІШКИ БІЛЬШЕ на Золотих': 'Trishky Bilshe',
  'Прага': 'Praha',
};

// KMU 2010 romanisation. Position matters for є/ї/й/ю/я and the зг digraph.
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z',
  и: 'y', і: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'shch', ь: '', "'": '', '’': '', ʼ: '',
  // Russian letters that survive in some names
  ы: 'y', э: 'e', ё: 'yo', ъ: '',
};
const POSITIONAL = {
  є: ['ye', 'ie'],
  ї: ['yi', 'i'],
  й: ['y', 'i'],
  ю: ['yu', 'iu'],
  я: ['ya', 'ia'],
};

const matchCase = (src, out) => {
  if (!out) return out;
  if (src === src.toUpperCase() && src !== src.toLowerCase()) {
    // whole-word caps are handled by the caller; here just capitalise
    return out.charAt(0).toUpperCase() + out.slice(1);
  }
  return out;
};

export const transliterate = (input) => {
  if (!input) return input;
  let out = '';
  const chars = [...input];

  for (let i = 0; i < chars.length; i += 1) {
    const ch = chars[i];
    const lower = ch.toLowerCase();
    const prev = i > 0 ? chars[i - 1].toLowerCase() : '';
    const wordStart = i === 0 || !/[а-яіїєґёыэʼ'’]/i.test(prev);

    // зг → zgh (otherwise it would collide with ж → zh)
    if (lower === 'г' && prev === 'з') {
      out += matchCase(ch, 'gh');
      continue;
    }

    if (POSITIONAL[lower]) {
      out += matchCase(ch, POSITIONAL[lower][wordStart ? 0 : 1]);
      continue;
    }

    if (lower in MAP) {
      out += matchCase(ch, MAP[lower]);
      continue;
    }

    out += ch; // Latin, digits, punctuation pass through
  }
  return out;
};

const HAS_CYRILLIC = /[А-Яа-яІіЇїЄєҐґЁёЫыЭэ]/;

/**
 * Display label for any stored Cyrillic string shown as a name — venues and
 * dish names alike. Latin for the English UI, untouched otherwise.
 */
export const venueLabel = (name, lang) => {
  if (lang !== 'en' || !name || !HAS_CYRILLIC.test(name)) return name;
  return VENUE_LABELS[name] || transliterate(name);
};
