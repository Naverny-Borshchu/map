import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { BowlArt, DensityRail } from './BowlArt';
import { DENSITY_LEVEL, SIDE_CODES, isAnswered, visibleQuestions } from './answers';
import style from './QuestFlow.module.scss';

/**
 * The controls of the Оцінювання 3.0 screens (NAV-216), as in the approved
 * prototype: amount cards with a drawn bowl, five word pills, the 1..N scale
 * of ten (salt: nine) stops, check chips for the sides, ten big digits.
 *
 * Every single-choice control is a radiogroup with a roving tabindex: Tab
 * enters the group, the arrows move and choose. Nothing here moves the flow
 * on: only «Далі» does (Андрій 15.11: «я б хотів кнопку далі натискати»).
 */

const Tick = () => (
  <span className={style.tick} aria-hidden="true">
    <svg width="14" height="14" viewBox="0 0 24 24">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

const Check = () => (
  <span className={style.box} aria-hidden="true">
    <svg width="12" height="12" viewBox="0 0 24 24">
      <path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

/**
 * A radiogroup of buttons. `items`: [{ value, className, label, content }].
 * wrap      arrows wrap around (pills, cards) or stop at the ends (a scale)
 * rowStep   Up / Down jump a row (the 5 + 5 digits)
 */
const RadioGroup = ({ items, value, onSelect, className, labelledBy, wrap = true, rowStep = 1, groupProps = {}, children }) => {
  const refs = useRef([]);
  const chosen = items.findIndex((it) => it.value === value);
  const onKeyDown = (e) => {
    const keys = { ArrowRight: 1, ArrowDown: rowStep, ArrowLeft: -1, ArrowUp: -rowStep };
    if (!(e.key in keys) && e.key !== 'Home' && e.key !== 'End') return;
    const i = refs.current.indexOf(e.target);
    if (i < 0) return;
    e.preventDefault();
    const n = items.length;
    let j;
    if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = n - 1;
    else if (!wrap) j = Math.max(0, Math.min(n - 1, i + keys[e.key]));
    else j = (i + keys[e.key] + n * 10) % n;
    onSelect(items[j].value);
    refs.current[j]?.focus();
  };
  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className={className} onKeyDown={onKeyDown} {...groupProps}>
      {children}
      {items.map((it, i) => (
        <button
          key={String(it.value)}
          ref={(el) => { refs.current[i] = el; }}
          type="button"
          role="radio"
          aria-checked={it.value === value}
          aria-label={it.label}
          tabIndex={(chosen < 0 ? i === 0 : i === chosen) ? 0 : -1}
          className={it.className}
          data-v={it.value}
          onClick={(e) => {
            // a pointer on a scale already chose on pointerdown / pointerup
            if (it.pointerPicked && e.detail > 0) return;
            onSelect(it.value);
          }}
        >
          {it.content}
        </button>
      ))}
    </div>
  );
};

// --- «скільки»: big cards with a top-view bowl -------------------------------------
const AmountCards = ({ q, value, onSelect, labelledBy }) => {
  const t = useT();
  return (
    <RadioGroup
      className={style.amount}
      labelledBy={labelledBy}
      value={value}
      onSelect={onSelect}
      groupProps={{ style: { '--n': q.values.length }, 'data-n': q.values.length }}
      items={q.values.map((v) => ({
        value: v,
        className: style.opt,
        content: (
          <>
            <BowlArt kind={q.draw} level={v} className={style.picto} />
            <span className={style.optT}>{t(`r3.${q.key}.${v}`)}</span>
            <Tick />
          </>
        ),
      }))}
    />
  );
};

// --- «смак»: five word pills, no numbers ---------------------------------------------
const TastePills = ({ q, value, onSelect, labelledBy }) => {
  const t = useT();
  return (
    <RadioGroup
      className={`${style.taste} ${q.layout === 'pairs' ? style.pairs : ''}`}
      labelledBy={labelledBy}
      value={value}
      onSelect={onSelect}
      items={[1, 2, 3, 4, 5].map((v) => ({
        value: v,
        className: style.pill,
        content: t(`r3.${q.key}.${v}`),
      }))}
    />
  );
};

// --- густина і сіль: a slider of stops, nothing preselected ---------------------------
/**
 * Tap anywhere on the track or drag; the thumb snaps to a stop. Mouse and pen
 * pick at once. A finger picks on lift (a tap) or once it moves sideways (a
 * drag), so a vertical swipe that starts on the track scrolls the page and
 * changes nothing. The readout sits above the track: a finger never hides it.
 */
const Scale = ({ q, value, onSelect, labelledBy }) => {
  const t = useT();
  const max = q.max || 10;
  const trackRef = useRef(null);
  const drag = useRef(null);
  const [dragging, setDragging] = useState(false);
  const isSalt = q.key === 'salt';

  const valueAt = (x) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || r.width <= 0) return null;
    return Math.max(1, Math.min(max, Math.floor(((x - r.left) / r.width) * max) + 1));
  };
  const pickAt = (x, target) => {
    const stop = target?.closest?.('[role="radio"]');
    const v = stop ? Number(stop.getAttribute('data-v')) : valueAt(x);
    if (v && v !== value) onSelect(v);
  };
  const end = () => {
    drag.current = null;
    setDragging(false);
  };

  const word = (n) => t(`r3.${q.key}.${n}`);
  const pos = (n) => `${((n - 0.5) / max) * 100}%`;

  return (
    <div
      className={`${style.scale} ${isSalt ? style.scaleSalt : style.scaleDensity} ${dragging ? style.dragging : ''}`}
      data-v={value || undefined}
      style={{ '--pos': pos(value || 1), '--best': q.best ? pos(q.best) : '50%', '--max': max }}
    >
      <div className={style.readout} aria-hidden="true">
        {!isSalt && (
          <span className={style.roPic}>
            {value ? <BowlArt kind="broth" level={DENSITY_LEVEL[value]} /> : <BowlArt kind="empty" />}
          </span>
        )}
        {value ? (
          <p className={style.roTxt} key={value}>
            <span className={style.roN}>
              {t('r3.scaleOf', { n: value, max })}
              {q.best === value && <span className={style.roBest}>{t('r3.best')}</span>}
            </span>
            <span className={style.roW}>{word(value)}</span>
          </p>
        ) : (
          <p className={style.roPh}>{t('r3.scaleHint')}</p>
        )}
      </div>
      <RadioGroup
        className={style.scaleTrack}
        labelledBy={labelledBy}
        value={value}
        onSelect={onSelect}
        wrap={false}
        groupProps={{
          ref: trackRef,
          'data-scale': q.key,
          onPointerDown: (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            const touch = e.pointerType === 'touch';
            drag.current = { id: e.pointerId, x0: e.clientX, y0: e.clientY, live: !touch };
            try { e.currentTarget.setPointerCapture?.(e.pointerId); } catch (err) { /* synthetic events */ }
            if (!touch) {
              setDragging(true);
              pickAt(e.clientX, e.target);
            }
          },
          onPointerMove: (e) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.id) return;
            if (!d.live) {
              const dx = Math.abs(e.clientX - d.x0);
              const dy = Math.abs(e.clientY - d.y0);
              if (dx < 6 || dx < dy) return;
              d.live = true;
              setDragging(true);
            }
            const v = valueAt(e.clientX);
            if (v && v !== value) onSelect(v);
          },
          onPointerUp: (e) => {
            const d = drag.current;
            if (!d || e.pointerId !== d.id) return;
            if (!d.live) pickAt(e.clientX, document.elementFromPoint?.(e.clientX, e.clientY) || e.target);
            end();
          },
          onPointerCancel: end,
        }}
        items={Array.from({ length: max }, (_, i) => i + 1).map((n) => ({
          value: n,
          pointerPicked: true,
          className: `${style.stop} ${q.best === n ? style.isBest : ''}`,
          label: `${t('r3.scaleStop', { n, word: word(n) })}${q.best === n ? `, ${t('r3.best')}` : ''}`,
          content: <span className={style.tickN}>{n}</span>,
        }))}
      >
        {isSalt ? (
          <>
            <span className={`${style.rail} ${style.railSalt}`} aria-hidden="true"><i className={style.zone} /></span>
            <span className={style.bestTag} aria-hidden="true">{t('r3.best')}</span>
          </>
        ) : (
          <DensityRail id={`dens-rail-${q.key}`} className={`${style.rail} ${style.railDens}`} />
        )}
        <span className={style.thumb} aria-hidden="true">{value || ''}</span>
      </RadioGroup>
      <div className={style.scaleEnds} aria-hidden="true">
        <span>{t(`r3.${q.key}Left`)}</span>
        <span>{t(`r3.${q.key}Right`)}</span>
      </div>
    </div>
  );
};

