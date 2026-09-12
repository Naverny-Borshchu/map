/**
 * Dish-name translation (uk → en).
 *
 * These names are compositional — a head word ("борщ"), some adjectives and a
 * list of ingredients after "з / із / зі". So rather than a lookup table of
 * whole names (which would go stale the moment somebody adds a borsch), this
 * parses the name and rebuilds it in English. A borsch added tomorrow is
 * translated as long as it uses culinary vocabulary we know; anything unknown
 * falls back to transliteration, so the result stays readable.
 *
 * The scanner is segment-based: Cyrillic words are translated in place while
 * punctuation, Latin words and digits are preserved verbatim. That matters —
 * an earlier word-list version silently dropped "TRUE", "BBQ" and every comma.
 *
 * Display only — the stored Ukrainian name is never modified.
 */
import { transliterate } from './venueNames';

const ADJ = 'adj';
const NOUN = 'noun';
const CONN = 'conn';
const HEAD = 'head';

/**
 * Idioms that must be translated as a unit, before word-by-word work.
 * Without these you get "with the oven" for "з печі" and the doubled
 * "plum plum butter" for "сливовим лекваром".
 */
const PHRASES = [
  // [regex, english, isAdjective?] — adjectival ones hoist like a plain adjective
  [/з\s+печі/iy, 'from the oven'],
  [/на\s+півні/iy, 'on rooster broth'],
  [/на\s+качиному\s+бульйоні/iy, 'on duck broth'],
  [/сливовим\s+лекваром/iy, 'plum butter'],
  [/капустою\s+кімчі/iy, 'kimchi cabbage'],
  [/без\s+миски/iy, 'without a bowl'],
  [/із\s+чорного\s+хліба/iy, 'from black bread'],
  [/реберцем-гриль/iy, 'grilled ribs'],
  [/по-домашньому/iy, 'home-style', true],
  [/по-одеськи/iy, 'Odesa-style', true],
  [/велика\s+порція/iy, 'large portion'],
];

/**
 * Stem → [english, part of speech]. Matched longest-stem-first against a
 * lower-cased token, so one entry covers a word's inflections
 * (телятина / телятиною / телятини …).
 */
