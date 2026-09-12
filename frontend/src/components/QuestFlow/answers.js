/**
 * The five answers behind every taste question.
 *
 * The old scale was ten small numbered buttons. Numbers make you translate a
 * memory ("it was watery") into arithmetic ("so… 3?"), and a 52px button is a
 * poor target for a thumb. Here each criterion asks a question and offers five
 * big, worded answers — you recognise the one that matches instead of scoring.
 *
 * The stored value is still on the 1–10 scale the API and every existing review
 * use, mapped 2 / 4 / 6 / 8 / 10, so the top answer really is a 10.
 *
 * `mood` drives the mascot and `praise` the line under the cards, and both come
 * from the ANSWER rather than from the number — salt is the reason. Its scale
 * runs bland → over-salted, so on salt the best answer sits in the middle, and
 * a 10 deserves a wince, not applause.
 */

export const SCALE_KEYS = ['meat', 'beetroot', 'density', 'salt', 'aftertaste', 'serving', 'overall'];

const LOW = 'flow.praiseLow';
const MID = 'flow.praiseMid';
const GOOD = 'flow.praiseGood';
const TOP = 'flow.praiseTop';

export const SCALE_ANSWERS = {
  meat: [
    { value: 2,  emoji: '😶', i18n: 'ans.meat1', mood: 'sad',   praise: LOW },
    { value: 4,  emoji: '🔎', i18n: 'ans.meat2', mood: 'meh',   praise: MID },
    { value: 6,  emoji: '🙂', i18n: 'ans.meat3', mood: 'meh',   praise: MID },
    { value: 8,  emoji: '😋', i18n: 'ans.meat4', mood: 'happy', praise: GOOD },
    { value: 10, emoji: '🍖', i18n: 'ans.meat5', mood: 'love',  praise: TOP },
  ],
  beetroot: [
    { value: 2,  emoji: '🥛', i18n: 'ans.beetroot1', mood: 'sad',   praise: LOW },
    { value: 4,  emoji: '🌸', i18n: 'ans.beetroot2', mood: 'meh',   praise: MID },
    { value: 6,  emoji: '🍷', i18n: 'ans.beetroot3', mood: 'happy', praise: GOOD },
    { value: 8,  emoji: '🟣', i18n: 'ans.beetroot4', mood: 'happy', praise: GOOD },
    { value: 10, emoji: '❤️', i18n: 'ans.beetroot5', mood: 'love',  praise: TOP },
  ],
  density: [
    { value: 2,  emoji: '💧', i18n: 'ans.density1', mood: 'sad',   praise: LOW },
    { value: 4,  emoji: '🌊', i18n: 'ans.density2', mood: 'meh',   praise: MID },
    { value: 6,  emoji: '⚖️', i18n: 'ans.density3', mood: 'happy', praise: GOOD },
    { value: 8,  emoji: '🍲', i18n: 'ans.density4', mood: 'happy', praise: GOOD },
    { value: 10, emoji: '🥄', i18n: 'ans.density5', mood: 'love',  praise: TOP },
  ],
  // bipolar: the ideal is the middle answer, not the last one
  salt: [
    { value: 2,  emoji: '😐', i18n: 'ans.salt1', mood: 'sad',   praise: LOW },
    { value: 4,  emoji: '🤏', i18n: 'ans.salt2', mood: 'meh',   praise: MID },
    { value: 6,  emoji: '👌', i18n: 'ans.salt3', mood: 'love',  praise: TOP },
    { value: 8,  emoji: '🧂', i18n: 'ans.salt4', mood: 'meh',   praise: MID },
    { value: 10, emoji: '🥵', i18n: 'ans.salt5', mood: 'sad',   praise: LOW },
  ],
  aftertaste: [
    { value: 2,  emoji: '😖', i18n: 'ans.aftertaste1', mood: 'sad',   praise: LOW },
    { value: 4,  emoji: '😕', i18n: 'ans.aftertaste2', mood: 'meh',   praise: MID },
    { value: 6,  emoji: '🙂', i18n: 'ans.aftertaste3', mood: 'happy', praise: GOOD },
    { value: 8,  emoji: '😋', i18n: 'ans.aftertaste4', mood: 'happy', praise: GOOD },
    { value: 10, emoji: '🤤', i18n: 'ans.aftertaste5', mood: 'love',  praise: TOP },
  ],
  serving: [
    { value: 2,  emoji: '🫤', i18n: 'ans.serving1', mood: 'sad',   praise: LOW },
    { value: 4,  emoji: '😐', i18n: 'ans.serving2', mood: 'meh',   praise: MID },
    { value: 6,  emoji: '🙂', i18n: 'ans.serving3', mood: 'happy', praise: GOOD },
    { value: 8,  emoji: '✨', i18n: 'ans.serving4', mood: 'happy', praise: GOOD },
    { value: 10, emoji: '🍽️', i18n: 'ans.serving5', mood: 'love',  praise: TOP },
  ],
  overall: [
    { value: 2,  emoji: '🙅', i18n: 'ans.overall1', mood: 'sad',   praise: LOW },
    { value: 4,  emoji: '😕', i18n: 'ans.overall2', mood: 'meh',   praise: MID },
    { value: 6,  emoji: '🙂', i18n: 'ans.overall3', mood: 'happy', praise: GOOD },
    { value: 8,  emoji: '😋', i18n: 'ans.overall4', mood: 'happy', praise: GOOD },
    { value: 10, emoji: '🔁', i18n: 'ans.overall5', mood: 'love',  praise: TOP },
  ],
};

/**
 * Which of the five answers a raw 1–10 score belongs to.
 *
 * The ten-point arm still has to know whether a score is good news, and it
 * cannot ask the number: on salt, 10 means over-salted. Bucketing back onto the
 * answer table keeps the mascot and the praise line honest in both arms.
 */
export const optionForValue = (key, value) => {
  const options = SCALE_ANSWERS[key];
  if (!options || value === null || value === undefined || value === '') return null;
  const n = Math.min(10, Math.max(1, Number(value)));
  return options[Math.min(4, Math.ceil(n / 2) - 1)] || null;
};

/** The two ends of a criterion's scale, as written for the old 1–10 strip. */
export const scaleEnds = (key) => ({ left: `rate.${key}Left`, right: `rate.${key}Right` });

/** The taste half of both journeys: one screen per criterion, in this order. */
export const tasteSteps = () =>
  SCALE_KEYS.map((key) => ({
    type: 'scale',
    key,
    i18n: `flow.q.${key}`,
    options: SCALE_ANSWERS[key],
  }));

/** Grades → the field names the reviews endpoint expects. */
export const gradesToReview = (grades, comment = '') => ({
  rating_meat: grades.meat,
  rating_beet: grades.beetroot,
  rating_density: grades.density,
  rating_salt: grades.salt,
  rating_aftertaste: grades.aftertaste,
  rating_serving: grades.serving,
  overall_rating: grades.overall || 5,
  message: (comment || '').trim(),
});
