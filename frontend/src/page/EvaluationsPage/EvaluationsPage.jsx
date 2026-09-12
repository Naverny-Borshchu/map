import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ReactComponent as IconMeat } from './meat.svg';
import { ReactComponent as IconBeetroot } from './beetroot.svg';
import { ReactComponent as IconDensity } from './vegetable.svg';
import { ReactComponent as IconSalt } from './salt.svg';
import { ReactComponent as IconAftertaste } from './aftertaste.svg';
import { ReactComponent as IconServing } from './serving.svg';
import { useBorsch } from '../../context/BorschContext';
import { useComments } from '../../context/CommentsContext';
import { useUser } from '../../context/UserContext';
import { commentsAPI, borschAPI } from '../../api';
import { googleAuth, persistGoogleAuthSession } from '../../services/googleAuth';
import { RateFlow } from '../../components/RateFlow';
import style from './EvaluationsPage.module.scss';
import { useT, useDishLabel } from "../../i18n";
import {
  claimSessionDraftSubmission,
  clearSessionDraft,
  readSessionDraft,
  releaseSessionDraftSubmission,
  writeSessionDraft,
} from '../../components/QuestFlow/sessionDraft';

const GradesArray = [
  { key: "meat", icon: IconMeat, i18n: "meat" },
  { key: "beetroot", icon: IconBeetroot, i18n: "beetroot" },
  { key: "density", icon: IconDensity, i18n: "density" },
  { key: "salt", icon: IconSalt, i18n: "salt" },
  { key: "aftertaste", icon: IconAftertaste, i18n: "aftertaste" },
  { key: "serving", icon: IconServing, i18n: "serving" },
];

export const EvaluationsPage = ({ borschId: propId }) => {
    const params = useParams();
    const id = propId || params?.borschId;
    const draftKey = `nb:quest-draft:rate:${id}`;
    const [restoredDraft] = useState(() => readSessionDraft(draftKey));
    const [isSent, setIsSent] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveError, setSaveError] = useState('');
    const [photos, setPhotos] = useState([]);
    const navigate = useNavigate();
    const t = useT();
    const dishLabel = useDishLabel();
    const [comment, setComment] = useState(() => restoredDraft?.values?.comment || "");
    const [grades, setGrades] = useState({
      meat: restoredDraft?.values?.grades?.meat ?? null,
      beetroot: restoredDraft?.values?.grades?.beetroot ?? null,
      density: restoredDraft?.values?.grades?.density ?? null,
      salt: restoredDraft?.values?.grades?.salt ?? null,
      aftertaste: restoredDraft?.values?.grades?.aftertaste ?? null,
      serving: restoredDraft?.values?.grades?.serving ?? null,
      overall: restoredDraft?.values?.grades?.overall ?? null,
    });
    const [draftStep, setDraftStep] = useState(() => restoredDraft?.step || 0);
    const { getBorschById, getBorschExploration, loadBorschData} = useBorsch();
    const { syncWithServer } = useComments();
    const { login } = useUser();
    // Deep links (and slow list loads) used to hang forever on "Завантаження
    // даних…", because the page waited for the whole borsch list to arrive and
    // gave up silently if this borsch was not in it. Fetch the one we need.
    const [fetched, setFetched] = useState(null);
    const [notFound, setNotFound] = useState(false);
    const [xpTotal, setXpTotal] = useState(null);
    const fromContext = getBorschById(id);
    const borschOne = fromContext || fetched;

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
    const isFormValid = grades.meat !== null && grades.beetroot !== null && 
    grades.density !== null && grades.salt !== null && 
    grades.aftertaste !== null && grades.serving !== null && 
    grades.overall !== null;

    useEffect(() => {
      if (isSent) return;
      writeSessionDraft(draftKey, {
        step: draftStep,
        values: { grades, comment },
      });
    }, [draftKey, draftStep, grades, comment, isSent]);
   
    
    const handleGradeChange = (key, value) => {      
      setGrades((prev) => {
        const newGrades = { ...prev, [key]: value };        
        return newGrades;
      });
    };

    const handleGoogleSignIn = useCallback(async (credentialResponse) => {
      const data = await googleAuth(credentialResponse.credential);
      // The backend contract is { access, refresh, user, profile }. Persist all
      // four fields before unblocking the final step so the pending review is
      // submitted with the new Bearer token, without leaving this page.
      persistGoogleAuthSession(data);
      login(data.user || data.profile || data);
    }, [login]);

      const handleSubmitForm = async (e) => {
      if (e?.preventDefault) e.preventDefault();
      if (!isFormValid) return;
      if (!claimSessionDraftSubmission(draftKey)) return;

      setSaving(true);
      setSaveError('');
      try {
        // Реальний бекенд: POST /api/reviews/ з Bearer-токеном (id борщу — UUID-рядок)
        await commentsAPI.createByBorschId(id, {
          rating_meat: grades.meat,
          rating_beet: grades.beetroot,
          rating_density: grades.density,
          rating_salt: grades.salt,
          rating_aftertaste: grades.aftertaste,
          rating_serving: grades.serving,
          overall_rating: grades.overall || 5,
          message: comment.trim(),
        });
        // Photos are a separate endpoint, one call each; a failure here must not
        // lose the rating the user just spent seven screens on, and one bad
        // photo must not take the others with it.
        for (const file of photos) {
          try {
            await borschAPI.uploadPhoto(id, file);
          } catch (e) {
            console.error('Не вдалося завантажити фото:', e);
          }
        }

        // Re-read both server-backed contracts: the reviews list AND the
        // borsch aggregate the backend recalculated after the POST. Without
        // the second one the screen kept showing the old average, which is
        // the number everyone else sees.
        await Promise.all([syncWithServer(), loadBorschData()]);
        // Save to rated list
        const ratedIds = JSON.parse(localStorage.getItem('ratedBorsch') || '[]');
        if (!ratedIds.includes(String(id))) {
          localStorage.setItem('ratedBorsch', JSON.stringify([...ratedIds, String(id)]));
        }
        // XP: 10 per rating step, tripled for a first discovery. The running
        // total lives in localStorage until accounts carry it server-side.
        const earnedXp = 7 * 10 * xpMultiplier;
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

    
    
    if (!borschOne) {
      return (
        <div className={style.wrapp}>
          <p>{notFound ? t('rate.notFound') : t('rate.loading')}</p>
          {notFound && (
            <button type="button" className={style.backLink} onClick={() => navigate('/')}>
              {t('rate.backHome')}
            </button>
          )}
        </div>
      );
    }



  return (
    <RateFlow
      criteria={[
        ...GradesArray.map((g) => ({ key: g.key, i18n: `rate.${g.i18n}`, icon: g.icon })),
        { key: 'overall', i18n: 'rate.overall' },
      ]}
      grades={grades}
      onGrade={handleGradeChange}
      comment={comment}
      onComment={setComment}
      photos={photos}
      onPhotos={setPhotos}
      onSubmit={handleSubmitForm}
      onExit={() => navigate(`/borsch/${id}`)}
      onSignIn={handleGoogleSignIn}
      saving={saving}
      isSent={isSent}
      error={saveError}
      borschName={dishLabel(borschOne.name)}
      firstDiscovery={firstDiscovery}
      xpMultiplier={xpMultiplier}
      xpTotal={xpTotal}
      initialStep={draftStep}
      onStepChange={setDraftStep}
    />
  );
};