const STEMS = [
  ['борщик', ['borsch', HEAD]],
  ['борщ', ['borsch', HEAD]],
  ['орщ', ['borsch', HEAD]], // a typo that exists in the data

  ['зі', ['with', CONN]],
  ['із', ['with', CONN]],
  ['з', ['with', CONN]],
  ['без', ['without', CONN]],
  ['та', ['and', CONN]],
  ['і', ['and', CONN]],
  ['від', ['by', CONN]],
  ['на', ['in', CONN]],
  ['в', ['in', CONN]],

  ['українськ', ['Ukrainian', ADJ]],
  ['червон', ['red', ADJ]],
  ['вишнев', ['cherry', ADJ]],
  ['домашн', ['home-style', ADJ]],
  ['закарпатськ', ['Zakarpattian', ADJ]],
  ['київськ', ['Kyiv', ADJ]],
  ['традиційн', ['traditional', ADJ]],
  ['справжн', ['authentic', ADJ]],
  ['фірмов', ['signature', ADJ]],
  ['мамин', ["mum's", ADJ]],
  ['наш', ['our', ADJ]],
  ['рідненьк', ['dear', ADJ]],
  ['улюблен', ['favourite', ADJ]],
  ['бабус', ["grandmother's", ADJ]],
  ['перш', ['first', ADJ]],
  ['велик', ['large', ADJ]],
  ['молод', ['young', ADJ]],
  ['органічн', ['organic', ADJ]],
  ['генеральськ', ["general's", ADJ]],
  ['родинн', ['family', ADJ]],
  ['трішки', ['a little', ADJ]],

  ['копчен', ['smoked', ADJ]],
  ['вʼялен', ['dried', ADJ]],
  ["в'ялен", ['dried', ADJ]],
  ['в’ялен', ['dried', ADJ]],
  ['томлен', ['braised', ADJ]],
  ['зварен', ['cooked', ADJ]],
  ['солон', ['salted', ADJ]],
  ['гостр', ['spicy', ADJ]],
  ['дик', ['wild', ADJ]],
  ['чорн', ['black', ADJ]],
  ['цибульков', ['onion', ADJ]],
  ['конопля', ['hemp', ADJ]],
  ['сливов', ['plum', ADJ]],
  ['качин', ['duck', ADJ]],
  ['теляч', ['veal', ADJ]],
  ['куряч', ['chicken', ADJ]],
  ['свиняч', ['pork', ADJ]],
  ['свинн', ['pork', ADJ]],
  ['ялович', ['beef', ADJ]],
  ['бичач', ['ox', ADJ]],

  ['телятин', ['veal', NOUN]],
  ['свинин', ['pork', NOUN]],
  ['яловичин', ['beef', NOUN]],
  ['курк', ['chicken', NOUN]],
  ['курч', ['chicken', NOUN]],
  ['качк', ['duck', NOUN]],
  ['півн', ['rooster', NOUN]],
  ['вепр', ['boar', NOUN]],
  ['карас', ['crucian carp', NOUN]],
  ['корнбіф', ['corned beef', NOUN]],
  ['мʼяс', ['meat', NOUN]],
  ["м'яс", ['meat', NOUN]],
  ['м’яс', ['meat', NOUN]],
  ['м‘яс', ['meat', NOUN]],
  ['ясн', ['meat', NOUN]], // fallout of an odd apostrophe in the data

  ['реберц', ['ribs', NOUN]],
  ['ребр', ['ribs', NOUN]],
  ['хвост', ['tails', NOUN]],
  ['щок', ['cheek', NOUN]],
  ['сердечк', ['hearts', NOUN]],

  ['пампушк', ['garlic buns', NOUN]],
  ['грінк', ['croutons', NOUN]],
  ['сметан', ['sour cream', NOUN]],
  ['смальц', ['lard', NOUN]],
  ['сал', ['salo', NOUN]],
  ['намазк', ['spread', NOUN]],
  ['хліб', ['bread', NOUN]],
  ['паляниц', ['palianytsia bread', NOUN]],
  ['пиріжк', ['pies', NOUN]],
  ['смаколик', ['treats', NOUN]],
  ['квасол', ['beans', NOUN]],
  ['капуст', ['cabbage', NOUN]],
  ['кімчі', ['kimchi', NOUN]],
  ['груш', ['pear', NOUN]],
  ['чорнослив', ['prunes', NOUN]],
  ['слив', ['plums', NOUN]],
  ['вишн', ['cherry', NOUN]],
  ['перц', ['pepper', NOUN]],
  ['часни', ['garlic', NOUN]],
  ['зелен', ['herbs', NOUN]],
  ['ялівц', ['juniper', NOUN]],
  ['лекваром', ['plum butter', NOUN]],
  ['бульйон', ['broth', NOUN]],
  ['печ', ['oven', NOUN]],
  ['миск', ['bowl', NOUN]],
  ['порці', ['portion', NOUN]],
  ['страв', ['course', NOUN]],
  ['застілл', ['feast', NOUN]],
  ['традиці', ['traditions', NOUN]],
  ['шеф', ['the chef', NOUN]],
  ['пекар', ['the baker', NOUN]],
  ['корчм', ['korchma', NOUN]],
  ['гриль', ['grill', NOUN]],
  // --- broader culinary vocabulary, so a newly added borsch still translates.
  // Longer stems win, which is how 'зелений' (green) is kept apart from
  // 'зелень' (herbs) — the two collided and turned "Зелений борщ" into
  // "Herbs borsch".
  ['зелений', ['green', ADJ]],
  ['зелена', ['green', ADJ]],
  ['зелене', ['green', ADJ]],
  ['зеленого', ['green', ADJ]],
  ['пісн', ['lenten', ADJ]],
  ['вегетаріанськ', ['vegetarian', ADJ]],
  ['веганськ', ['vegan', ADJ]],
  ['наварист', ['rich', ADJ]],
  ['легк', ['light', ADJ]],
  ['солодк', ['sweet', ADJ]],
  ['кисл', ['sour', ADJ]],
  ['гарбузов', ['pumpkin', ADJ]],
  ['грибн', ['mushroom', ADJ]],
  ['курин', ['chicken', ADJ]],
  ['баран', ['lamb', NOUN]],
  ['індичк', ['turkey', NOUN]],
  ['індич', ['turkey', ADJ]],
  ['кролик', ['rabbit', NOUN]],
  ['гуск', ['goose', NOUN]],
  ['гус', ['goose', NOUN]],
  ['лосос', ['salmon', NOUN]],
  ['риб', ['fish', NOUN]],
  ['креветк', ['prawns', NOUN]],
  ['гриб', ['mushrooms', NOUN]],
  ['щавл', ['sorrel', NOUN]],
  ['щавел', ['sorrel', NOUN]],
  ['кріп', ['dill', NOUN]],
  ['кроп', ['dill', NOUN]],
  ['петрушк', ['parsley', NOUN]],
  ['яйц', ['egg', NOUN]],
  ['яєчк', ['egg', NOUN]],
  ['сир', ['cheese', NOUN]],
  ['вершк', ['cream', NOUN]],
  ['масл', ['butter', NOUN]],
  ['картопл', ['potato', NOUN]],
  ['буряк', ['beetroot', NOUN]],
  ['моркв', ['carrot', NOUN]],
  ['цибул', ['onion', NOUN]],
  ['помідор', ['tomato', NOUN]],
  ['томат', ['tomato', NOUN]],
  ['горох', ['peas', NOUN]],
  ['горішк', ['nuts', NOUN]],
  ['чилі', ['chilli', NOUN]],
  ['паприк', ['paprika', NOUN]],
  ['зіл', ['herbs', NOUN]],
  ['грінк', ['croutons', NOUN]],
  ['галушк', ['dumplings', NOUN]],
  ['вареник', ['varenyky', NOUN]],
  ['ковбас', ['sausage', NOUN]],
  ['бекон', ['bacon', NOUN]],
  ['качан', ['cabbage head', NOUN]],
  ['дідус', ["grandfather's", ADJ]],
  ['мам', ["mum's", ADJ]],
  ['мо', ['my', ADJ]],
  ['порц', ['portion', NOUN]],
].sort((a, b) => b[0].length - a[0].length);

