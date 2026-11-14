import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { VenuePicker } from '../../components/VenuePicker';
import { GoogleAuth } from '../../components/GoogleAuth';
import { BowlLoader } from '../../components/EmptyState';
import { IconClose } from '../../components/Icons';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { useUser } from '../../context/UserContext';
import { borschAPI, placesAPI, AUTH_REQUIRED_ERROR } from '../../api';
import { MAX_TABLE_BORSCHES, TITLE_MAX, tablesAPI } from '../../api/tables';
import { googleAuth } from '../../services/googleAuth';
import { useNearbyVenues } from '../../hook/useNearbyVenues';
import { useFlowTracking } from '../../hook/useFlowTracking';
import { getPriceChipsForCountry } from '../../utils/currency';
import {
  NEW_NAME_MAX, buildTablePayload, isTableValid, knownFacts, newNameError, validateTable,
} from '../../utils/tableForm';
import { useI18n, useDishLabel, useVenueLabel } from '../../i18n';
import { TableFrame, FrameSegments } from '../TablePage/TableFrame';
import q from '../../components/QuestFlow/QuestFlow.module.scss';
import bowl from '../BowlFlow/BowlFlow.module.scss';
import style from '../TablePage/Table.module.scss';

/**
 * «Ми зібрались компанією»: the host sets a table up once, for everybody.
 *
 *   venue     the nearest venues, or search (hook/useNearbyVenues)
 *   borsch    one or several borshch of that venue, in the order they will
 *             be served (№1, №2...); a new one is typed in right here
 *   facts     price and weight, once, so no guest is ever asked
 *   settings  «Наосліп» and an optional title, then «Створити Стіл»
 *
 * Creating needs an account (the table belongs to its host); the sign-in is
 * asked on the last screen, after the work, like the rating does.
 *
 * Query: ?borsch=<id> (from a borshch card: venue and borshch are set) | ?from=<entry>
 */

const STEPS = ['venue', 'borsch', 'facts', 'settings'];
const HUE = { venue: '#A00322', borsch: '#B5122E', facts: '#860130', settings: '#C0102F' };

const itemFromBorsch = (b) => ({ key: String(b.id_borsch), id: String(b.id_borsch), name: b.name, known: knownFacts(b) });

