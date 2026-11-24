import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleAuth } from '../GoogleAuth';
import { useI18n } from '../../i18n';
import { coinsEarned, lowerFirst, stepShare, summaryPhrases, visibleQuestions, isAnswered } from './answers';
import { ComponentQuestions, OverallQuestion } from './RatingControls';
import { illustration } from './illustrations';
import { tokenStorage } from '../../services/tokenStorage';
import { IconCamera, IconClose, IconChevronLeft } from '../Icons';
import { useFlowTracking } from '../../hook/useFlowTracking';
import style from './QuestFlow.module.scss';
import { CoinIcon } from '../CoinIcon';

/**
 * The quest engine behind every journey that asks about a borshch: rating
 * one, a bowl's rating, a tasting guest, adding one. ONE screen at a time,
 * ONE forward button, visible progress.
 *
 * Since Оцінювання 3.0 (NAV-216) it wears the identity of the approved
 * prototype instead of the red full-screen stage: cream page (#FFFAF5, night
 * #170B0B), white cards, MAK only for words, Roboto for every digit, crimson
 * pills standing on a dark underside, a flat illustration per screen instead
 * of the beet mascot.
 *
 * Callers pass step descriptors:
 *
 *   { type: 'component', key, i18n, illu, index, of, questions }   one part of the borshch (answers.js)
 *   { type: 'overall',   key, i18n, illu }                         «Загалом», required
 *   { type: 'choice', key, i18n, options: [{ value, i18n }] }
 *   { type: 'text',   key, i18n, hint, placeholder, chips: [i18n keys] }
 *   { type: 'number', key, i18n, hint, unit, chips: [numbers], min }
 *   { type: 'photo',  key }        optional by nature, holds a list of files
 *   { type: 'comment',key }        optional by nature
 *   { type: 'signin', key }        a wall we only raise after the work is done
 *   { type: 'done',   key }        submits on arrival
 *
 * Values live in the caller (it knows how to submit them); the engine only
 * reads `values[key]` and calls `onChange(key, next)`. Nothing advances by
 * itself: «Далі» wakes up with the first answer of a screen.
 */

// Every rating screen is worth the same test БорщКоіни, paid in proportion to
// how much of it was answered (answers.js coinsEarned).
export const XP_PER_STEP = 10;

const isAuthed = () => {
  try {
    return localStorage.getItem('auth') === 'true' && !!tokenStorage.getAccess();
  } catch (e) {
    return false;
  }
};

/** How many photos one borsch can carry from this screen. */
export const MAX_PHOTOS = 6;

/** Has this step been given a real answer? Drives the progress bar. */
export const isStepAnswered = (step, values) => {
  if (step.type === 'photo') return (values.photos || []).length > 0;
  if (step.type === 'comment') return !!(values.comment || '').trim();
  if (step.type === 'component') return stepShare(step, values) === 1;
  return isStepFilled(step, values);
};

/**
 * May «Далі» be pressed? A part of the borshch needs one answer of its own
 * (or «Пропустити»), «Загалом» needs its number, the chores need their field.
 */
export const isStepFilled = (step, values) => {
  const v = values[step.key];
  switch (step.type) {
    case 'component':
      return visibleQuestions(step, values).some((q) => isAnswered(q.key, values));
    case 'overall':
      return isAnswered('overall', values);
    case 'choice':
      return v !== null && v !== undefined && v !== '';
    case 'text':
      return typeof v === 'string' && v.trim().length > 0;
    case 'number':
      return Number(v) > (step.min ?? 0);
    case 'signin':
      return isAuthed();
    // photo and comment are gifts, not requirements
    default:
      return true;
  }
};

/** The share of a segment that is filled: parts by their answers, the rest once answered. */
const segmentShare = (step, values) => {
  if (step.type === 'component') return stepShare(step, values);
  return isStepAnswered(step, values) ? 1 : 0;
};

const RATING_TYPES = new Set(['component', 'overall']);

