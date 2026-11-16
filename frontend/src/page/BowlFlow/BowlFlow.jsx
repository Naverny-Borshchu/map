import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { illustration } from '../../components/QuestFlow/illustrations';
import { BowlLoader } from '../../components/EmptyState';
import { MAX_PHOTOS } from '../../components/QuestFlow';
import { rateStepCount } from '../../components/RateFlow';
import { IconCamera, IconClose, IconChevronRight } from '../../components/Icons';
import { VenuePicker } from '../../components/VenuePicker';
import { GooglePlacePicker } from '../../components/GooglePlacePicker';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { borschAPI, placesAPI } from '../../api';
import { track } from '../../analytics';
import { tokenStorage } from '../../services/tokenStorage';
import { createDraft } from '../../services/bowlDrafts';
import { markFlowHandover } from '../../services/flowAnalytics';
import { findOwnPlace, pendingPlace } from '../../services/googlePlaces';
import { sameBorschName } from '../../services/bowlTargets';
import { useFlowTracking } from '../../hook/useFlowTracking';
import { distanceMeters, placePoint } from '../../utils/distance';
import { formatDistanceLocal, nearestPlaces } from '../../utils/nearestPlaces';
import { bestPhotoMeta, formatTakenAt, readPhotoMeta } from '../../utils/photoMeta';
import { NEW_NAME_MAX } from '../../utils/tableForm';
import { useNearbyVenues } from '../../hook/useNearbyVenues';
import { useI18n, useDishLabel, useVenueLabel } from '../../i18n';
import q from '../../components/QuestFlow/QuestFlow.module.scss';
import style from './BowlFlow.module.scss';

/**
 * Moment 1 of a bowl, «Мені принесли Борщ» (Оцінка Борщу 2.0, stages 1 and 3).
 *
 * The borshch has just been put on the table: which venue, which borshch, a
 * photo while the bowl is untouched, and the phone goes back in the pocket.
 * The rating waits for moment 2 (BowlRatePage), when the bowl is empty and
 * there is finally something to say about it. No account is needed here: the
 * bowl is a draft on this device (services/bowlDrafts).
 *
 * The venue is not picked on a map. The three venues of our catalogue nearest
 * to the phone come up as big cards («Ти зараз тут?»); search is right under
 * them. A venue we do not have is found in Google Places («Закладу нема в
 * списку»), and a borshch the venue does not have yet is typed in by its name
 * («Інший Борщ»): both are created when the bowl is rated, with the account
 * that rates it. A photo already on the camera («Фото вже на камері») says
 * where and when it was taken (EXIF, read on the device): the venues near the
 * photo come first («Фото зроблено біля «Ватри». Це той заклад?»).
 *
 * The same venue and borshch picker serves «Оцінити Борщ, який уже скуштував»
 * from the add chooser (?mode=rate): there it ends in the ordinary rating.
 *
 * Query: ?mode=rate | ?borsch=<id> (from the borshch card) | ?place=<id>
 *        (a venue: a tip's «Оцінити першим») | ?tip=<id> | ?from=<entry>
 */

// The progress has four segments; the Google search and the new borshch's
// name are part of the venue and the borshch screens (same index, own name).
const STEPS = ['venue', 'borsch', 'photo', 'done'];
const STEP_INDEX = { venue: 0, google: 0, borsch: 1, name: 1, photo: 2, done: 3 };
const STEP_EVENT = { venue: 'venue', google: 'venue_google', borsch: 'borsch', name: 'borsch_new', photo: 'photo', done: 'done' };
const HUE = { venue: '#A00322', google: '#A00322', borsch: '#B5122E', name: '#B5122E', photo: '#C0102F', done: '#DC143C' };

// A photo taken this close to one of our venues was taken there.
const PHOTO_AT_VENUE_M = 150;
// Further than this from the chosen venue, the photo is worth a second look.
const PHOTO_FAR_M = 400;

const placeOfBorsch = (b) => ({ id: b.place_id, name: b.place_name, city: b.place_city });
const cleanName = (s) => String(s ?? '').trim().replace(/\s+/g, ' ');

