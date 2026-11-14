import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mascot } from '../../components/Mascot';
import { BowlLoader } from '../../components/EmptyState';
import { MAX_PHOTOS } from '../../components/QuestFlow';
import { rateStepCount } from '../../components/RateFlow';
import { IconCamera, IconClose, IconChevronRight } from '../../components/Icons';
import { VenuePicker } from '../../components/VenuePicker';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { borschAPI, placesAPI } from '../../api';
import { track } from '../../analytics';
import { tokenStorage } from '../../services/tokenStorage';
import { createDraft } from '../../services/bowlDrafts';
import { markFlowHandover } from '../../services/flowAnalytics';
import { useFlowTracking } from '../../hook/useFlowTracking';
import { placePoint } from '../../utils/distance';
import { useNearbyVenues } from '../../hook/useNearbyVenues';
import { useI18n, useDishLabel, useVenueLabel } from '../../i18n';
import q from '../../components/QuestFlow/QuestFlow.module.scss';
import style from './BowlFlow.module.scss';

/**
 * Moment 1 of a bowl, «Мені принесли Борщ» (Оцінка Борщу 2.0, stage 1).
 *
 * The borshch has just been put on the table: which venue, which borshch, a
 * photo while the bowl is untouched, and the phone goes back in the pocket.
 * The rating waits for moment 2 (BowlRatePage), when the bowl is empty and
 * there is finally something to say about it. No account is needed here: the
 * bowl is a draft on this device (services/bowlDrafts).
 *
 * The venue is not picked on a map. The three venues of our catalogue nearest
 * to the phone come up as big cards («Ти зараз тут?»); search is right under
 * them, and a venue we do not have goes to the existing add flow. Location
 * refused: straight to search, no modal in the way.
 *
 * The same venue and borshch picker serves «Оцінити Борщ, який уже скуштував»
 * from the add chooser (?mode=rate): there it ends in the ordinary rating.
 *
 * Query: ?mode=rate | ?borsch=<id> (from the borshch card) | ?from=<entry>
 */

const STEPS = ['venue', 'borsch', 'photo', 'done'];
const HUE = { venue: '#A00322', borsch: '#B5122E', photo: '#C0102F', done: '#DC143C' };

const placeOfBorsch = (b) => ({ id: b.place_id, name: b.place_name, city: b.place_city });