export const TableCreate = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const { loading: placesLoading, getPlaceById } = usePlaces();
  const { borsch: allBorsch, loading: borschLoading, getBorschById } = useBorsch();
  const { isAuthenticated, completeGoogleSignIn } = useUser();

  const prefillId = params.get('borsch');
  const entry = params.get('from') || (prefillId ? 'card' : 'link');
  const nearby = useNearbyVenues({ skip: Boolean(prefillId) });

  const [step, setStep] = useState(prefillId ? null : 'venue');
  const [place, setPlace] = useState(null);
  const [items, setItems] = useState([]);
  const [facts, setFacts] = useState({});
  const [blind, setBlind] = useState(false);
  const [title, setTitle] = useState('');
  const [newName, setNewName] = useState('');
  const [newError, setNewError] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [created, setCreated] = useState(false);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const headingRef = useRef(null);

  const { markClosing, exit } = useFlowTracking({
    flow: 'table_create',
    step,
    index: step ? STEPS.indexOf(step) : 0,
    total: STEPS.length,
    finished: created,
    context: { entry },
  });

  useEffect(() => {
    headingRef.current?.focus?.();
  }, [step]);

  // --- prefilled from a borshch card -----------------------------------------
  useEffect(() => {
    if (!prefillId || step !== null) return undefined;
    let cancelled = false;
    const fromContext = getBorschById(prefillId);
    if (!fromContext && borschLoading) return undefined;
    (async () => {
      try {
        const b = fromContext || await borschAPI.getById(prefillId);
        const p = getPlaceById(b.place_id)
          || await placesAPI.getById(b.place_id).catch(() => ({ id: b.place_id, name: b.place_name, city: b.place_city }));
        if (cancelled) return;
        setPlace(p);
        setItems([itemFromBorsch(b)]);
        setStep('borsch');
      } catch (e) {
        if (!cancelled) setPrefillFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [prefillId, step, borschLoading, getBorschById, getPlaceById]);

  const borschAt = useCallback(
    (p) => (allBorsch || []).filter((b) => String(b.place_id) === String(p?.id)),
    [allBorsch]
  );
  const errors = useMemo(() => validateTable({ items, facts, title }), [items, facts, title]);
  const unit = getPriceChipsForCountry(place?.country).unit;

  // --- actions -----------------------------------------------------------------
  const close = () => {
    markClosing();
    navigate(entry === 'card' && prefillId ? `/borsch/${prefillId}` : '/');
  };

  const pickPlace = (p) => {
    const here = borschAt(p);
    setPlace(p);
    // most venues have one borshch: it goes on the table, the host can add more
    setItems(here.length === 1 ? [itemFromBorsch(here[0])] : []);
    setFacts({});
    setStep('borsch');
  };

  const toggle = (b) => {
    const key = String(b.id_borsch);
    setItems((prev) => {
      if (prev.some((it) => it.key === key)) return prev.filter((it) => it.key !== key);
      if (prev.length >= MAX_TABLE_BORSCHES) return prev;
      return [...prev, itemFromBorsch(b)];
    });
  };

  const addNew = () => {
    const problem = newNameError(newName, items);
    setNewError(problem);
    if (problem) return;
    const name = newName.trim().replace(/\s+/g, ' ');
    setItems((prev) => [...prev, { key: `new:${name.toLocaleLowerCase('uk')}`, id: null, name, known: { price: null, weight: null } }]);
    setNewName('');
  };

  const removeItem = (key) => {
    setItems((prev) => prev.filter((it) => it.key !== key));
    setFacts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const setFact = (key, kind, value) => {
    setFacts((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), [kind]: value } }));
  };

  const create = async () => {
    if (saving) return;
    setShowErrors(true);
    if (!isTableValid(errors)) {
      if (errors.items) setStep('borsch');
      else if (Object.keys(errors.facts).length) setStep('facts');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const payload = buildTablePayload({ place: String(place.id), items, facts, blind, title });
      const table = await tablesAPI.create(payload, { entry });
      setCreated(true);
      window.dispatchEvent(new Event('borschDataUpdated'));
      navigate(`/t/${table.code}`, { replace: true, state: { created: true } });
    } catch (e) {
      console.error('Не вдалося створити Стіл:', e);
      if (e?.message === AUTH_REQUIRED_ERROR || e?.status === 401) setSaveError(t('table.errSignInCreate'));
      else if (e?.status === 429) setSaveError(t('table.errTooManyTables'));
      else setSaveError(t('table.errCreate'));
      setSaving(false);
    }
  };

  const signIn = async (credentialResponse) => {
    try {
      const data = await googleAuth(credentialResponse.credential);
      completeGoogleSignIn(data);
      setSaveError('');
    } catch (e) {
      setSaveError(t('table.errSignInCreate'));
    }
  };

  // --- render ------------------------------------------------------------------
  const stepIndex = step ? STEPS.indexOf(step) : 0;
  const kicker = (
    <p className={q.stepCount}>
      {t('table.createKicker')}
      {' · '}
      {t('flow.step', { n: stepIndex + 1, total: STEPS.length })}
    </p>
  );
  const context = place && (
    <p className={bowl.context}>
      <span>{venueLabel(place.name)}</span>
      {!prefillId && step !== 'venue' && (
        <button type="button" className={bowl.change} onClick={() => setStep('venue')}>{t('bowl.change')}</button>
      )}
    </p>
  );
  const back = (to) => (
    <button type="button" className={q.back} onClick={() => setStep(to)}>{t('flow.back')}</button>
  );

  let body = null;
  let foot = null;

  if (step === null) {
    body = (
      <div className={bowl.center}>
        {prefillFailed ? (
          <>
            <h2 className={q.question}>{t('rate.notFound')}</h2>
            <button type="button" className={q.cta} onClick={() => navigate('/')}>{t('common.toMap')}</button>
          </>
        ) : (
          <BowlLoader size={52} label={t('common.loading')} />
        )}
      </div>
    );
  }

  if (step === 'venue') {
    body = (
      <VenuePicker
        nearby={nearby}
        loading={placesLoading || borschLoading}
        titles={{ here: t('table.hereTitle'), where: t('table.whereTitle') }}
        kicker={kicker}
        headingRef={headingRef}
        onPick={pickPlace}
      />
    );
    foot = (
      <button type="button" className={q.skip} onClick={() => { exit('new_place'); navigate('/add-borsch'); }}>
        {t('bowl.notListed')}
      </button>
    );
  }

  if (step === 'borsch' && place) {
    const here = borschAt(place);
    const extra = items.filter((it) => !here.some((b) => String(b.id_borsch) === it.key));
    const full = items.length >= MAX_TABLE_BORSCHES;
    body = (
      <>
        {kicker}
        {context}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('table.borschTitle')}</h2>
        <p className={q.hint}>{t('table.borschHint')}</p>
        <div className={bowl.venues} role="group" aria-label={t('table.borschTitle')}>
          {here.map((b) => {
            const at = items.findIndex((it) => it.key === String(b.id_borsch));
            const on = at >= 0;
            return (
              <button
                key={b.id_borsch}
                type="button"
                className={`${bowl.venue} ${style.pickCard} ${on ? `${bowl.venueOn} ${style.pickCardOn}` : ''}`}
                onClick={() => toggle(b)}
                aria-pressed={on}
                disabled={!on && full}
              >
                <span className={style.pickNumber} aria-hidden="true">{on ? t('table.numberShort', { n: at + 1 }) : '+'}</span>
                <span className={bowl.venueWords}>
                  <span className={bowl.venueName}>{dishLabel(b.name)}</span>
                  <span className={bowl.venueAddr}>
                    {b.rating_count ? t('bowl.ratings', { count: b.rating_count }) : t('card.noRatings')}
                  </span>
                </span>
              </button>
            );
          })}
          {extra.map((it) => {
            const at = items.findIndex((x) => x.key === it.key);
            return (
              <div key={it.key} className={`${bowl.venue} ${bowl.venueOn} ${style.pickCard} ${style.pickCardOn}`}>
                <span className={style.pickNumber} aria-hidden="true">{t('table.numberShort', { n: at + 1 })}</span>
                <span className={bowl.venueWords}>
                  <span className={bowl.venueName}>{it.name}</span>
                  <span className={bowl.venueAddr}>{t('table.newBorsch')}</span>
                </span>
                <button type="button" className={style.removeBtn} onClick={() => removeItem(it.key)} aria-label={t('table.removeBorsch', { name: it.name })}>
                  <IconClose size={18} />
                </button>
              </div>
            );
          })}
        </div>
        {here.length === 0 && <p className={q.hint}>{t('bowl.noBorsch')}</p>}
        <label className={style.fieldLabel} htmlFor="table-new-borsch">{t('table.newBorschLabel')}</label>
        <div className={style.newRow}>
          <input
            id="table-new-borsch"
            className={q.input}
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNewError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); addNew(); } }}
            placeholder={t('table.newBorschPlaceholder')}
            maxLength={NEW_NAME_MAX + 10}
            autoComplete="off"
            disabled={full}
          />
          <button type="button" className={style.addBtn} onClick={addNew} disabled={full || !newName.trim()}>
            {t('table.add')}
          </button>
        </div>
        {newError && <p className={style.error} role="alert">{t(`table.newErr.${newError}`, { max: MAX_TABLE_BORSCHES })}</p>}
        {full && <p className={q.hint}>{t('table.full', { max: MAX_TABLE_BORSCHES })}</p>}
        {showErrors && errors.items && <p className={style.error} role="alert">{t('table.errNoBorsch')}</p>}
      </>
    );
    foot = (
      <>
        <button type="button" className={`${q.cta} ${items.length ? q.ctaReady : ''}`} disabled={!items.length} onClick={() => setStep('facts')}>
          {t('flow.next')}
        </button>
        {!prefillId && back('venue')}
      </>
    );
  }

  if (step === 'facts' && place) {
    const hasFactErrors = Object.keys(errors.facts).length > 0;
    body = (
      <>
        {kicker}
        {context}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('table.factsTitle')}</h2>
        <p className={q.hint}>{t('table.factsHint')}</p>
        <ul className={style.factsList}>
          {items.map((it, i) => {
            const f = facts[it.key] || {};
            const err = errors.facts[it.key] || {};
            const known = [
              it.known?.price ? `${it.known.price} ${t(unit)}` : null,
              it.known?.weight ? `${it.known.weight} ${t('flow.unitGram')}` : null,
            ].filter(Boolean).join(', ');
            return (
              <li key={it.key} className={style.factsItem}>
                <div className={style.factsHead}>
                  <span className={style.badge}>{t('table.numberShort', { n: i + 1 })}</span>
                  <span className={style.rowName}>{it.id ? dishLabel(it.name) : it.name}</span>
                </div>
                <p className={style.factsKnown}>{known ? t('table.factsKnown', { facts: known }) : t('table.factsUnknown')}</p>
                <div className={style.factsInputs}>
                  <label className={`${style.factField} ${err.price ? style.factErr : ''}`}>
                    {t('table.price')}
                    <span className={style.factWrap}>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={f.price ?? ''}
                        onChange={(e) => setFact(it.key, 'price', e.target.value)}
                        placeholder={it.known?.price ? String(it.known.price) : ''}
                        aria-invalid={Boolean(err.price)}
                      />
                      <span className={style.factUnit}>{t(unit)}</span>
                    </span>
                  </label>
                  <label className={`${style.factField} ${err.weight ? style.factErr : ''}`}>
                    {t('table.weight')}
                    <span className={style.factWrap}>
                      <input
                        type="number"
                        inputMode="numeric"
                        value={f.weight ?? ''}
                        onChange={(e) => setFact(it.key, 'weight', e.target.value)}
                        placeholder={it.known?.weight ? String(it.known.weight) : ''}
                        aria-invalid={Boolean(err.weight)}
                      />
                      <span className={style.factUnit}>{t('flow.unitGram')}</span>
                    </span>
                  </label>
                </div>
                {(err.price || err.weight) && (
                  <p className={style.error} role="alert">{t(err.price ? 'table.errPrice' : 'table.errWeight')}</p>
                )}
              </li>
            );
          })}
        </ul>
      </>
    );
    foot = (
      <>
        <button type="button" className={q.cta} disabled={hasFactErrors} onClick={() => setStep('settings')}>
          {t('flow.next')}
        </button>
        {back('borsch')}
      </>
    );
  }

  if (step === 'settings' && place) {
    body = (
      <>
        {kicker}
        {context}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('table.settingsTitle')}</h2>
        <button
          type="button"
          className={style.toggleRow}
          role="switch"
          aria-checked={blind}
          onClick={() => setBlind((v) => !v)}
        >
          <span className={style.toggleWords}>
            <span className={style.toggleTitle}>{t('table.blind')}</span>
            <span className={style.toggleHint}>{t('table.blindHint')}</span>
          </span>
          <span className={`${style.switch} ${blind ? style.switchOn : ''}`} aria-hidden="true" />
        </button>
        <div className={style.titleField}>
          <label className={style.fieldLabel} htmlFor="table-title">{t('table.titleLabel')}</label>
          <input
            id="table-title"
            className={q.input}
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t('table.titlePlaceholder')}
            maxLength={TITLE_MAX}
            autoComplete="off"
          />
        </div>
        <ol className={style.chipsRow} aria-label={t('table.onTable', { count: items.length })}>
          {items.map((it, i) => (
            <li key={it.key} className={style.borschChip}>
              {t('table.numberShort', { n: i + 1 })} {it.id ? dishLabel(it.name) : it.name}
            </li>
          ))}
        </ol>
        {!isAuthenticated && (
          <div className={style.door}>
            <p className={q.hint}>{t('table.signinToCreate')}</p>
            <div className={q.signinBox}><GoogleAuth onSuccess={signIn} /></div>
          </div>
        )}
        {saveError && <p className={style.errorBox} role="alert">{saveError}</p>}
      </>
    );
    foot = (
      <>
        <button type="button" className={`${q.cta} ${isAuthenticated ? q.ctaReady : ''}`} onClick={create} disabled={saving || !isAuthenticated}>
          {saving ? t('table.creating') : t('table.create')}
        </button>
        {back('facts')}
      </>
    );
  }

  // the wrapper takes the tab bar padding of the map1 variant (see TablePage)
  return (
    <div className={style.route}>
    <TableFrame
      hue={HUE[step] || HUE.venue}
      onClose={close}
      progress={<FrameSegments total={STEPS.length} index={stepIndex} />}
      foot={foot}
      type="table-create"
    >
      {body}
    </TableFrame>
    </div>
  );
};