const APOSTROPHES = "'’ʼ‘";
const WORD_RE = new RegExp(`[А-Яа-яІіЇїЄєҐґ${APOSTROPHES}\\-]+`, 'y');
const QUOTED = /[«»"“”„]/;
const CYRILLIC = /[А-Яа-яІіЇїЄєҐґ]/;

const lookup = (word) => {
  const w = word.toLowerCase();
  for (const [stem, entry] of STEMS) {
    // Function words must match EXACTLY. Prefix-matching them swallowed real
    // words: 'на' matched "Намелачний" and turned the dish into "In red borsch".
    if (entry[1] === CONN) {
      if (w === stem) return entry;
      continue;
    }
    if (w === stem || w.startsWith(stem)) return entry;
  }
  return null;
};

/** Split into segments, keeping every non-word character exactly as it is. */
const scan = (s) => {
  const segs = [];
  let i = 0;

  while (i < s.length) {
    let matched = false;

    for (const [re, en, isAdj] of PHRASES) {
      re.lastIndex = i;
      if (re.test(s)) {
        segs.push({ t: 'phrase', out: en, adj: !!isAdj });
        i = re.lastIndex;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    WORD_RE.lastIndex = i;
    const m = WORD_RE.exec(s);
    if (m) {
      segs.push({ t: 'word', raw: m[0] });
      i = WORD_RE.lastIndex;
      continue;
    }

    segs.push({ t: 'lit', out: s[i] });
    i += 1;
  }
  return segs;
};

const renderWord = (seg) => {
  const hit = lookup(seg.raw);
  const out = hit ? hit[0] : transliterate(seg.raw);
  // A capitalised source word keeps its capital, so a proper name inside
  // quotes stays a proper name: «Родинне застілля» → «Family feast».
  const srcCap = seg.raw[0] === seg.raw[0].toUpperCase() && seg.raw[0] !== seg.raw[0].toLowerCase();
  // …but never capitalise an article, or "від пекаря" reads "By The baker".
  const startsWithArticle = /^(the|a|an) /i.test(out);
  return srcCap && out && !startsWithArticle ? out.charAt(0).toUpperCase() + out.slice(1) : out;
};

const tidy = (s) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?»”)])/g, '$1')
    .replace(/([«“(])\s+/g, '$1')
    .trim();

/**
 * Translate one dish name. Non-Cyrillic input is returned untouched (names
 * like "Borščs" are already Latin).
 */
export const translateDish = (name) => {
  if (!name || !CYRILLIC.test(name)) return name;

  const segs = scan(name);
  const words = segs.filter((x) => x.t === 'word');
  if (!words.length) return name;

  const tags = new Map();
  words.forEach((w) => {
    const hit = lookup(w.raw);
    tags.set(w, hit ? hit[1] : NOUN);
  });

  const headSeg = words.find((w) => tags.get(w) === HEAD);

  // A quoted or parenthesised name carries a proper name — translate in place
  // and never hoist words out of it, or «Родинне застілля» turns into
  // "Family borsch feast".
  const hasQuotes = QUOTED.test(name) || name.includes('(');

  if (!headSeg || hasQuotes) {
    const out = segs
      .map((s) => (s.t === 'word' ? renderWord(s) : s.out))
      .join('');
    const t = tidy(out);
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  // Hoist the adjectives that qualify the head: everything adjectival before
  // it, plus any trailing straight after it and before the first connector.
  const headIdx = segs.indexOf(headSeg);
  const hoisted = new Set();
  const prefix = [];

  for (let i = 0; i < headIdx; i += 1) {
    const s = segs[i];
    if (s.t === 'word' && tags.get(s) === ADJ) {
      prefix.push(renderWord(s));
      hoisted.add(s);
    } else if (s.t === 'phrase' && s.adj) {
      prefix.push(s.out);
      hoisted.add(s);
    }
  }

  for (let i = headIdx + 1; i < segs.length; i += 1) {
    const s = segs[i];
    if (s.t === 'lit' && /\s/.test(s.out)) continue;
    if (s.t === 'word' && tags.get(s) === ADJ) {
      prefix.push(renderWord(s));
      hoisted.add(s);
      continue;
    }
    if (s.t === 'phrase' && s.adj) {
      prefix.push(s.out);
      hoisted.add(s);
      continue;
    }
    break;
  }

  const out = segs
    .map((s) => {
      if (hoisted.has(s)) return '';
      if (s === headSeg) return `${prefix.join(' ')} borsch`;
      return s.t === 'word' ? renderWord(s) : s.out;
    })
    .join('');

  const t = tidy(out);
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Language-aware wrapper used by the UI. */
export const dishLabel = (name, lang) => (lang === 'en' ? translateDish(name) : name);
