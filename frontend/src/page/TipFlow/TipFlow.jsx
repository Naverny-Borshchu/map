import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { Mascot } from '../../components/Mascot';
import { BowlLoader } from '../../components/EmptyState';
import { GoogleAuth } from '../../components/GoogleAuth';
import { VenuePicker } from '../../components/VenuePicker';
import { GooglePlacePicker } from '../../components/GooglePlacePicker';
import { IconClose, IconMapPin } from '../../components/Icons';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { useUser } from '../../context/UserContext';
import { useFilters } from '../../context/FiltersContext';
import { AUTH_REQUIRED_ERROR, placesAPI } from '../../api';
import { TIP_NOTE_MAX, tipNoteError, tipsAPI } from '../../api/tips';
import { googleAuth } from '../../services/googleAuth';
import { findOwnPlace, pendingPlace, venuePlacePayload } from '../../services/googlePlaces';
import { useNearbyVenues } from '../../hook/useNearbyVenues';
import { useFlowTracking } from '../../hook/useFlowTracking';
import { placePoint } from '../../utils/distance';
import { useI18n, useDishLabel, useVenueLabel, useCityLabel } from '../../i18n';
import { tipPlaceForFlow } from '../../components/TipSheet';
import q from '../../components/QuestFlow/QuestFlow.module.scss';
import bowl from '../BowlFlow/BowlFlow.module.scss';
import style from './TipFlow.module.scss';

/**
 * «Я знаю, тут є Борщ» (Оцінка Борщу 2.0, stage 3): the shortest way to put a
 * borshch on the map. A venue (the nearest, search, or Google Places), a note
 * if you like, and the account at the very end, after the work, like the
 * rating asks it. No rating, no price, no photo.
 *
 * On the map it becomes a grey bowl, «Кажуть, тут є Борщ», until somebody
 * rates the borshch there; another person's «Так, є» makes it confirmed. A
 * venue whose borshch is already rated needs no tip: that one is opened
 * instead (also when the backend answers 409 already_rated).
 *
 * Query: ?place=<id> (from a venue: the venue is set) | ?from=<entry>
 */

const STEPS = ['venue', 'note', 'done'];
const STEP_INDEX = { venue: 0, google: 0, rated: 0, note: 1, signin: 1, done: 2 };
const STEP_EVENT = { venue: 'venue', google: 'venue_google', rated: 'already_rated', note: 'note', signin: 'signin', done: 'done' };
// the brand's reds, like every flow; grey is kept for the bowl on the map
const HUE = { venue: '#A00322', google: '#A00322', rated: '#B5122E', note: '#860130', signin: '#5E0A22', done: '#DC143C' };