export const BowlFlow = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { t } = useI18n();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const { loading: placesLoading, getPlaceById } = usePlaces();
  const { borsch: allBorsch, loading: borschLoading, getBorschById } = useBorsch();

  const rateMode = params.get('mode') === 'rate';
  const prefillId = params.get('borsch');
  const entry = params.get('from') || (prefillId ? 'card' : 'link');
  const flow = rateMode ? 'rate' : 'bowl';

  const [step, setStep] = useState(prefillId ? null : 'venue');
  const [place, setPlace] = useState(null);
  const [borsch, setBorsch] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [photoMode, setPhotoMode] = useState(null);
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const nearby = useNearbyVenues({ skip: Boolean(prefillId) });
  const [prefillFailed, setPrefillFailed] = useState(false);
  const cameraRef = useRef(null);
  const rollRef = useRef(null);
  const headingRef = useRef(null);

  // --- step events -------------------------------------------------------
  const needsSignIn = !tokenStorage.getAccess();
  const { markClosing, exit } = useFlowTracking({
    flow,
    step,
    index: step ? STEPS.indexOf(step) : 0,
    // the picker is the first two screens of the rating, the rest is RateFlow
    total: rateMode ? 2 + rateStepCount({ withPhoto: true, needsSignIn }) : STEPS.length,
    finished: step === 'done',
    context: { entry, ...(rateMode ? { picker: true } : {}) },
  });

  useEffect(() => {
    headingRef.current?.focus?.();
  }, [step]);

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

  // --- venue lists -------------------------------------------------------
  const borschAt = useCallback(
    (p) => (allBorsch || []).filter((b) => String(b.place_id) === String(p?.id)),
    [allBorsch]
  );

  // --- photo thumbnails --------------------------------------------------
  // made and released in one effect: a URL made during render and revoked in
  // a cleanup dies in StrictMode's rehearsal while the img still points at it
  const [photoUrls, setPhotoUrls] = useState([]);
  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPhotoUrls(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);

  // --- navigation --------------------------------------------------------
  const close = () => {
    markClosing();
    navigate(entry === 'card' && prefillId ? `/borsch/${prefillId}` : '/');
  };

  const toRating = (b) => {
    markFlowHandover('rate');
    navigate(`/borsch/${b.id_borsch}/evaluations`, { state: { fromPicker: true, entry } });
  };

  // The existing add flow, already at this venue: no map, no address check.
  const toAddBorsch = (p) => {
    const point = placePoint(p);
    exit('add_borsch');
    navigate('/add-borsch/select-place/new', {
      state: {
        place: { name: p.name, location: point, type: '' },
        street: p.address || p.adress || '',
        city: p.city || '',
        country: p.country || '',
        placeId: String(p.id),
      },
    });
  };

  // A venue we do not have: the existing add flow from its first screen.
  const toNewPlace = () => {
    exit('new_place');
    navigate('/add-borsch');
  };

  const pickPlace = (p) => {
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
  };

  const pickBorsch = (b) => {
    setBorsch(b);
    if (rateMode) toRating(b);
    else setStep('photo');
  };

  const addPhotos = (fileList, mode) => {
    const picked = Array.from(fileList || []).filter((f) => !f.type || f.type.startsWith('image/'));
    if (!picked.length) return;
    setPhotoMode((m) => m || mode);
    setPhotos((prev) => [...prev, ...picked].slice(0, MAX_PHOTOS));
  };

  const finishMoment = async (mode) => {
    if (saving) return;
    setSaving(true);
    const usedMode = mode || photoMode || 'later';
    track('bowl_photo', { mode: usedMode, count: mode === 'later' ? 0 : photos.length });
    const saved = await createDraft({
      place: { id: place.id, name: place.name, city: place.city },
      borsch: { id: borsch.id_borsch, name: borsch.name },
      photoMode: usedMode,
      photos: mode === 'later' ? [] : photos,
    });
    track('bowl_started', {
      bowl_id: saved.id,
      borsch_id: saved.borsch.id,
      place_id: saved.place.id,
      photo_mode: usedMode,
      photos: saved.photoCount,
      entry,
    });
    setDraft(saved);
    setSaving(false);
    setStep('done');
  };

  // --- render ------------------------------------------------------------
  const stepIndex = step ? STEPS.indexOf(step) : 0;
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
    body = (
      <VenuePicker
        nearby={nearby}
        loading={loadingVenues}
        titles={{
          here: t(rateMode ? 'bowl.nearRateTitle' : 'bowl.hereTitle'),
          where: t(rateMode ? 'bowl.whereRateTitle' : 'bowl.whereTitle'),
        }}
        kicker={stepCount}
        headingRef={headingRef}
        onPick={pickPlace}
      />
    );
    foot = (
      <button type="button" className={q.skip} onClick={toNewPlace}>{t('bowl.notListed')}</button>
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
        {here.length === 0 && <p className={q.hint}>{t('bowl.noBorsch')}</p>}
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
          <button type="button" className={`${style.venue} ${style.other}`} onClick={() => toAddBorsch(place)}>
            <span className={style.venueWords}>
              <span className={style.venueName}>{t(here.length ? 'bowl.otherBorsch' : 'bowl.addBorsch')}</span>
              <span className={style.venueAddr}>{t('bowl.otherBorschHint')}</span>
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

  if (step === 'photo' && place && borsch) {
    body = (
      <>
        {stepCount}
        <p className={style.context}>
          <span>{venueLabel(place.name)} · {dishLabel(borsch.name)}</span>
          {!prefillId && (
            <button type="button" className={style.change} onClick={() => setStep('borsch')}>
              {t('bowl.change')}
            </button>
          )}
        </p>
        {photos.length === 0 && (
          <div className={q.mascotBox}><Mascot mood="happy" size={84} /></div>
        )}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('bowl.photoTitle')}</h2>
        <p className={q.hint}>{t('bowl.photoHint')}</p>
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
        {/* capture opens the camera straight away on a phone; the second input
            has no capture, so it opens the photo library instead */}
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
    body = (
      <>
        <div className={q.mascotBox}><Mascot mood="party" size={112} /></div>
        {photoUrls[0] && <img className={style.donePhoto} src={photoUrls[0]} alt="" />}
        <h2 className={q.question} ref={headingRef} tabIndex={-1}>{t('bowl.doneTitle')}</h2>
        <p className={style.doneText}>{t('bowl.doneText')}</p>
        <p className={q.hint}>{t('bowl.doneHint')}</p>
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

  const topAligned = step === 'venue' || step === 'borsch';

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
    </div>
  );
};
