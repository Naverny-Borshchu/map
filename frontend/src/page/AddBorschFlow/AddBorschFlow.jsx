import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QuestFlow, XP_PER_STEP } from '../../components/QuestFlow';
import { hasTenPointScale } from '../../variant';
import { tasteSteps } from '../../components/QuestFlow/answers';
import { placesAPI, borschAPI, commentsAPI } from '../../api';
import { googleAuth, persistGoogleAuthSession } from '../../services/googleAuth';
import { tokenStorage } from '../../services/tokenStorage';
import { useUser } from '../../context/UserContext';
import {
  claimSessionDraftSubmission,
  clearSessionDraft,
  readSessionDraft,
  releaseSessionDraftSubmission,
  writeSessionDraft,
} from '../../components/QuestFlow/sessionDraft';
import { useT } from '../../i18n';
import { submitAddBorsch, emptyProgress, STAGES } from './addBorschSubmit';
import { getPriceChipsForCountry } from '../../utils/currency';
import style from './AddBorschFlow.module.scss';

/**
 * Adding a borsch, as a quest instead of a form.
 *
 * The old screen was one page with photo, name, price, weight and meat type,
 * and it asked for all of it BEFORE the person got to say anything about the
 * borsch they had just eaten — the interesting part came last, or never. This
 * flow inverts it: seven taste questions first, while the taste is still in
 * your mouth, then the four dull facts one screen at a time with chips to tap,
 * then (only then) the account, because by that point there is something worth
 * saving.
 *
 * A brand-new borsch has never been tasted by anyone, so finishing this makes
 * you its Першовар — ×3 XP, same as discovering a virgin pin on the map.
 */

// The values must stay the Ukrainian labels the API layer maps to its enum.
const MEAT_OPTIONS = [
  { value: "Без м'яса", emoji: '🥬', i18n: 'ans.meatNo' },
  { value: 'Курка',     emoji: '🐔', i18n: 'ans.meatChicken' },
  { value: 'Свинина',   emoji: '🐖', i18n: 'ans.meatPork' },
  { value: 'Яловичина', emoji: '🐄', i18n: 'ans.meatBeef' },
  { value: 'Інше',      emoji: '🍲', i18n: 'ans.meatOther' },
];

const XP_MULTIPLIER = 3;
const DRAFT_KEY = 'nb:quest-draft:add-borsch';