// --- подача: check chips, several at once; «Нічого» clears ---------------------------
export const toggleSide = (current, code) => {
  if (code === 'none') return Array.isArray(current) && current.length === 0 ? null : [];
  const list = Array.isArray(current) ? current : [];
  const next = list.includes(code) ? list.filter((c) => c !== code) : [...list, code];
  // the last chip taken off leaves the question unanswered, not «Нічого»
  return next.length ? SIDE_CODES.filter((c) => next.includes(c)) : null;
};

const SidesChips = ({ value, onChange, labelledBy }) => {
  const t = useT();
  const none = Array.isArray(value) && value.length === 0;
  return (
    <div className={style.sides} role="group" aria-labelledby={labelledBy}>
      {SIDE_CODES.map((code) => {
        const on = Array.isArray(value) && value.includes(code);
        return (
          <button
            key={code}
            type="button"
            role="checkbox"
            aria-checked={on}
            className={style.sideChip}
            onClick={() => onChange(toggleSide(value, code))}
          >
            <Check />
            {t(`r3.side.${code}`)}
          </button>
        );
      })}
      <button
        type="button"
        role="checkbox"
        aria-checked={none}
        className={`${style.sideChip} ${style.sideNone}`}
        onClick={() => onChange(toggleSide(value, 'none'))}
      >
        <Check />
        {t('r3.side.none')}
      </button>
    </div>
  );
};

