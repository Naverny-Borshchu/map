import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BorschLevel } from '../BorschLevel';
import { Mascot } from '../Mascot';
import { GoogleAuth } from '../GoogleAuth';
import { useT } from '../../i18n';
import { optionForValue, scaleEnds } from './answers';
import { tokenStorage } from '../../services/tokenStorage';
import style from './QuestFlow.module.scss';

/**
 * The gamified quest engine behind both journeys — rating a borsch and adding
 * one. Shape borrowed from Duolingo, for the reason Duolingo has it: ONE task
 * per screen, ONE forward button, and visible progress. A person who is looking
 * at a single question answers it; a person looking at a nine-field form
 * closes the tab.
 *
 * The engine owns the frame (background, progress, XP, transitions, keyboard)
 * and nothing about borsch. Callers pass step descriptors:
 *
 *   { type: 'scale',  key, i18n, options: [{ value, i18n, emoji, mood }] }
 *   { type: 'choice', key, i18n, options: [{ value, i18n, emoji }] }
 *   { type: 'text',   key, i18n, hint, placeholder, chips: [i18n keys] }
 *   { type: 'number', key, i18n, hint, unit, chips: [numbers], min }
 *   { type: 'photo',  key }        — optional by nature, holds a list of files
 *   { type: 'comment',key }        — optional by nature
 *   { type: 'signin', key }        — a wall we only raise after the work is done
 *   { type: 'done',   key }        — submits on arrival
 *
 * Values live in the caller (it knows how to submit them); the engine only
 * reads `values[key]` and calls `onChange(key, next)`.
 */

// Every step is worth the same XP, so the number in the header only ever grows
// by tapping — no hidden scoring the user cannot predict.
export const XP_PER_STEP = 10;

const HUES = {
  meat: '#B3402F',
  beetroot: '#A3245A',
  density: '#8A5A2B',
  salt: '#3F6C7A',
  aftertaste: '#6B4E8F',
  serving: '#2F7059',
  overall: '#5D7E52',
  meatType: '#8C4A2F',
  name: '#2F6C7A',
  price: '#7A5C2F',
  weight: '#4A5F8F',
  photo: '#2F7059',
  comment: '#6B4E8F',
  signin: '#33526B',
  done: '#A3245A',
};

const hueFor = (step) => HUES[step?.key] || HUES[step?.type] || '#5D7E52';

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
  return isStepFilled(step, values);
};