export const AddBorschFlow = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const t = useT();
  const { login } = useUser();
  const [restoredDraft] = useState(() => readSessionDraft(DRAFT_KEY));
  const flowContext = state?.place ? state : restoredDraft?.context;

  // Decide once at mount so the step list stays stable until the successful
  // callback. A real token, not the legacy auth flag, is the contract.
  const [needsSignIn] = useState(() => !tokenStorage.getAccess());

  const [values, setValues] = useState(() => ({
    meat: null, beetroot: null, density: null, salt: null,
    aftertaste: null, serving: null, overall: null,
    meatType: null, name: '', price: '', weight: '', comment: '',
    ...(restoredDraft?.values || {}),
    // File objects cannot be serialized by Web Storage; all actual answers do.
    photos: [],
  }));
  const [draftStep, setDraftStep] = useState(() => restoredDraft?.step || 0);
  const [status, setStatus] = useState({ saving: false, sent: false, error: '', stage: '' });
  const [xpTotal, setXpTotal] = useState(null);
  const progress = useRef({ ...emptyProgress(), ...(restoredDraft?.progress || {}) });

  // The venue's country (best-effort guess from the Google address, see
  // AddBorsch.jsx) decides which currency's quick-tap values the price
  // question offers — ₴120-300 means nothing next to a Berlin bill in euros.
  const priceChips = getPriceChipsForCountry(flowContext?.country);

  const steps = useMemo(
    () => [
      ...tasteSteps(),
      { type: 'choice', key: 'meatType', i18n: 'flow.qMeatType', options: MEAT_OPTIONS },
      {
        type: 'text',
        key: 'name',
        i18n: 'flow.qName',
        hint: 'flow.qNameHint',
        placeholder: 'flow.qNamePlaceholder',
        chips: ['chip.borsch', 'chip.borschRed', 'chip.borschGreen', 'chip.borschPampushky'],
      },
      { type: 'number', key: 'price', i18n: 'flow.qPrice', hint: 'flow.qPriceHint', unit: priceChips.unit, chips: priceChips.chips, min: 0 },
      { type: 'number', key: 'weight', i18n: 'flow.qWeight', hint: 'flow.qWeightHint', unit: 'flow.unitGram', chips: [250, 300, 350, 400, 500], min: 0 },
      { type: 'photo', key: 'photo', i18n: 'flow.photoTitle', hint: 'flow.photoHint' },
      { type: 'comment', key: 'comment', i18n: 'flow.commentTitle', hint: 'flow.commentHint' },
      ...(needsSignIn
        ? [{ type: 'signin', key: 'signin', i18n: 'flow.signinTitle', hint: 'flow.signinHint' }]
        : []),
      { type: 'done', key: 'done' },
    ],
    [needsSignIn, priceChips]
  );

  const onChange = useCallback((key, value) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (status.sent || !flowContext?.place) return;
    const { photos, ...serializableValues } = values;
    writeSessionDraft(DRAFT_KEY, {
      step: draftStep,
      values: serializableValues,
      context: flowContext,
      progress: progress.current,
    });
  }, [draftStep, flowContext, status.sent, values]);

  const onSignIn = useCallback(
    async (credentialResponse) => {
      const data = await googleAuth(credentialResponse.credential);
      persistGoogleAuthSession(data);
      login(data.user || data.profile || {});
    },
    [login]
  );

  const runSubmit = useCallback(async () => {
    if (!claimSessionDraftSubmission(DRAFT_KEY)) return;
    setStatus({ saving: true, sent: false, error: '', stage: STAGES.place });
    try {
      await submitAddBorsch({
        place: flowContext.place,
        street: flowContext.street,
        city: flowContext.city,
        values,
        progress: progress.current,
        apis: { placesAPI, borschAPI, commentsAPI },
        onStage: (stage) => setStatus((s) => ({ ...s, stage })),
        onProgress: (nextProgress) => writeSessionDraft(DRAFT_KEY, { progress: nextProgress }),
      });

      // XP and the "already rated" mark, same bookkeeping the rating flow does
      const earned = tasteSteps().length * XP_PER_STEP * XP_MULTIPLIER;
      try {
        const total = (Number(localStorage.getItem('nb_xp')) || 0) + earned;
        localStorage.setItem('nb_xp', String(total));
        setXpTotal(total);
        const rated = JSON.parse(localStorage.getItem('ratedBorsch') || '[]');
        if (!rated.includes(progress.current.borschId)) {
          localStorage.setItem('ratedBorsch', JSON.stringify([...rated, progress.current.borschId]));
        }
      } catch (e) { /* private mode — the borsch is saved either way */ }

      window.dispatchEvent(new Event('borschDataUpdated'));
      clearSessionDraft(DRAFT_KEY);
      setStatus({ saving: false, sent: true, error: '', stage: '' });
    } catch (err) {
      releaseSessionDraftSubmission(DRAFT_KEY);
      // 401 here means the token expired between signing in and saving; say so
      // instead of showing a bare "failed".
      const unauthorized = /AUTH_REQUIRED|401|credentials|unauthor|temp_user_id|Device ID/i.test(err?.message || '');
      setStatus({
        saving: false,
        sent: false,
        error: unauthorized ? t('flow.signinRequired') : err?.message || t('rate.saveError'),
        stage: '',
      });
    }
  }, [flowContext, values, t]);

  const onExit = useCallback(() => {
    const started = Object.entries(values).some(
      ([k, v]) => v !== null && v !== '' && k !== 'photo'
    );
    if (status.sent || !started || window.confirm(t('flow.quitConfirm'))) {
      navigate(status.sent && progress.current.borschId ? `/borsch/${progress.current.borschId}` : '/');
    }
  }, [values, status.sent, navigate, t]);

  // Deep-linked or reloaded: the picked place lives in router state, so without
  // it there is nothing to attach a borsch to.
  if (!flowContext?.place) {
    return (
      <div className={style.fallback}>
        <p>{t('flow.noPlace')}</p>
        <button type="button" className={style.fallbackBtn} onClick={() => navigate('/add-borsch')}>
          {t('flow.pickPlace')}
        </button>
      </div>
    );
  }

  return (
    <QuestFlow
      steps={steps}
      values={values}
      onChange={onChange}
      scale10={hasTenPointScale}
      title={flowContext.place.name}
      xp={{ perStep: XP_PER_STEP, multiplier: XP_MULTIPLIER, total: xpTotal }}
      status={status}
      done={{ title: t('flow.addedTitle'), text: t('flow.addedText'), cta: t('flow.toBorsch') }}
      onSubmit={runSubmit}
      onRetry={runSubmit}
      onExit={onExit}
      onSignIn={onSignIn}
      initialStep={draftStep}
      onStepChange={setDraftStep}
    />
  );
};
