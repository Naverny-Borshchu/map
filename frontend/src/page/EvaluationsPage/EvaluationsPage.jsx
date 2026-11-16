import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useBorsch } from '../../context/BorschContext';
import { useComments } from '../../context/CommentsContext';
import { useUser } from '../../context/UserContext';
import { commentsAPI, borschAPI } from '../../api';
import { uploadPhotos } from '../../utils/uploadPhotos';
import { googleAuth } from '../../services/googleAuth';
import { RateFlow } from '../../components/RateFlow';
import { EmptyState } from '../../components/EmptyState';
import { FactsQuestion } from '../../components/FactsQuestion';
import { MeatQuestion } from '../../components/MeatQuestion';
import { usePlaces } from '../../context/PlacesContext';
import { track } from '../../analytics';
import { deleteDraft, getDraft, updateDraft } from '../../services/bowlDrafts';
import { ensureBowlTargets } from '../../services/bowlTargets';
import style from './EvaluationsPage.module.scss';
import { useT, useDishLabel, useVenueLabel } from "../../i18n";
import { XP_PER_STEP } from '../../components/QuestFlow';
import { answersToReview, coinsEarned, ratingSteps, restoreAnswers } from '../../components/QuestFlow/answers';
import {
  claimSessionDraftSubmission,
  clearSessionDraft,
  readSessionDraft,
  releaseSessionDraftSubmission,
  writeSessionDraft,
} from '../../components/QuestFlow/sessionDraft';

/**
 * bowl           moment 2 of a bowl (services/bowlDrafts): the rating of a
 *                borshch whose photo was taken when it arrived
 * initialPhotos  that photo, read back from IndexedDB by BowlRatePage
 *
 * A bowl of a venue from Google Places or of «Інший Борщ» has no borshch id
 * yet: the questions show its name, and the venue and the borshch are created
 * (services/bowlTargets) right before the rating is sent, signed in by then.
 * Nobody has rated a borshch that does not exist yet, so it is a Першовар.
 */
const pendingBorsch = (bowl) => ({
  id_borsch: null,
  name: bowl.borsch?.name || '',
  place_id: bowl.place?.id || null,
  place_name: bowl.place?.name || '',
  place_city: bowl.place?.city || '',
  price: '',
  weight: '',
  price_value: 0,
  weight_value: 0,
  rating_count: 0,
  community_review_count: 0,
  overall_rating: '—',
  photo_urls: [],
});