export const QuestFlow = ({
  steps,
  values,
  onChange,
  title = '',
  // the venue next to the borshch's name, small, under the progress
  subtitle = '',
  xp = { perStep: XP_PER_STEP, multiplier: 1, total: null },
  status = { saving: false, sent: false, error: '', stage: '' },
  done = {},
  onSubmit,
  onRetry,
  // retries only the photos that did not upload; the rest is already saved
  onRetryPhotos,
  onExit,
  onSignIn,
  initialStep = 0,
  onStepChange,
  // Step events (services/flowAnalytics). `offset` counts the screens of the
  // same flow that came before this one on other routes (the map pick, say),
  // so `index` and `total` describe the whole journey, not just this part.
  analytics = null,       // { flow, offset = 0, context }
  // Shown on the closing screen once the save went through, under the summary.
  doneExtra = null,
  // A photo of the borshch being rated: a bowl's File from moment 1, or the
  // URL of the borshch's own photo. Shown small next to its name.
  cover = null,
  coverSrc = '',
  // The cross asks «Вийти з оцінки?» once something is answered or a photo is
  // picked; the answers stay in the caller's draft either way, a photo does not.
  confirmExit = false,
  // Send the picked photos to the borshch and leave (NAV-228). A photo lives
  // only in memory until the closing screen: on 24.11.2026 a photo picked on
  // the first screen of a rating vanished with the cross, and the person was
  // sure it had been sent. With this the sheet offers «Надіслати фото й вийти».
  // Async; a rejection keeps the sheet open with a line about the failure.
  // Without it (a borshch that does not exist yet) the sheet only warns.
  onExitWithPhotos = null,
  // The answers came in a link from another browser (services/handoff), and
  // anybody can write one. The comment screen then shows every answer, the
  // way the closing screen does, with «Змінити відповіді»: nothing is sent
  // that the person has not seen.
  carried = false,
}) => {
  const { t, lang } = useI18n();
  const [step, setStep] = useState(() => Math.max(0, Math.min(Number(initialStep) || 0, steps.length - 1)));
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const fileRef = useRef(null);
  const headingRef = useRef(null);
  const stayRef = useRef(null);
  const quitRef = useRef(null);
  const [authed, setAuthed] = useState(isAuthed);

  const current = steps[Math.min(step, steps.length - 1)];
  // Once a photo failed on this screen, a later clean retry deserves a word;
  // otherwise the warning would simply vanish and leave people guessing.
  const hadPhotoFailure = useRef(false);
  if (status.photosFailed > 0) hadPhotoFailure.current = true;
  const taskSteps = useMemo(() => steps.filter((s) => s.type !== 'done'), [steps]);
  const rates = useMemo(() => steps.some((s) => RATING_TYPES.has(s.type)), [steps]);

  const offset = analytics?.offset || 0;
  const { markClosing } = useFlowTracking({
    flow: analytics?.flow || 'quest',
    // no flow name, no events: a caller that did not ask is not measured
    step: analytics ? current?.key || null : null,
    index: offset + Math.min(step, steps.length - 1),
    total: offset + steps.length,
    finished: current?.type === 'done' && !!status.sent,
    context: analytics?.context || null,
  });

  const perStep = xp.perStep ?? XP_PER_STEP;
  // One rating per person per borshch (11.2026): a second one updates the
  // first and pays nothing; the total stays as it was.
  const updatedRating = Boolean(status.sent && status.updated);
  const multiplier = updatedRating ? 1 : (xp.multiplier || 1);
  const earnedXp = updatedRating ? 0 : coinsEarned(steps, values, perStep) * multiplier;

  const pickedPhotos = (values.photos || []).length;
  const anyAnswer = taskSteps.some((s) => RATING_TYPES.has(s.type) && segmentShare(s, values) > 0)
    || !!(values.comment || '').trim()
    || pickedPhotos > 0;
  // photos already sent with the rating are not lost on the way out
  const unsentPhotos = status.sent ? 0 : pickedPhotos;
  const [exitSending, setExitSending] = useState(false);
  const [exitSendFailed, setExitSendFailed] = useState(false);

  const leave = () => {
    markClosing();
    onExit?.();
  };
  const handleExit = () => {
    if (confirmExit && current?.type !== 'done' && anyAnswer) {
      setExitSendFailed(false);
      setExitOpen(true);
      return;
    }
    leave();
  };
  const sendPhotosAndLeave = async () => {
    if (exitSending) return;
    setExitSending(true);
    setExitSendFailed(false);
    try {
      await onExitWithPhotos();
    } catch (e) {
      setExitSending(false);
      setExitSendFailed(true);
      return;
    }
    setExitSending(false);
    setExitOpen(false);
    leave();
  };

  useEffect(() => {
    onStepChange?.(step);
  }, [step, onStepChange]);

  // The closing screen submits once. A retry goes through onRetry so the caller
  // can reuse whatever it already created instead of duplicating records.
  const submitted = useRef(false);
  useEffect(() => {
    if (current?.type === 'done' && !submitted.current) {
      submitted.current = true;
      onSubmit?.();
    }
  }, [current, onSubmit]);

  // Move the reading position to the new question, or a screen reader keeps
  // announcing the old one while the visuals have already changed.
  useEffect(() => {
    headingRef.current?.focus?.({ preventScroll: true });
  }, [step]);

  useEffect(() => {
    if (exitOpen) stayRef.current?.focus();
  }, [exitOpen]);

  // One preview URL per FILE, not per render and not per list change: removing
  // one photo used to rebuild every URL, which makes the surviving thumbnails
  // blink while the browser decodes them again.
  const photos = useMemo(() => values.photos || [], [values.photos]);
  const urlCache = useRef(new Map());
  const photoUrls = useMemo(() => {
    const cache = urlCache.current;
    const next = new Map();
    const urls = photos.map((file) => {
      const url = cache.get(file) || URL.createObjectURL(file);
      next.set(file, url);
      return url;
    });
    // release whatever is no longer on screen
    cache.forEach((url, file) => { if (!next.has(file)) URL.revokeObjectURL(url); });
    urlCache.current = next;
    return urls;
  }, [photos]);
  useEffect(() => () => {
    urlCache.current.forEach((url) => URL.revokeObjectURL(url));
    urlCache.current = new Map();
  }, []);

  const addPhotos = (fileList) => {
    const picked = Array.from(fileList || []);
    if (!picked.length) return;
    // the same file picked twice is a mistake, not a second photo
    const key = (f) => `${f.name}:${f.size}:${f.lastModified}`;
    const seen = new Set(photos.map(key));
    const merged = [...photos];
    picked.forEach((f) => {
      if (!seen.has(key(f)) && merged.length < MAX_PHOTOS) {
        seen.add(key(f));
        merged.push(f);
      }
    });
    onChange('photos', merged);
  };

  const removePhoto = (index) => {
    onChange('photos', photos.filter((_, i) => i !== index));
  };

  const [coverUrl, setCoverUrl] = useState(null);
  useEffect(() => {
    if (!cover) {
      setCoverUrl(null);
      return undefined;
    }
    let url = null;
    try { url = URL.createObjectURL(cover); } catch (e) { url = null; }
    setCoverUrl(url);
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [cover]);
  const thumb = coverUrl || coverSrc || photoUrls[0] || '';

  const canAdvance = current ? isStepFilled(current, values) : false;
  const gift = current?.type === 'photo' || current?.type === 'comment';
  const nextEnabled = canAdvance || gift;
  const showSkip = current?.type === 'component'
    ? !isStepAnswered(current, values)
    : current?.type === 'photo' && !isStepAnswered(current, values);

  const go = useCallback(
    (delta) => {
      setDir(delta);
      setLeaving(true);
      // 150ms is the exit animation; long enough to read as motion, short
      // enough that a fast tapper never waits for it.
      setTimeout(() => {
        setStep((s) => Math.min(Math.max(s + delta, 0), steps.length - 1));
        setLeaving(false);
      }, 150);
    },
    [steps.length]
  );

  // Desktop: Enter goes forward from a field. On a focused answer Enter and
  // Space choose it (the button's own click), they never skip a screen.
  useEffect(() => {
    const onKey = (e) => {
      if (exitOpen) {
        if (e.key === 'Escape') setExitOpen(false);
        return;
      }
      if (!current || current.type === 'done') return;
      const tag = e.target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'BUTTON' || tag === 'A') return;
      if (e.key === 'Enter' && nextEnabled) {
        e.preventDefault?.();
        go(1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, nextEnabled, go, exitOpen]);

  // «Змінити відповіді»: back to the first rating screen, answers kept
  const jumpTo = (index) => {
    if (index < 0) return;
    setDir(-1);
    setLeaving(true);
    setTimeout(() => {
      setStep(Math.min(Math.max(index, 0), steps.length - 1));
      setLeaving(false);
    }, 150);
  };

  const handleSignIn = async (credentialResponse) => {
    await onSignIn?.(credentialResponse);
    const signedIn = isAuthed();
    setAuthed(signedIn);
    if (signedIn) go(1);
  };

  const kickerFor = (s) => {
    if (s.type === 'component') return t('r3.kicker', { n: s.index, total: s.of });
    if (s.type === 'overall') return t('r3.required');
    if (s.type === 'photo' || s.type === 'comment') return t('r3.optional');
    return t('flow.step', { n: Math.min(step + 1, taskSteps.length), total: taskSteps.length });
  };
  const illuFor = (s) => {
    if (s.illu) return illustration(s.illu);
    if (s.type === 'comment') return illustration('comment');
    if (s.type === 'photo') return illustration('photo');
    if (s.type === 'signin') return illustration('hero');
    return null;
  };
  // single words (a part's name) stand large; questions as titles a size down
  const titleFor = (s) => (s.type === 'comment' ? t('r3.comment.title') : t(s.i18n));
  const bigTitle = current && (RATING_TYPES.has(current.type) || current.type === 'comment');

  const showsSummary = rates && (current?.type === 'done' || (carried && current?.type === 'comment'));
  const summary = showsSummary ? summaryPhrases(values, t, lang) : [];
  const firstRating = steps.findIndex((s) => RATING_TYPES.has(s.type));

  // «Твій Борщ у двох словах»: the closing screen, and the comment screen of
  // a carried rating, before anything is sent
  const summaryBlock = (id) => (
    <section className={style.sum} aria-labelledby={id}>
      <h3 className={style.sumTitle} id={id}>{t('r3.sumTitle')}</h3>
      {summary.length > 0 ? (
        <>
          <div className={style.tags}>
            {summary.map((p) => <span className={style.tag} key={p}>{p}</span>)}
          </div>
          <p className={style.sumNote}>{t('r3.sumNote')}</p>
        </>
      ) : (
        <p className={style.sumNote}>{t('r3.sumOnlyOverall')}</p>
      )}
      {values.overall ? (
        <div className={style.sumOverall}>
          <span className={style.sumK}>{t('r3.sumOverall')}</span>
          <b>{values.overall}</b>
          <span>{t(`r3.overall.${values.overall}`)}</span>
        </div>
      ) : null}
      {values.aftertaste ? (
        <div className={style.sumAfter}>
          <span className={style.sumK}>{t('r3.sumAftertaste')}</span>
          <span>{lowerFirst(t(`r3.aftertaste.${values.aftertaste}`), lang)}</span>
        </div>
      ) : null}
    </section>
  );

  const head = current && current.type !== 'done' && (
    <div className={style.headRow}>
      <div className={style.headTxt}>
        <p className={style.kicker}>{kickerFor(current)}</p>
        <h2
          className={`${style.question} ${bigTitle ? style.titleBig : ''}`}
          ref={headingRef}
          tabIndex={-1}
          id="quest-title"
        >
          {titleFor(current)}
        </h2>
      </div>
      {illuFor(current) && <img className={style.illu} src={illuFor(current)} alt="" width="88" height="88" />}
    </div>
  );

  return (
    <div className={style.flow} data-type={current?.type || 'rate'} data-step={current?.key || ''}>
      <header className={style.head}>
        <button type="button" className={style.quit} onClick={handleExit} aria-label={t('card.close')} ref={quitRef}>
          <IconClose size={22} />
        </button>

        {/* one segment per screen, filled by how much of it was answered */}
        <div
          className={style.segments}
          data-many={taskSteps.length > 10 || undefined}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={taskSteps.length}
          aria-valuenow={Math.min(step + 1, taskSteps.length)}
        >
          {taskSteps.map((s, i) => {
            const share = current?.type === 'done' ? 1 : segmentShare(s, values);
            const seen = current?.type === 'done' || i <= step;
            return (
              <span
                key={s.key}
                className={`${style.segment} ${seen ? style.segSeen : ''} ${share === 1 ? style.segOn : ''} ${i === step && current?.type !== 'done' ? style.segNow : ''}`}
                style={{ '--f': share }}
              >
                <i />
              </span>
            );
          })}
        </div>

        <span className={style.xp} key={earnedXp} role="img" aria-label={t('coin.aria', { n: earnedXp })}>
          <CoinIcon size={24} className={style.coin} />
          <span>{earnedXp} {t('coin.ticker')}</span>
          {multiplier > 1 && <span className={style.xpMult}>×{multiplier}</span>}
        </span>
      </header>

      {(title || subtitle) && current?.type !== 'done' && (
        <p className={style.ctx}>
          {thumb && <img src={thumb} alt={t('bowl.coverAlt')} />}
          <span>
            {title && <b>{title}</b>}
            {title && subtitle ? ' · ' : ''}
            {subtitle}
          </span>
        </p>
      )}

      <div
        className={`${style.stage} ${leaving ? style.leaving : ''} ${dir < 0 ? style.backward : ''}`}
        key={step}
      >
        {head}
        {current?.hint && !RATING_TYPES.has(current.type) && current.type !== 'comment' && (
          <p className={style.hint}>{t(current.hint)}</p>
        )}

        {current?.type === 'component' && (
          <ComponentQuestions step={current} values={values} onChange={onChange} />
        )}

        {current?.type === 'overall' && (
          <OverallQuestion value={values.overall ?? null} onChange={onChange} />
        )}

        {current?.type === 'choice' && (
          <div className={style.answers} role="radiogroup" aria-labelledby="quest-title">
            {current.options.map((o) => {
              const on = values[current.key] === o.value;
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  role="radio"
                  className={`${style.card} ${on ? style.cardOn : ''}`}
                  onClick={() => onChange(current.key, o.value)}
                  aria-checked={on}
                >
                  <span className={style.cardLabel}>{t(o.i18n)}</span>
                  <span className={style.cardTick} aria-hidden="true" />
                </button>
              );
            })}
          </div>
        )}

        {current?.type === 'text' && (
          <div className={style.field}>
            <input
              type="text"
              className={style.input}
              value={values[current.key] || ''}
              onChange={(e) => onChange(current.key, e.target.value)}
              placeholder={t(current.placeholder)}
              maxLength={current.maxLength || 80}
              autoComplete="off"
              aria-labelledby="quest-title"
            />
            {current.chips && (
              <div className={style.chips}>
                {current.chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${style.chip} ${values[current.key] === t(c) ? style.chipOn : ''}`}
                    onClick={() => onChange(current.key, t(c))}
                  >
                    {t(c)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {current?.type === 'number' && (
          <div className={style.field}>
            <div className={style.numberWrap}>
              <input
                type="number"
                inputMode="numeric"
                className={`${style.input} ${style.number}`}
                value={values[current.key] ?? ''}
                onChange={(e) => onChange(current.key, e.target.value)}
                placeholder="0"
                min={current.min ?? 0}
                aria-labelledby="quest-title"
              />
              <span className={style.unit}>{t(current.unit)}</span>
            </div>
            {current.chips && (
              <div className={style.chips}>
                {current.chips.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className={`${style.chip} ${String(values[current.key]) === String(c) ? style.chipOn : ''}`}
                    onClick={() => onChange(current.key, String(c))}
                  >
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {current?.type === 'photo' && (
          <div className={style.field}>
            {photos.length > 0 && (
              <div className={style.shots}>
                {photos.map((file, i) => (
                  <div className={style.shot} key={`${file.name}-${file.size}-${file.lastModified}`}>
                    <img src={photoUrls[i]} alt="" />
                    {/* top-left, where the thumbnail's own content is least
                        interesting and a thumb reaches without covering it */}
                    <button
                      type="button"
                      className={style.shotRemove}
                      onClick={() => removePhoto(i)}
                      aria-label={t('flow.photoRemove')}
                      title={t('flow.photoRemove')}
                    >
                      <IconClose size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                className={photos.length ? style.addMore : style.bigGhost}
                onClick={() => fileRef.current?.click()}
              >
                <IconCamera size={22} />
                {photos.length ? t('flow.photoAddMore') : t('flow.photoPick')}
              </button>
            )}
            {photos.length === 0 && <p className={style.photoLimit}>{t('photo.limit')}</p>}
            {photos.length > 0 && (
              <p className={style.hint}>{t('flow.photoCount', { n: photos.length, max: MAX_PHOTOS })}</p>
            )}

            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e) => { addPhotos(e.target.files); e.target.value = ''; }}
            />
          </div>
        )}

        {current?.type === 'comment' && carried && rates && (
          <div className={style.carried} data-testid="carried-summary">
            <p className={style.carriedNote}>{t('r3.carriedNote')}</p>
            {summaryBlock('sum-carried')}
            {firstRating >= 0 && (
              <button type="button" className={style.inlineBtn} onClick={() => jumpTo(firstRating)}>
                {t('r3.carriedEdit')}
              </button>
            )}
          </div>
        )}

        {current?.type === 'comment' && (
          <div className={style.q}>
            <p className={style.qLabel} id="ql-comment"><span>{t('r3.q.comment')}</span></p>
            <textarea
              className={style.textarea}
              value={values.comment || ''}
              onChange={(e) => onChange('comment', e.target.value)}
              placeholder={t('r3.commentPlaceholder')}
              aria-labelledby="ql-comment"
              aria-describedby="comment-hint"
              rows={5}
              maxLength={1000}
            />
            <p className={style.hint} id="comment-hint">{t('r3.commentHint')}</p>
          </div>
        )}

        {current?.type === 'signin' && (
          <div className={style.field}>
            {authed ? (
              <p className={style.signedIn}>{t('flow.signedIn')}</p>
            ) : (
              <div className={style.signinBox}>
                <GoogleAuth onSuccess={handleSignIn} />
              </div>
            )}
          </div>
        )}

        {current?.type === 'done' && (
          <div className={style.done}>
            <div className={style.doneTop}>
              <img className={style.doneIllu} src={illustration('done')} alt="" width="104" height="104" />
              <div className={style.doneWords}>
                {status.saving && (
                  <>
                    <h2 className={style.doneTitle} ref={headingRef} tabIndex={-1}>{t('rate.saving')}</h2>
                    <p className={style.doneSub}>{status.stage ? t(status.stage) : t('rate.savingHint')}</p>
                  </>
                )}
                {!status.saving && status.sent && (
                  <>
                    <h2 className={style.doneTitle} ref={headingRef} tabIndex={-1}>{done.title}</h2>
                    {done.text && <p className={style.doneSub}>{done.text}</p>}
                  </>
                )}
                {!status.saving && !status.sent && (
                  <>
                    <h2 className={style.doneTitle} ref={headingRef} tabIndex={-1}>{t('rate.failed')}</h2>
                    <p className={style.doneSub}>{status.error || t('rate.failedHint')}</p>
                  </>
                )}
              </div>
            </div>

            {status.saving && <div className={style.spinner} aria-hidden="true" />}

            {!status.saving && status.sent && (
              <>
                <div className={style.coinRow}>
                  <CoinIcon size={52} className={style.coinBig} />
                  <div>
                    <p className={style.xpBig}>
                      +{earnedXp} {t('coin.ticker')}
                      {multiplier > 1 && <span className={style.xpMult}>×{multiplier}</span>}
                    </p>
                    {xp.total !== null && xp.total !== undefined && (
                      <p className={style.xpTotal}>{t('flow.xpTotal', { n: xp.total })}</p>
                    )}
                  </div>
                </div>
                <p className={style.coinNote}>
                  {t('coin.testNote')}{' '}
                  <a href={t('coin.whatUrl')} target="_blank" rel="noopener noreferrer">{t('coin.what')}</a>
                </p>
                {updatedRating && (
                  <p className={style.photoWarn} role="status" data-testid="review-updated">{t('flow.reviewUpdated')}</p>
                )}
                {status.photosFailed > 0 && (
                  <div className={style.photoWarn} role="alert">
                    <p>
                      {t('flow.photoFailed', { n: status.photosFailed, total: status.photosTotal || status.photosFailed })}
                    </p>
                    {onRetryPhotos && (
                      <button
                        type="button"
                        className={style.inlineBtn}
                        onClick={onRetryPhotos}
                        disabled={status.photoRetrying}
                      >
                        {status.photoRetrying ? t('flow.stagePhoto') : t('flow.photoRetry')}
                      </button>
                    )}
                  </div>
                )}
                {/* NAV-218: a photo the server took for the AI check (202) is
                    sent, but not on the card yet; saying «завантажено» would
                    send the person to look for it there */}
                {status.photosPending > 0 && (
                  <p className={style.photoWarn} role="status" data-testid="photo-pending">
                    {t('photo.pending', { count: status.photosPending })}
                  </p>
                )}
                {!status.photosFailed && !(status.photosPending > 0) && hadPhotoFailure.current && (
                  <p className={style.photoWarn} role="status">{t('flow.photoRetryOk')}</p>
                )}
                {rates && summaryBlock('sum-title')}
                {doneExtra}
              </>
            )}
          </div>
        )}
      </div>

      <footer className={`${style.foot} ${current?.type === 'done' ? style.footCol : ''}`}>
        {current?.type === 'done' ? (
          !status.saving && (
            <button
              type="button"
              className={style.cta}
              onClick={status.sent ? onExit : onRetry}
            >
              {status.sent ? done.cta || t('flow.toBorsch') : t('rate.retry')}
            </button>
          )
        ) : (
          <>
            {step > 0 && (
              <button type="button" className={style.backBtn} onClick={() => go(-1)} aria-label={t('flow.back')}>
                <IconChevronLeft size={24} />
              </button>
            )}
            {showSkip && (
              <button type="button" className={style.skip} onClick={() => go(1)}>
                {t('flow.skip')}
              </button>
            )}
            <button
              type="button"
              className={`${style.cta} ${canAdvance ? style.ctaReady : ''}`}
              disabled={!nextEnabled}
              onClick={() => go(1)}
            >
              {step === steps.length - 2 ? t('flow.send') : t('flow.next')}
            </button>
          </>
        )}
      </footer>

      {exitOpen && (
        <div className={style.scrim} onClick={(e) => { if (e.target === e.currentTarget) setExitOpen(false); }}>
          <div className={style.sheet} role="dialog" aria-modal="true" aria-labelledby="exit-title">
            <h2 className={style.sheetTitle} id="exit-title">{t('r3.exitTitle')}</h2>
            <p className={style.sheetText}>{t('r3.exitText')}</p>
            {unsentPhotos > 0 && (
              <p className={style.sheetText} data-testid="exit-photo-note">
                {t(onExitWithPhotos ? 'r3.exitPhotoSend' : 'r3.exitPhotoLost', { count: unsentPhotos })}
              </p>
            )}
            {exitSendFailed && (
              <p className={style.sheetText} role="alert">{t('r3.exitPhotoFailed')}</p>
            )}
            {unsentPhotos > 0 && onExitWithPhotos && (
              <button type="button" className={style.cta} onClick={sendPhotosAndLeave} disabled={exitSending}>
                {exitSending ? t('rev.photoUploading') : t('r3.exitSendPhotos', { count: unsentPhotos })}
              </button>
            )}
            <button
              type="button"
              className={unsentPhotos > 0 && onExitWithPhotos ? style.ghostBtn : style.cta}
              ref={stayRef}
              onClick={() => { setExitOpen(false); quitRef.current?.focus(); }}
              disabled={exitSending}
            >
              {t('r3.exitStay')}
            </button>
            <button type="button" className={style.ghostBtn} onClick={() => { setExitOpen(false); leave(); }} disabled={exitSending}>
              {unsentPhotos > 0 ? t('r3.exitLeaveNoPhoto', { count: unsentPhotos }) : t('r3.exitLeave')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