/** A step counts as satisfied when it can be left without losing anything. */
export const isStepFilled = (step, values) => {
  const v = values[step.key];
  switch (step.type) {
    case 'scale':
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

export const QuestFlow = ({
  steps,
  values,
  onChange,
  // 'scale' steps render ten numbered taps instead of five worded answers.
  // A build-time arm (REACT_APP_RATE_SCALE), passed in so it can be tested.
  scale10 = false,
  title = '',
  xp = { perStep: XP_PER_STEP, multiplier: 1, total: null },
  status = { saving: false, sent: false, error: '', stage: '' },
  done = {},
  onSubmit,
  onRetry,
  onExit,
  onSignIn,
  initialStep = 0,
  onStepChange,
}) => {
  const t = useT();
  const [step, setStep] = useState(() => Math.max(0, Number(initialStep) || 0));
  const [dir, setDir] = useState(1);
  const [leaving, setLeaving] = useState(false);
  const fileRef = useRef(null);
  const headingRef = useRef(null);
  const [authed, setAuthed] = useState(isAuthed);

  const current = steps[Math.min(step, steps.length - 1)];
  const taskSteps = useMemo(() => steps.filter((s) => s.type !== 'done'), [steps]);
  const scaleSteps = useMemo(() => steps.filter((s) => s.type === 'scale'), [steps]);

  const filledCount = taskSteps.filter((s, i) => i < step || isStepAnswered(s, values)).length;
  const scaleFilled = scaleSteps.filter((s) => isStepFilled(s, values)).length;
  const earnedXp = scaleFilled * xp.perStep * xp.multiplier;

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
    headingRef.current?.focus?.();
  }, [step]);

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

  const canAdvance = current ? isStepFilled(current, values) : false;
  const optional = current?.type === 'photo' || current?.type === 'comment';

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

  const pick = (value) => {
    onChange(current.key, value);
  };

  // Desktop: digits pick an answer, Enter goes forward. Costs nothing on a
  // phone and makes the flow genuinely fast on a keyboard.
  useEffect(() => {
    const onKey = (e) => {
      if (!current || current.type === 'done') return;
      if (e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'INPUT') {
        if (e.key === 'Enter' && canAdvance) go(1);
        return;
      }
      if (/^[1-9]$/.test(e.key) && current.options) {
        const opt = current.options[Number(e.key) - 1];
        if (opt) onChange(current.key, opt.value);
      }
      if (e.key === 'Enter' && (canAdvance || optional)) go(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current, canAdvance, optional, go, onChange]);

  const selectedOption = current?.type === 'scale' && scale10
    ? optionForValue(current.key, values[current.key])
    : current?.options?.find((o) => o.value === values[current.key]);
  const mood = current?.type === 'done'
    ? 'party'
    : selectedOption?.mood || (current?.type === 'photo' ? 'happy' : current?.type === 'comment' ? 'love' : 'idle');

  const handleSignIn = async (credentialResponse) => {
    await onSignIn?.(credentialResponse);
    const signedIn = isAuthed();
    setAuthed(signedIn);
    if (signedIn) go(1);
  };

  return (
    <div
      className={style.flow}
      style={{ '--hue': hueFor(current) }}
      data-type={current?.type || 'rate'}
    >
      <div className={style.bg} aria-hidden="true">
        <span className={style.blob1} />
        <span className={style.blob2} />
        <span className={style.blob3} />
      </div>

      <header className={style.head}>
        <button type="button" className={style.quit} onClick={onExit} aria-label={t('card.close')}>
          ×
        </button>

        {/* one segment per task, so "how much is left" is countable, not guessed */}
        <div
          className={style.segments}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={taskSteps.length}
          aria-valuenow={filledCount}
        >
          {taskSteps.map((s, i) => (
            <span
              key={s.key}
              className={`${style.segment} ${
                i < step || isStepAnswered(s, values) ? style.segOn : i === step ? style.segNow : ''
              }`}
            />
          ))}
        </div>

        <span className={style.xp} key={earnedXp}>
          {earnedXp} XP
          {xp.multiplier > 1 && <span className={style.xpMult}> ×{xp.multiplier}</span>}
        </span>
      </header>

      <div
        className={`${style.stage} ${leaving ? style.leaving : ''} ${dir < 0 ? style.back : ''}`}
        key={step}
      >
        {current?.type !== 'done' && (
          <>
            <div className={style.mascotBox}>
              <Mascot mood={mood} size={92} key={`${current?.key}-${mood}`} />
            </div>
            <p className={style.stepCount}>
              {title ? `${title} · ` : ''}
              {t('flow.step', { n: Math.min(step + 1, taskSteps.length), total: taskSteps.length })}
            </p>
            <h2 className={style.question} ref={headingRef} tabIndex={-1}>
              {t(current.i18n)}
            </h2>
            {current.hint && <p className={style.hint}>{t(current.hint)}</p>}
          </>
        )}

        {current?.type === 'scale' && scale10 && (
          <>
            <div className={style.scale} role="group" aria-label={t(current.i18n)}>
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
                const on = values[current.key] === n;
                return (
                  <button
                    key={n}
                    type="button"
                    className={`${style.dot} ${on ? style.dotOn : ''}`}
                    onClick={() => pick(n)}
                    aria-label={String(n)}
                    aria-pressed={on}
                  >
                    <BorschLevel level={n} size={26} />
                    <span className={style.dotNum}>{n}</span>
                  </button>
                );
              })}
            </div>
            <div className={style.ends}>
              <span>{t(scaleEnds(current.key).left)}</span>
              <span>{t(scaleEnds(current.key).right)}</span>
            </div>
          </>
        )}

        {((current?.type === 'scale' && !scale10) || current?.type === 'choice') && (
          <div className={style.answers} role="group" aria-label={t(current.i18n)}>
            {current.options.map((o, i) => {
              const on = values[current.key] === o.value;
              return (
                <button
                  key={String(o.value)}
                  type="button"
                  className={`${style.card} ${on ? style.cardOn : ''}`}
                  onClick={() => pick(o.value)}
                  aria-pressed={on}
                >
                  <span className={style.cardEmoji} aria-hidden="true">
                    <BorschLevel level={o.value} size={34} />
                  </span>
                  <span className={style.cardLabel}>{t(o.i18n)}</span>
                  <span className={style.cardKey} aria-hidden="true">{i + 1}</span>
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
                      ×
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
                📷 {photos.length ? t('flow.photoAddMore') : t('flow.photoPick')}
              </button>
            )}
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

        {current?.type === 'comment' && (
          <div className={style.field}>
            <textarea
              className={style.textarea}
              value={values.comment || ''}
              onChange={(e) => onChange('comment', e.target.value)}
              placeholder={t('rate.commentPlaceholder')}
              rows={4}
            />
          </div>
        )}

        {current?.type === 'signin' && (
          <div className={style.field}>
            {authed ? (
              <p className={style.signedIn}>✅ {t('flow.signedIn')}</p>
            ) : (
              <div className={style.signinBox}>
                <GoogleAuth onSuccess={handleSignIn} />
              </div>
            )}
          </div>
        )}

        {current?.type === 'scale' && (
          <p className={style.praise} aria-live="polite">
            {selectedOption ? t(selectedOption.praise || 'flow.praiseMid') : ' '}
          </p>
        )}

        {current?.type === 'done' && (
          <>
            {status.sent && (
              <div className={style.confetti} aria-hidden="true">
                {Array.from({ length: 16 }, (_, i) => (
                  <span key={i} className={style.piece} style={{ '--i': i }} />
                ))}
              </div>
            )}
            <div className={style.mascotBox}>
              <Mascot mood={status.sent ? 'party' : 'happy'} size={124} />
            </div>
            {status.saving && (
              <>
                <h2 className={style.question}>{t('rate.saving')}</h2>
                <p className={style.hint}>{status.stage ? t(status.stage) : t('rate.savingHint')}</p>
                <div className={style.spinner} aria-hidden="true" />
              </>
            )}
            {!status.saving && status.sent && (
              <>
                <h2 className={style.question}>{done.title}</h2>
                <p className={style.hint}>{done.text}</p>
                <p className={style.xpBig}>
                  +{earnedXp} XP
                  {xp.multiplier > 1 && <span className={style.xpMult}> ×{xp.multiplier}</span>}
                </p>
                {xp.total !== null && xp.total !== undefined && (
                  <p className={style.xpTotal}>{t('flow.xpTotal', { n: xp.total })}</p>
                )}
              </>
            )}
            {!status.saving && !status.sent && (
              <>
                <h2 className={style.question}>{t('rate.failed')}</h2>
                <p className={style.hint}>{status.error || t('rate.failedHint')}</p>
              </>
            )}
          </>
        )}
      </div>

      <footer className={style.foot}>
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
            <button
              type="button"
              className={`${style.cta} ${canAdvance ? style.ctaReady : ''}`}
              disabled={!canAdvance && !optional}
              onClick={() => go(1)}
            >
              {step === steps.length - 2 ? t('flow.finish') : t('flow.next')}
            </button>
            <div className={style.footLinks}>
              {step > 0 && (
                <button type="button" className={style.back} onClick={() => go(-1)}>
                  {t('flow.back')}
                </button>
              )}
              {optional && !isStepAnswered(current, values) && (
                <button type="button" className={style.skip} onClick={() => go(1)}>
                  {t('flow.skip')}
                </button>
              )}
            </div>
          </>
        )}
      </footer>
    </div>
  );
};