export const TipFlow = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  const { allPlaces, loading: placesLoading, getPlaceById, selectPlace } = usePlaces();
  const { borsch: allBorsch, loading: borschLoading } = useBorsch();
  const { isAuthenticated, completeGoogleSignIn } = useUser();
  const { focusMap } = useFilters();

  const placeParam = params.get('place');
  const entry = params.get('from') || (placeParam ? 'venue' : 'link');
  const nearby = useNearbyVenues({ skip: Boolean(placeParam) });

  const [step, setStep] = useState(placeParam ? null : 'venue');
  const [place, setPlace] = useState(null);
  const [rated, setRated] = useState(null); // { borsch?, placeId }
  const [note, setNote] = useState('');
  const [noteTouched, setNoteTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);
  const [prefillFailed, setPrefillFailed] = useState(false);
  const headingRef = useRef(null);

  const { markClosing, exit } = useFlowTracking({
    flow: 'tip',
    step: step ? STEP_EVENT[step] : null,
    index: step ? STEP_INDEX[step] : 0,
    total: STEPS.length,
    finished: step === 'done' || step === 'rated',
    context: { entry },
  });

  useEffect(() => {
    headingRef.current?.focus?.();
  }, [step]);

  const ratedAt = useCallback(
    (placeId) => (allBorsch || []).find((b) => String(b.place_id) === String(placeId) && Number(b.rating_count) > 0) || null,
    [allBorsch]
  );

  const pickPlace = useCallback((p) => {
    setPlace(p);
    setError('');
    const already = p?.id ? ratedAt(p.id) : null;
    if (already) {
      setRated({ borsch: already, placeId: String(p.id) });
      setStep('rated');
      return;
    }
    setStep('note');
  }, [ratedAt]);

  // --- the venue is set (from a venue's page) ----------------------------------
  const statePlace = location.state?.place || null;
  useEffect(() => {
    if (!placeParam || step !== null) return undefined;
    const fromContext = getPlaceById(placeParam);
    if ((!fromContext && placesLoading && !statePlace) || borschLoading) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const p = fromContext
          || (statePlace && String(statePlace.id) === String(placeParam) ? statePlace : null)
          || await placesAPI.getById(placeParam);
        if (!cancelled) pickPlace(p);
      } catch (e) {
        if (!cancelled) setPrefillFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [placeParam, step, placesLoading, borschLoading, getPlaceById, statePlace, pickPlace]);

  const pickGoogle = (venue) => {
    const own = findOwnPlace(allPlaces, venue);
    pickPlace(own || pendingPlace(venue));
  };

  const close = () => {
    markClosing();
    navigate('/');
  };

  const noteProblem = tipNoteError(note);

  const submit = async () => {
    if (saving || !place) return;
    if (noteProblem) { setNoteTouched(true); return; }
    setSaving(true);
    setError('');
    try {
      const tip = await tipsAPI.create(
        place.id ? { place: place.id, note } : { newPlace: venuePlacePayload(place.google), note },
        { from: entry }
      );
      setResult(tip);
      setStep('done');
    } catch (e) {
      if (e?.message === AUTH_REQUIRED_ERROR || e?.status === 401) {
        setStep('signin');
      } else if (e?.code === 'already_rated') {
        const placeId = String(e?.data?.place || place.id || '');
        setRated({ borsch: ratedAt(placeId), placeId });
        setStep('rated');
      } else if (e?.status === 429) {
        setError(t('tip.errTooMany'));
      } else if (e?.status === 400) {
        setError(t('tip.errNote'));
      } else {
        console.error('Не вдалося додати підказку:', e);
        setError(t('tip.errCreate'));
      }
    } finally {
      setSaving(false);
    }
  };

  const toSignInOrSubmit = () => {
    if (noteProblem) { setNoteTouched(true); return; }
    if (!isAuthenticated) setStep('signin');
    else submit();
  };

  const signIn = async (credentialResponse) => {
    try {
      const data = await googleAuth(credentialResponse.credential);
      completeGoogleSignIn(data);
      setError('');
      await submit();
    } catch (e) {
      setError(t('tip.errSignIn'));
    }
  };

  const showOnMap = (p) => {
    const point = placePoint(p);
    if (p?.id) selectPlace(p.id);
    if (point) focusMap(point.lat, point.lng, 16);
    navigate('/');
  };

  const rateFirst = () => {
    const p = result?.place || place;
    if (!p?.id) return;
    exit('rate_first');
    navigate(`/bowl/new?place=${encodeURIComponent(p.id)}${result?.id ? `&tip=${encodeURIComponent(result.id)}` : ''}&from=tip`, {
      state: { place: tipPlaceForFlow(p) },
    });
  };

  // --- render ---------------------------------------------------------------
  const stepIndex = step ? STEP_INDEX[step] : 0;
  const kicker = (
    <p className={q.stepCount}>
      {t('tip.kicker')}
      {' · '}
      {t('flow.step', { n: Math.min(stepIndex + 1, 2), total: 2 })}
    </p>
  );
  const venueCard = place && (
    <div className={`${bowl.venue} ${style.venueStatic}`}>
      <span className={bowl.venueIcon} aria-hidden="true"><IconMapPin size={22} /></span>
      <span className={bowl.venueWords}>
        <span className={bowl.venueName}>{venueLabel(place.name)}</span>
        <span className={bowl.venueAddr}>
          {[place.address || place.adress, place.city && cityLabel(place.city)].filter(Boolean)[0] || ''}
        </span>
      </span>
      {!placeParam && step !== 'done' && (
        <button type="button" className={bowl.change} onClick={() => setStep('venue')}>{t('bowl.change')}</button>
      )}
    </div>
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
      <>
        <VenuePicker
          nearby={nearby}
          loading={placesLoading || borschLoading}
          titles={{ here: t('tip.hereTitle'), where: t('tip.whereTitle') }}
          kicker={kicker}
          headingRef={headingRef}
          onPick={pickPlace}
        />
      </>
    );
    foot = (
      <button type="button" className={q.skip} onClick={() => setStep('google')}>{t('bowl.notListed')}</button>
    );
  }

  if (step === 'google') {
    body = (
      <GooglePlacePicker
        near={nearby.geo.point}
        kicker={kicker}
        headingRef={headingRef}
        onPick={pickGoogle}
        onManual={() => { exit('new_place'); navigate('/add-borsch'); }}
      />
    );
    foot = <button type="button" className={q.back} onClick={() => setStep('venue')}>{t('flow.back')}</button>;
  }

  if (step === 'rated') {
    const b = rated?.borsch;
    body = (
      <>
        <div className={q.mascotBox}><Mascot mood="happy" size={96} /></div>
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('tip.ratedTitle')}</h2>
        <p className={q.hint}>{t('tip.ratedText')}</p>
        {venueCard}
        {b && <p className={bowl.doneText}>{dishLabel(b.name)}</p>}
      </>
    );
    foot = (
      <>
        {b ? (
          <button type="button" className={q.cta} onClick={() => navigate(`/borsch/${b.id_borsch}`)}>{t('tip.openBorsch')}</button>
        ) : (
          <button type="button" className={q.cta} onClick={() => showOnMap(place?.id ? place : { ...place, id: rated?.placeId })}>{t('tip.showOnMap')}</button>
        )}
        {!placeParam && <button type="button" className={q.skip} onClick={() => setStep('venue')}>{t('tip.otherVenue')}</button>}
      </>
    );
  }

  if (step === 'note' && place) {
    const showProblem = noteTouched && noteProblem;
    body = (
      <>
        {kicker}
        {venueCard}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('tip.noteTitle')}</h2>
        <p className={q.hint}>{t('tip.noteHint')}</p>
        <label className="nb-sr-only" htmlFor="tip-note">{t('tip.noteTitle')}</label>
        <textarea
          id="tip-note"
          className={q.textarea}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => setNoteTouched(true)}
          placeholder={t('tip.notePlaceholder')}
          maxLength={TIP_NOTE_MAX + 20}
          rows={3}
          aria-invalid={Boolean(showProblem)}
          aria-describedby="tip-note-count"
        />
        <p id="tip-note-count" className={showProblem ? style.problem : style.count}>
          {showProblem ? t(`tip.noteErr.${noteProblem}`, { max: TIP_NOTE_MAX }) : t('tip.noteCount', { n: note.trim().length, max: TIP_NOTE_MAX })}
        </p>
        {error && <p className={style.problem} role="alert">{error}</p>}
      </>
    );
    foot = (
      <>
        <button type="button" className={`${q.cta} ${q.ctaReady}`} onClick={toSignInOrSubmit} disabled={saving}>
          {saving ? t('tip.saving') : t('tip.submit')}
        </button>
        {!placeParam && <button type="button" className={q.back} onClick={() => setStep('venue')}>{t('flow.back')}</button>}
      </>
    );
  }

  if (step === 'signin' && place) {
    body = (
      <>
        <div className={q.mascotBox}><Mascot mood="happy" size={96} /></div>
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('tip.signinTitle')}</h2>
        <p className={q.hint}>{t('tip.signinHint')}</p>
        {venueCard}
        <div className={q.signinBox}><GoogleAuth onSuccess={signIn} /></div>
        {saving && <div className={bowl.loaderRow}><BowlLoader size={36} label={t('tip.saving')} /></div>}
        {error && <p className={style.problem} role="alert">{error}</p>}
      </>
    );
    foot = <button type="button" className={q.back} onClick={() => setStep('note')}>{t('flow.back')}</button>;
  }

  if (step === 'done' && result) {
    const text = result.reused
      ? t(result.is_author ? 'tip.doneMine' : 'tip.doneConfirmed')
      : t('tip.doneText');
    body = (
      <>
        <div className={q.mascotBox}><Mascot mood="party" size={112} /></div>
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('tip.doneTitle')}</h2>
        <p className={bowl.doneText}>{text}</p>
        {venueCard}
        <p className={q.hint}>{t('tip.doneHint')}</p>
      </>
    );
    foot = (
      <>
        <button type="button" className={q.cta} onClick={rateFirst}>{t('tip.doneRate')}</button>
        <button type="button" className={q.skip} onClick={() => showOnMap(result.place || place)}>{t('tip.showOnMap')}</button>
      </>
    );
  }

  const topAligned = step === 'venue' || step === 'google' || step === 'note';

  return (
    <div className={q.flow} style={{ '--hue': HUE[step] || HUE.venue }} data-type={step === 'done' ? 'done' : 'tip'}>
      <div className={q.bg} aria-hidden="true">
        <span className={q.blob1} />
        <span className={q.blob2} />
        <span className={q.blob3} />
      </div>
      <header className={q.head}>
        <button type="button" className={q.quit} onClick={close} aria-label={t('card.close')}>
          <IconClose size={22} />
        </button>
        {step !== 'done' && step !== 'rated' && (
          <div className={q.segments} role="progressbar" aria-valuemin={0} aria-valuemax={2} aria-valuenow={Math.min(stepIndex, 2)}>
            {[0, 1].map((i) => (
              <span key={i} className={`${q.segment} ${i < stepIndex ? q.segOn : i === stepIndex ? q.segNow : ''}`} />
            ))}
          </div>
        )}
      </header>
      <div className={`${q.stage} ${topAligned ? bowl.stageTop : ''}`} key={step || 'loading'}>
        {body}
      </div>
      {foot && <footer className={`${q.foot} ${bowl.foot}`}>{foot}</footer>}
    </div>
  );
};
