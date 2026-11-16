import meat from '../../assets/illustrations/rating/illu-meat.webp';
import beet from '../../assets/illustrations/rating/illu-beet.webp';
import broth from '../../assets/illustrations/rating/illu-broth.webp';
import salt from '../../assets/illustrations/rating/illu-salt.webp';
import serving from '../../assets/illustrations/rating/illu-serving.webp';
import aftertaste from '../../assets/illustrations/rating/illu-aftertaste.webp';
import overall from '../../assets/illustrations/rating/illu-overall.webp';
import comment from '../../assets/illustrations/rating/illu-comment.webp';
import done from '../../assets/illustrations/rating/illu-done.webp';
import photo from '../../assets/illustrations/add.webp';
import table from '../../assets/illustrations/table.webp';
import find from '../../assets/illustrations/find.webp';
import letter from '../../assets/illustrations/letter.webp';
import hero from '../../assets/illustrations/hero.webp';
import pot from '../../assets/illustrations/spoon.webp';

/**
 * The flat illustrations of the identity, one per screen of the quest frame
 * (Оцінювання 3.0 drew one for every part of the borshch). They replace the
 * beet mascot that used to stand on every step.
 */
export const ILLUSTRATIONS = {
  meat,
  beet,
  broth,
  salt,
  serving,
  aftertaste,
  overall,
  comment,
  done,
  photo,
  table,
  find,
  letter,
  hero,
  pot,
};

export const illustration = (name) => (name && ILLUSTRATIONS[name]) || null;