/** One part of the borshch: its questions, one under the other. */
export const ComponentQuestions = ({ step, values, onChange }) => {
  const t = useT();
  return (
    <>
      {step.questions.map((q) => {
        const id = `ql-${q.key}`;
        const hidden = !visibleQuestions(step, values).includes(q);
        return (
          <div className={style.q} key={q.key} data-q={q.key}>
            {hidden ? (
              <p className={style.note} role="note">{t(q.note)}</p>
            ) : (
              <>
                <p className={style.qLabel} id={id}>
                  <span>{t(`r3.q.${q.key}`)}</span>
                  {q.kind === 'sides' && <span className={style.qHint}>{t('r3.q.sidesHint')}</span>}
                </p>
                {q.kind === 'amount' && (
                  <AmountCards q={q} value={values[q.key]} labelledBy={id} onSelect={(v) => onChange(q.key, v)} />
                )}
                {q.kind === 'taste' && (
                  <TastePills q={q} value={values[q.key]} labelledBy={id} onSelect={(v) => onChange(q.key, v)} />
                )}
                {q.kind === 'scale' && (
                  <Scale q={q} value={values[q.key]} labelledBy={id} onSelect={(v) => onChange(q.key, v)} />
                )}
                {q.kind === 'sides' && (
                  <SidesChips value={values.sides} labelledBy={id} onChange={(v) => onChange('sides', v)} />
                )}
              </>
            )}
          </div>
        );
      })}
    </>
  );
};

/** «Загалом»: ten big Roboto digits, Pasha's word under the chosen one. */
export const OverallQuestion = ({ value, onChange }) => {
  const t = useT();
  const id = 'ql-overall';
  return (
    <div className={style.q}>
      <p className={style.qLabel} id={id}><span>{t('r3.q.overall')}</span></p>
      <p className={style.edge}>{t('r3.overallLeft')}</p>
      <RadioGroup
        className={style.digits}
        labelledBy={id}
        value={value}
        onSelect={(v) => onChange('overall', v)}
        rowStep={5}
        items={Array.from({ length: 10 }, (_, i) => i + 1).map((n) => ({
          value: n,
          className: style.digit,
          label: t('r3.scaleStop', { n, word: t(`r3.overall.${n}`) }),
          content: n,
        }))}
      />
      <p className={`${style.edge} ${style.edgeR}`}>{t('r3.overallRight')}</p>
      <div className={style.word} aria-live="polite">
        {value ? (
          <p className={style.wordW} key={value}>
            <span className={style.wordN}>{t('r3.scaleOf', { n: value, max: 10 })}</span>
            {t(`r3.overall.${value}`)}
          </p>
        ) : (
          <p className={style.wordPh}>{t('r3.overallHint')}</p>
        )}
      </div>
      <p className={style.req}>{t('r3.overallNote')}</p>
    </div>
  );
};

/** Has this question of the screen an answer? (for tests and callers) */
export const answered = isAnswered;