export const BowlFlow = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const { t, lang } = useI18n();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const { allPlaces, loading: placesLoading, getPlaceById } = usePlaces();
  const { borsch: allBorsch, loading: borschLoading, getBorschById } = useBorsch();

  const rateMode = params.get('mode') === 'rate';
  const prefillId = params.get('borsch');
  const placeParam = params.get('place');
  const tipId = params.get('tip');
  const entry = params.get('from') || (prefillId ? 'card' : placeParam ? 'venue' : 'link');
  const flow = rateMode ? 'rate' : 'bowl';

  const [step, setStep] = useState(prefillId || placeParam ? null : 'venue');
  const [place, setPlace] = useState(null);
  const [borsch, setBorsch] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photoMode, setPhotoMode] = useState(null);
  const [meta, setMeta] = useState(null); // { takenAt, gps } of the camera-roll photos
  const [askNear, setAskNear] = useState(true);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newName, setNewName] = useState('');
  const [nameError, setNameError] = useState(null);
  const nearby = useNearbyVenues({ skip: Boolean(prefillId || placeParam) });
  const [prefillFailed, setPrefillFailed] = useState(false);
  const cameraRef = useRef(null);
  const rollRef = useRef(null);
  const headingRef = useRef(null);

  // --- step events -------------------------------------------------------
  const needsSignIn = !tokenStorage.getAccess();
  const { markClosing, exit } = useFlowTracking({
    flow,
    step: step ? STEP_EVENT[step] : null,
    index: step ? STEP_INDEX[step] : 0,
    // the picker is the first two screens of the rating, the rest is RateFlow
    total: rateMode ? 2 + rateStepCount({ withPhoto: true, needsSignIn }) : STEPS.length,
    finished: step === 'done',
    context: { entry, ...(rateMode ? { picker: true } : {}), ...(tipId ? { tip_id: tipId } : {}) },
  });

  useEffect(() => {
    headingRef.current?.focus?.();
  }, [step]);

  // --- venue lists -------------------------------------------------------
  const borschAt = useCallback(
    (p) => (p?.id ? (allBorsch || []).filter((b) => String(b.place_id) === String(p.id)) : []),
    [allBorsch]
  );

  // --- navigation --------------------------------------------------------
  const toRating = useCallback((b) => {
    markFlowHandover('rate');
    navigate(`/borsch/${b.id_borsch}/evaluations`, { state: { fromPicker: true, entry } });
  }, [navigate, entry]);

  const pickPlace = useCallback((p) => {
    const here = borschAt(p);
    setPlace(p);
    // Nearly every venue has exactly one borshch (278 of 280 on 14.11), so
    // that one is taken and the screen is skipped; «Змінити» brings it back.
    if (here.length === 1) {
      setBorsch(here[0]);
      if (rateMode) toRating(here[0]);
      else setStep('photo');
      return;
    }
    setBorsch(null);
    setStep('borsch');
  }, [borschAt, rateMode, toRating]);

  // --- prefilled from a borshch card -------------------------------------
  useEffect(() => {
    if (!prefillId || step !== null) return undefined;
    let cancelled = false;
    const fromContext = getBorschById(prefillId);
    if (!fromContext && borschLoading) return undefined;
    (async () => {
      try {
        const b = fromContext || await borschAPI.getById(prefillId);
        const p = getPlaceById(b.place_id)
          || await placesAPI.getById(b.place_id).catch(() => placeOfBorsch(b));
        if (cancelled) return;
        setBorsch(b);
        setPlace(p);
        setStep('photo');
      } catch (e) {
        if (!cancelled) setPrefillFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, [prefillId, step, borschLoading, getBorschById, getPlaceById]);

  // --- prefilled venue (a tip's «Оцінити першим», a venue's page) ----------
  const statePlace = location.state?.place || null;
  useEffect(() => {
    if (!placeParam || prefillId || step !== null) return undefined;
    const fromContext = getPlaceById(placeParam);
    if (!fromContext && placesLoading && !statePlace) return undefined;
    if (borschLoading) return undefined;
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
  }, [placeParam, prefillId, step, placesLoading, borschLoading, getPlaceById, statePlace, pickPlace]);

  // --- photo thumbnails --------------------------------------------------
  // made and released in one effect: a URL made during render and revoked in
  // a cleanup dies in StrictMode's rehearsal while the img still points at it
  const [photoUrls, setPhotoUrls] = useState([]);
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPhotoUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  // --- the photo's own place and time --------------------------------------
  const photoNear = useMemo(
    () => (meta?.gps ? nearestPlaces(allPlaces, meta.gps) : []),
    [allPlaces, meta]
  );
  const photoVenue = photoNear[0] && photoNear[0].distance <= PHOTO_AT_VENUE_M ? photoNear[0].place : null;
  const takenAt = meta?.takenAt ? formatTakenAt(meta.takenAt, lang) : '';

  // --- actions -----------------------------------------------------------
  const close = () => {
    markClosing();
    navigate(entry === 'card' && prefillId ? `/borsch/${prefillId}` : '/');
  };

  // The existing add flow, already at this venue: no map, no address check.
  // A venue from Google travels with its Place ID, so it is created without a
  // duplicate when the borshch is saved.
  const toAddBorsch = (p) => {
    const point = placePoint(p);
    exit('add_borsch');
    navigate('/add-borsch/select-place/new', {
      state: {
        place: {
          name: p.name,
          location: point,
          type: '',
          ...(p.google ? { googlePlaceId: p.google.googlePlaceId } : {}),
        },
        street: p.address || p.adress || '',
        city: p.city || '',
        country: p.country || '',
        ...(p.id ? { placeId: String(p.id) } : {}),
      },
    });
  };

  // Not in Google either: the map, as before.
  const toManualPlace = () => {
    exit('new_place');
    navigate('/add-borsch');
  };

  const pickGoogle = (venue) => {
    const own = findOwnPlace(allPlaces, venue);
    track('venue_google_picked', { flow, own: Boolean(own), entry });
    pickPlace(own || pendingPlace(venue));
  };

  const pickBorsch = (b) => {
    setBorsch(b);
    if (rateMode) toRating(b);
    else setStep('photo');
  };

  const toNewBorsch = () => {
    if (rateMode) {
      toAddBorsch(place);
      return;
    }
    setNameError(null);
    setStep('name');
  };

  const submitName = () => {
    const name = cleanName(newName);
    if (!name) { setNameError('empty'); return; }
    if (name.length > NEW_NAME_MAX) { setNameError('long'); return; }
    // the venue's own borshch, typed in again, is that borshch
    const twin = borschAt(place).find((b) => sameBorschName(b.name, name));
    if (twin) {
      pickBorsch(twin);
      return;
    }
    setBorsch({ id_borsch: null, name, isNew: true });
    setStep('photo');
  };

  const addPhotos = async (fileList, mode) => {
    const picked = Array.from(fileList || []).filter((f) => !f.type || f.type.startsWith('image/'));
    if (!picked.length) return;
    setPhotoMode((m) => m || mode);
    setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
    if (mode !== 'camera_roll') return;
    // where and when, from the originals, before anything shrinks them
    const found = bestPhotoMeta(await Promise.all(picked.map((f) => readPhotoMeta(f))));
    track('exif_used', { gps: Boolean(found.gps), time: Boolean(found.takenAt), where: STEP_EVENT[step] || 'venue' });
    if (!found.gps && !found.takenAt) return;
    setMeta((prev) => ({
      takenAt: found.takenAt || prev?.takenAt || null,
      gps: found.gps || prev?.gps || null,
    }));
    if (found.gps) setAskNear(true);
  };

  const finishMoment = async (mode) => {
    if (saving) return;
    setSaving(true);
    const usedMode = mode || photoMode || 'later';
    track('bowl_photo', { mode: usedMode, count: mode === 'later' ? 0 : photos.length });
    const saved = await createDraft({
      place: { id: place.id, name: place.name, city: place.city, google: place.google },
      borsch: { id: borsch.id_borsch, name: borsch.name },
      photoMode: usedMode,
      photos: mode === 'later' ? [] : photos,
      photoTakenAt: mode === 'later' ? null : (meta?.takenAt || null),
    });
    track('bowl_started', {
      bowl_id: saved.id,
      borsch_id: saved.borsch.id,
      place_id: saved.place.id,
      photo_mode: usedMode,
      photos: saved.photoCount,
      entry,
      ...(saved.place.id ? {} : { new_place: true }),
      ...(saved.borsch.id ? {} : { new_borsch: true }),
      ...(tipId ? { tip_id: tipId } : {}),
    });
    setDraft(saved);
    setSaving(false);
    setStep('done');
  };

  // --- render ------------------------------------------------------------
  const stepIndex = step ? STEP_INDEX[step] : 0;
  const shownSteps = rateMode ? STEPS.slice(0, 2) : STEPS.slice(0, 3);
  const loadingVenues = placesLoading || borschLoading;

  const header = (
    <header className={q.head}>
      <button type="button" className={q.quit} onClick={close} aria-label={t('card.close')}>
        <IconClose size={22} />
      </button>
      {step !== 'done' && (
        <div
          className={q.segments}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={shownSteps.length}
          aria-valuenow={Math.min(stepIndex, shownSteps.length)}
        >
          {shownSteps.map((s, i) => (
            <span
              key={s}
              className={`${q.segment} ${i < stepIndex ? q.segOn : i === stepIndex ? q.segNow : ''}`}
            />
          ))}
        </div>
      )}
    </header>
  );

  const stepCount = (
    <p className={q.stepCount}>
      {t(rateMode ? 'bowl.kickerRate' : 'bowl.kicker')}
      {' · '}
      {t('flow.step', { n: Math.min(stepIndex + 1, shownSteps.length), total: shownSteps.length })}
    </p>
  );

  const placeLine = place && (
    <p className={style.context}>
      <span>{venueLabel(place.name)}</span>
      {!prefillId && !placeParam && (
        <button type="button" className={style.change} onClick={() => setStep('venue')}>
          {t('bowl.change')}
        </button>
      )}
    </p>
  );

  const whenLine = takenAt && <p className={style.when}>{t('bowl.photoWhen', { when: takenAt })}</p>;

  let body = null;
  let foot = null;

  if (step === null) {
    body = (
      <div className={style.center}>
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
    // the photo knows where it was taken: its venues come first
    const fromPhoto = meta?.gps && photoNear.length > 0;
    const picker = fromPhoto
      ? { ...nearby, geo: { status: 'ok', point: meta.gps }, nearest: photoNear }
      : nearby;
    body = (
      <>
        {photoVenue && askNear && (
          <section className={style.photoAsk} aria-label={t('bowl.exifAria')} data-testid="photo-venue">
            {photoUrls[0] && <img className={style.photoAskThumb} src={photoUrls[0]} alt="" />}
            <div className={style.photoAskWords}>
              <p className={style.photoAskTitle}>{t('bowl.exifNear', { venue: venueLabel(photoVenue.name) })}</p>
              {takenAt && <p className={style.photoAskWhen}>{takenAt}</p>}
              <div className={style.photoAskRow}>
                <button type="button" className={style.photoAskYes} onClick={() => pickPlace(photoVenue)}>
                  {t('bowl.exifYes')}
                </button>
                <button type="button" className={style.photoAskNo} onClick={() => setAskNear(false)}>
                  {t('bowl.exifNo')}
                </button>
              </div>
            </div>
          </section>
        )}
        {meta?.gps && photoNear.length === 0 && <p className={style.when} role="status">{t('bowl.exifNoneNear')}</p>}
        {!meta?.gps && whenLine}
        <VenuePicker
          nearby={picker}
          loading={loadingVenues}
          titles={{
            here: fromPhoto ? t('bowl.photoHereTitle') : t(rateMode ? 'bowl.nearRateTitle' : 'bowl.hereTitle'),
            where: t(rateMode ? 'bowl.whereRateTitle' : 'bowl.whereTitle'),
          }}
          kicker={stepCount}
          headingRef={headingRef}
          onPick={pickPlace}
        />
      </>
    );
    foot = (
      <>
        {!rateMode && photos.length === 0 && (
          <button type="button" className={`${style.ghost} ${style.ctaIcon}`} onClick={() => rollRef.current?.click()}>
            <IconCamera size={20} /> {t('bowl.photoRoll')}
          </button>
        )}
        <button type="button" className={q.skip} onClick={() => setStep('google')}>{t('bowl.notListed')}</button>
      </>
    );
  }

  if (step === 'google') {
    body = (
      <GooglePlacePicker
        near={meta?.gps || nearby.geo.point}
        kicker={stepCount}
        headingRef={headingRef}
        onPick={pickGoogle}
        onManual={toManualPlace}
      />
    );
    foot = (
      <button type="button" className={q.back} onClick={() => setStep('venue')}>{t('flow.back')}</button>
    );
  }

  if (step === 'borsch' && place) {
    const here = borschAt(place);
    body = (
      <>
        {stepCount}
        <p className={style.context}>{venueLabel(place.name)}</p>
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>
          {t(rateMode ? 'bowl.borschRateTitle' : 'bowl.borschTitle')}
        </h2>
        {here.length === 0 && <p className={q.hint}>{t(place.id ? 'bowl.noBorsch' : 'bowl.newVenue')}</p>}
        <div className={style.venues}>
          {here.map((b) => (
            <button
              key={b.id_borsch}
              type="button"
              className={`${style.venue} ${borsch && borsch.id_borsch === b.id_borsch ? style.venueOn : ''}`}
              onClick={() => pickBorsch(b)}
              aria-pressed={!!borsch && borsch.id_borsch === b.id_borsch}
            >
              <span className={style.venueWords}>
                <span className={style.venueName}>{dishLabel(b.name)}</span>
                <span className={style.venueAddr}>
                  {b.rating_count ? t('bowl.ratings', { count: b.rating_count }) : t('card.noRatings')}
                </span>
              </span>
              <span className={style.venueChevron} aria-hidden="true"><IconChevronRight /></span>
            </button>
          ))}
          <button type="button" className={`${style.venue} ${style.other}`} onClick={toNewBorsch}>
            <span className={style.venueWords}>
              <span className={style.venueName}>{t(here.length ? 'bowl.otherBorsch' : 'bowl.addBorsch')}</span>
              <span className={style.venueAddr}>{t(rateMode ? 'bowl.otherBorschHint' : 'bowl.otherBorschName')}</span>
            </span>
            <span className={style.venueChevron} aria-hidden="true"><IconChevronRight /></span>
          </button>
        </div>
      </>
    );
    foot = (
      <button type="button" className={q.back} onClick={() => setStep('venue')}>{t('flow.back')}</button>
    );
  }

  if (step === 'name' && place) {
    const chips = ['chip.borsch', 'chip.borschRed', 'chip.borschGreen', 'chip.borschPampushky'];
    body = (
      <>
        {stepCount}
        {placeLine}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('bowl.nameTitle')}</h2>
        <p className={q.hint}>{t('bowl.nameHint')}</p>
        <div className={q.field}>
          <label className="nb-sr-only" htmlFor="bowl-new-borsch">{t('bowl.nameTitle')}</label>
          <input
            id="bowl-new-borsch"
            className={q.input}
            type="text"
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNameError(null); }}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitName(); } }}
            placeholder={t('flow.qNamePlaceholder')}
            maxLength={NEW_NAME_MAX + 10}
            autoComplete="off"
            enterKeyHint="next"
            aria-invalid={Boolean(nameError)}
          />
          <div className={q.chips}>
            {chips.map((key) => (
              <button
                key={key}
                type="button"
                className={`${q.chip} ${cleanName(newName) === t(key) ? q.chipOn : ''}`}
                onClick={() => { setNewName(t(key)); setNameError(null); }}
              >
                {t(key)}
              </button>
            ))}
          </div>
        </div>
        {nameError && <p className={style.problem} role="alert">{t(`bowl.nameErr.${nameError}`, { max: NEW_NAME_MAX })}</p>}
      </>
    );
    foot = (
      <>
        <button type="button" className={`${q.cta} ${cleanName(newName) ? q.ctaReady : ''}`} onClick={submitName} disabled={!cleanName(newName)}>
          {t('flow.next')}
        </button>
        <button type="button" className={q.back} onClick={() => setStep('borsch')}>{t('flow.back')}</button>
      </>
    );
  }

  if (step === 'photo' && place && borsch) {
    const venuePoint = placePoint(place);
    const far = meta?.gps && venuePoint ? distanceMeters(meta.gps, venuePoint) : null;
    body = (
      <>
        {stepCount}
        <p className={style.context}>
          <span>{venueLabel(place.name)} · {borsch.isNew ? borsch.name : dishLabel(borsch.name)}</span>
          {!prefillId && (
            <button type="button" className={style.change} onClick={() => setStep(borsch.isNew ? 'name' : 'borsch')}>
              {t('bowl.change')}
            </button>
          )}
        </p>
        {photos.length === 0 && (
          <div className={q.mascotBox}><img src={illustration('photo')} alt="" width="112" height="112" /></div>
        )}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('bowl.photoTitle')}</h2>
        <p className={q.hint}>{t(borsch.isNew ? 'bowl.photoHintNew' : 'bowl.photoHint')}</p>
        {photos.length > 0 && (
          <div className={`${q.shots} ${style.shots}`}>
            {photos.map((f, i) => (
              <div className={q.shot} key={`${f.name}-${f.size}-${f.lastModified}-${i}`}>
                <img src={photoUrls[i]} alt="" />
                <button
                  type="button"
                  className={q.shotRemove}
                  onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                  aria-label={t('flow.photoRemove')}
                >
                  <IconClose size={16} />
                </button>
              </div>
            ))}
          </div>
        )}
        {photos.length > 0 && whenLine}
        {photos.length > 0 && far !== null && far > PHOTO_FAR_M && (
          <p className={style.problem} role="status">
            {t('bowl.exifFar', { distance: formatDistanceLocal(far, t, lang), venue: venueLabel(place.name) })}
          </p>
        )}
      </>
    );
    foot = photos.length === 0 ? (
      <>
        <button type="button" className={`${q.cta} ${style.ctaIcon}`} onClick={() => cameraRef.current?.click()}>
          <IconCamera size={22} /> {t('bowl.photoNow')}
        </button>
        <button type="button" className={style.ghost} onClick={() => rollRef.current?.click()}>
          {t('bowl.photoRoll')}
        </button>
        <button type="button" className={q.skip} onClick={() => finishMoment('later')} disabled={saving}>
          {t('bowl.photoLater')}
        </button>
      </>
    ) : (
      <>
        <button type="button" className={q.cta} onClick={() => finishMoment()} disabled={saving}>
          {saving ? t('bowl.saving') : t('bowl.photoDone')}
        </button>
        {photos.length < MAX_PHOTOS && (
          <button type="button" className={style.ghost} onClick={() => rollRef.current?.click()}>
            {t('flow.photoAddMore')}
          </button>
        )}
      </>
    );
  }

  if (step === 'done' && draft) {
    const isNew = !draft.place?.id || !draft.borsch?.id;
    body = (
      <>
        <div className={q.mascotBox}><img src={illustration('overall')} alt="" width="112" height="112" /></div>
        {photoUrls[0] && <img className={style.donePhoto} src={photoUrls[0]} alt="" />}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('bowl.doneTitle')}</h2>
        <p className={style.doneText}>{t('bowl.doneText')}</p>
        {draft.photoTakenAt && <p className={style.when}>{t('bowl.photoWhen', { when: formatTakenAt(draft.photoTakenAt, lang) })}</p>}
        <p className={q.hint}>{t(isNew ? 'bowl.doneHintNew' : 'bowl.doneHint')}</p>
      </>
    );
    foot = (
      <>
        <button type="button" className={q.cta} onClick={() => navigate(`/bowl/${draft.id}/rate`)}>
          {t('bowl.rateNow')}
        </button>
        <button type="button" className={q.skip} onClick={() => navigate('/')}>{t('common.toMap')}</button>
      </>
    );
  }

  const topAligned = step === 'venue' || step === 'borsch' || step === 'google' || step === 'name';

  return (
    <div className={q.flow} style={{ '--hue': HUE[step] || HUE.venue }} data-type={step === 'done' ? 'done' : 'bowl'}>
      <div className={q.bg} aria-hidden="true">
        <span className={q.blob1} />
        <span className={q.blob2} />
        <span className={q.blob3} />
      </div>
      {header}
      <div className={`${q.stage} ${topAligned ? style.stageTop : ''}`} key={step || 'loading'}>
        {body}
      </div>
      {foot && <footer className={`${q.foot} ${style.foot}`}>{foot}</footer>}
      {/* capture opens the camera straight away on a phone; the second input
          has no capture, so it opens the photo library instead. Both live
          outside the steps: the library is offered on the venue screen too. */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        data-testid="bowl-camera"
        onChange={(e) => { addPhotos(e.target.files, 'now'); e.target.value = ''; }}
      />
      <input
        ref={rollRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid="bowl-roll"
        onChange={(e) => { addPhotos(e.target.files, 'camera_roll'); e.target.value = ''; }}
      />
    </div>
  );
};