export const EvaluationsPage = ({ borschId: propId, bowl = null, initialPhotos = [] }) => {
    const params = useParams();
    const location = useLocation();
    // the id of a bowl's new borshch, once it has been created
    const [createdId, setCreatedId] = useState(null);
    // this bowl put its borshch on the map (now, or before a failed attempt):
    // the closing screen asks its meat type, which the bowl never asked
    const [madeBorsch, setMadeBorsch] = useState(() => Boolean(bowl && (getDraft(bowl.id) || bowl)?.borsch?.created));
    const id = propId || params?.borschId || bowl?.borsch?.id || createdId;
    const draftKey = bowl ? `nb:quest-draft:bowl:${bowl.id}` : `nb:quest-draft:rate:${id}`;
    const [restoredDraft] = useState(() => readSessionDraft(draftKey));
    const [isSent, setIsSent] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [photos, setPhotos] = useState(() => initialPhotos || []);
    // The bowl's photo was taken while the borshch was untouched; the photo
    // screen is only shown when there is none.
    const [withPhotoStep] = useState(() => !(bowl && (initialPhotos || []).length > 0));
    // which of `photos` already landed, and how the last attempt went
    const [photosUploaded, setPhotosUploaded] = useState([]);
    const [photoStatus, setPhotoStatus] = useState(null);
    const navigate = useNavigate();
    const t = useT();
    const dishLabel = useDishLabel();
    const venueLabel = useVenueLabel();
    const [comment, setComment] = useState(() => restoredDraft?.values?.comment || "");
    // Оцінювання 3.0: the answers of answers.js. A draft of the old seven
    // scores carries the previous draft version and is not read at all.
    const [answers, setAnswers] = useState(() => restoreAnswers(restoredDraft?.values?.answers));
    const [draftStep, setDraftStep] = useState(() => restoredDraft?.step || 0);
    const { getBorschById, getBorschExploration, loadBorschData} = useBorsch();
    const { syncWithServer } = useComments();
    const { completeGoogleSignIn } = useUser();
    const { getPlaceById } = usePlaces();
    // Where the rating was opened from, for the step events: a borshch card,
    // the venue picker of the add chooser (two screens before this one), or a
    // bowl's reminder.
    const fromPicker = Boolean(location?.state?.fromPicker);
    const entry = bowl ? 'bowl' : (location?.state?.entry || 'card');
    const analytics = {
      flow: 'rate',
      offset: fromPicker ? 2 : 0,
      context: { entry, ...(fromPicker ? { picker: true } : {}), ...(bowl ? { bowl_id: bowl.id } : {}) },
    };
    // Deep links (and slow list loads) used to hang forever on "Завантаження
    // даних…", because the page waited for the whole borsch list to arrive and
    // gave up silently if this borsch was not in it. Fetch the one we need.
    const [fetched, setFetched] = useState(null);
    const [notFound, setNotFound] = useState(false);
    const [xpTotal, setXpTotal] = useState(null);
    const bowlRated = useRef(false);
    const fromContext = id ? getBorschById(id) : null;
    const borschOne = fromContext || fetched || (bowl && !id ? pendingBorsch(bowl) : null);

    // "Розвідка борщу": rating a borsch nobody ever tried makes you its
    // Першовар (×3 XP); confirming a founders'-catalogue score is worth ×2.
    // 'unknown' (backend without the fields) promises nothing.
    const exploration = getBorschExploration(borschOne);
    const firstDiscovery = exploration === 'virgin';
    const xpMultiplier = firstDiscovery ? 3 : exploration === 'unverified' ? 2 : 1;

    useEffect(() => {
      if (fromContext || fetched || !id) return;
      let cancelled = false;
      borschAPI.getById(id)
        .then((b) => { if (!cancelled) setFetched(b); })
        .catch(() => { if (!cancelled) setNotFound(true); });
      return () => { cancelled = true; };
    }, [id, fromContext, fetched]);
    // «Загалом» is the one required answer; every part may be skipped
    const isFormValid = answers.overall !== null && answers.overall !== undefined;

    useEffect(() => {
      if (isSent) return;
      writeSessionDraft(draftKey, {
        step: draftStep,
        values: { answers, comment },
      });
    }, [draftKey, draftStep, answers, comment, isSent]);

    const handleAnswer = useCallback((key, value) => {
      setAnswers((prev) => ({
        ...prev,
        [key]: value,
        // «Нема» мʼяса: its taste is not asked, and not kept either
        ...(key === 'meat_amount' && value === 0 ? { meat_taste: null } : {}),
      }));
    }, []);

    const handleGoogleSignIn = useCallback(async (credentialResponse) => {
      const data = await googleAuth(credentialResponse.credential);
      // The backend contract is { access, refresh, user, profile }. Persist all
      // four fields before unblocking the final step so the pending review is
      // submitted with the new Bearer token, without leaving this page.
      completeGoogleSignIn(data);
    }, [completeGoogleSignIn]);

      const handleSubmitForm = async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (!isFormValid) return;
      if (!claimSessionDraftSubmission(draftKey)) return;

      setSaving(true);
      setSaveError('');
      try {
        // A bowl's new venue and borshch first; their ids go into the bowl at
        // once, so a retry after a failure here does not create them twice.
        let targetId = id;
        if (!targetId && bowl) {
          const made = await ensureBowlTargets(getDraft(bowl.id) || bowl);
          targetId = made.borschId;
          if (made.borsch) {
            setFetched(made.borsch);
            setMadeBorsch(true);
          }
          setCreatedId(targetId);
        }
        // Реальний бекенд: POST /api/reviews/ з Bearer-токеном (id борщу — UUID-рядок)
        // scheme 3 (SPEC «Контракт API»): the raw answers; the server fills
        // the old rating_* from them
        await commentsAPI.createByBorschId(targetId, answersToReview(answers, comment));
        // Photos are a separate endpoint, one call each; a failure here must not
        // lose the rating the user just spent seven screens on, and one bad
        // photo must not take the others with it. It must not stay silent
        // either: the closing screen says how many did not land.
        let photosFailed = 0;
        if (photos.length) {
          const result = await uploadPhotos({
            borschId: targetId, photos, uploaded: photosUploaded, upload: borschAPI.uploadPhoto,
          });
          photosFailed = result.failed;
          setPhotosUploaded(result.uploaded);
          setPhotoStatus({ failed: result.failed, total: photos.length, retrying: false });
        }
        if (bowl) settleBowl(photosFailed, targetId);

        // Re-read both server-backed contracts: the reviews list AND the
        // borsch aggregate the backend recalculated after the POST. Without
        // the second one the screen kept showing the old average, which is
        // the number everyone else sees.
        await Promise.all([syncWithServer(), loadBorschData()]);
        // Save to rated list
        const ratedIds = JSON.parse(localStorage.getItem('ratedBorsch') || '[]');
        if (!ratedIds.includes(String(targetId))) {
          localStorage.setItem('ratedBorsch', JSON.stringify([...ratedIds, String(targetId)]));
        }
        // Test БорщКоіни: what the screens paid (answers.js coinsEarned), ×3
        // for a first discovery. The running total lives in localStorage until
        // accounts carry it server-side.
        const earnedXp = coinsEarned(
          [...ratingSteps(), { type: 'comment', key: 'comment' }],
          { ...answers, comment },
          XP_PER_STEP,
        ) * xpMultiplier;
        const newTotal = (Number(localStorage.getItem('nb_xp')) || 0) + earnedXp;
        localStorage.setItem('nb_xp', String(newTotal));
        setXpTotal(newTotal);
        window.dispatchEvent(new Event('borschDataUpdated'));
        clearSessionDraft(draftKey);
        setIsSent(true);
      } catch (err) {
        releaseSessionDraftSubmission(draftKey);
        console.error('❌ Помилка збереження оцінки:', err);
        // A review needs an account. Saying "try again" to someone who is not
        // signed in just sends them round the same loop.
        const needsAuth = /AUTH_REQUIRED|401|credentials|unauthor|temp_user_id|Device ID/i
          .test(err?.message || '');
        setSaveError(needsAuth ? t('flow.signinRequired') : t('rate.saveError'));
      } finally {
        setSaving(false);
      }
    };

    
    
    // The bowl is done once its rating is saved and its photos are on the
    // borshch. A photo that did not upload keeps the bowl (marked as rated, so
    // the reminder stops asking): a camera shot exists nowhere else, and «Мої
    // миски» can still send it.
    function settleBowl(photosFailed, borschId = id) {
      if (!bowl) return;
      if (!bowlRated.current) {
        bowlRated.current = true;
        track('bowl_rated', {
          bowl_id: bowl.id,
          borsch_id: borschId,
          ...(bowl.borsch?.id ? {} : { new_borsch: true }),
          photos: photos.length,
          minutes_since_brought: Math.round((Date.now() - bowl.createdAt) / 60000),
        });
      }
      if (photosFailed > 0) updateDraft(bowl.id, { reviewedAt: Date.now() });
      else deleteDraft(bowl.id);
    }

    // Only the photos; the review is already saved and must not be posted twice.
    const retryPhotos = async () => {
      setPhotoStatus((s) => ({ ...(s || {}), retrying: true }));
      const result = await uploadPhotos({
        borschId: id, photos, uploaded: photosUploaded, upload: borschAPI.uploadPhoto,
      });
      setPhotosUploaded(result.uploaded);
      setPhotoStatus({ failed: result.failed, total: photos.length, retrying: false });
      if (bowl) settleBowl(result.failed);
      // the new photo_urls only; a failed refresh must not undo the result above
      await loadBorschData().catch(() => {});
    };

    if (!borschOne) {
      return (
        <div className={style.wrapp}>
          <EmptyState
            art="spoon"
            loading={!notFound}
            title={notFound ? t('rate.notFound') : t('rate.loading')}
            action={notFound ? { onClick: () => navigate('/'), label: t('rate.backHome') } : null}
          />
        </div>
      );
    }



  return (
    <RateFlow
      answers={answers}
      onAnswer={handleAnswer}
      comment={comment}
      onComment={setComment}
      photos={photos}
      onPhotos={setPhotos}
      onSubmit={handleSubmitForm}
      onExit={() => navigate(id ? `/borsch/${id}` : '/')}
      withPhotoStep={withPhotoStep}
      cover={withPhotoStep ? null : photos[0] || null}
      coverSrc={withPhotoStep ? (borschOne.photo_urls || [])[0] || '' : ''}
      analytics={analytics}
      doneExtra={
        <>
          <MeatQuestion borsch={borschOne} created={madeBorsch} context={{ from_bowl: Boolean(bowl), entry }} />
          <FactsQuestion
            borsch={borschOne}
            country={getPlaceById(borschOne.place_id)?.country || bowl?.place?.google?.country || ''}
            context={{ from_bowl: Boolean(bowl), entry }}
          />
        </>
      }
      onSignIn={handleGoogleSignIn}
      saving={saving}
      isSent={isSent}
      error={saveError}
      photoStatus={photoStatus}
      onRetryPhotos={retryPhotos}
      borschName={dishLabel(borschOne.name)}
      placeName={venueLabel(getPlaceById(borschOne.place_id)?.name || borschOne.place_name || bowl?.place?.name || '')}
      firstDiscovery={firstDiscovery}
      xpMultiplier={xpMultiplier}
      xpTotal={xpTotal}
      initialStep={draftStep}
      onStepChange={setDraftStep}
    />
  );
};
