import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QuestFlow } from '../../components/QuestFlow';
import { tasteSteps } from '../../components/QuestFlow/answers';
import { GoogleAuth } from '../../components/GoogleAuth';
import { Mascot } from '../../components/Mascot';
import { IconMapPin } from '../../components/Icons';
import { AUTH_REQUIRED_ERROR } from '../../api';
import { GUEST_NAME_MAX, tablesAPI } from '../../api/tables';
import { googleAuth } from '../../services/googleAuth';
import { dropTableGuestToken, saveTableGuest } from '../../services/tableGuest';
import { useUser } from '../../context/UserContext';
import { useVisiblePolling } from '../../hook/useVisiblePolling';
import { useFlowTracking } from '../../hook/useFlowTracking';
import { track } from '../../analytics';
import { hasTenPointScale } from '../../variant';
import { addressLine, borschTitle, formatAverage, nextUnrated } from '../../utils/tableView';
import { useI18n, useDishLabel, useVenueLabel, useCityLabel } from '../../i18n';
import { TableFrame } from './TableFrame';
import q from '../../components/QuestFlow/QuestFlow.module.scss';
import bowl from '../BowlFlow/BowlFlow.module.scss';
import style from './Table.module.scss';

/** A guest who has rated everything checks for the results every 30 seconds. */
export const GUEST_POLL_MS = 30000;

const EMPTY_GRADES = { meat: null, beetroot: null, density: null, salt: null, aftertaste: null, serving: null, overall: null };
const STEPS = [...tasteSteps(), { type: 'done', key: 'done' }];
// a restored draft opens at the last question at most: arriving on the closing
// screen would send the rating again before the person has seen anything
const LAST_QUESTION = STEPS.length - 2;

/** The link a guest followed is a link to the map too: a name that fits on a badge. */
const cleanName = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const nameProblem = (name) => {
  const clean = cleanName(name);
  if (!clean) return 'empty';
  if (clean.length > GUEST_NAME_MAX) return 'long';
  if (/(https?:\/\/|www\.)/i.test(clean)) return 'link';
  return null;
};

/**
 * Everyone at an open table who is not its host: the door (venue, the borshch
 * on the table, a name or Google), then ONLY the seven taste questions for each
 * borshch in order. No photo, no price, no weight, no venue: the host gave
 * those once for everybody.
 *
 * Who you are at this table is fixed by the first rating: a guest gets a token
 * (kept on the device by services/tableGuest), a signed-in person rates as
 * themselves. A reload continues at the next borshch, and the answers of a
 * borshch half done come back too.
 */
export const TableGuest = ({ code, table, guest, onGuest, onTable, reload, onBack = null }) => {
  const { t } = useI18n();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  const navigate = useNavigate();
  const { isAuthenticated, user, completeGoogleSignIn } = useUser();

  const borsches = useMemo(() => table.borsches || [], [table.borsches]);
  // A guest token decides: a person who began as a guest stays one here.
  const identity = guest.token ? 'guest' : (isAuthenticated ? 'user' : 'new');
  const [rated, setRated] = useState(() => table.me?.rated_positions || []);
  const draft = guest.draft;
  const firstOpen = nextUnrated(borsches, rated);

  const [phase, setPhase] = useState(() => {
    if (firstOpen === null && rated.length) return 'done';
    if (draft && draft.position === firstOpen && (identity !== 'new' || guest.name)) return 'rate';
    if (rated.length && (identity === 'guest' || identity === 'user')) return 'rate';
    return 'join';
  });
  const [position, setPosition] = useState(firstOpen);
  const [grades, setGrades] = useState(() => (
    draft && draft.position === firstOpen ? { ...EMPTY_GRADES, ...(draft.grades || {}) } : EMPTY_GRADES
  ));
  // where a half-rated borshch was left: only that borshch reopens there
  const [restore, setRestore] = useState(() => (
    draft && draft.position === firstOpen
      ? { position: firstOpen, step: Math.min(Math.max(0, Number(draft.step) || 0), LAST_QUESTION) }
      : null
  ));
  const stepRef = useRef(restore ? restore.step : 0);
  const [name, setName] = useState(() => guest.name || '');
  const [nameTouched, setNameTouched] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [status, setStatus] = useState({ saving: false, sent: false, error: '' });

  const venue = venueLabel(table.place?.name || '');
  const heading = table.title || t('table.atVenue', { venue });
  const asKind = identity === 'user' ? 'user' : 'guest';
  const index = Math.max(0, borsches.findIndex((b) => b.position === position));
  const current = borsches[index] || null;
  const nextPosition = nextUnrated(borsches, [...rated, position]);
  const nextEntry = borsches.find((b) => b.position === nextPosition) || null;

  // --- step events: the door and the thank-you; the questions report themselves
  useFlowTracking({
    flow: 'table_join',
    step: phase === 'join' ? 'join' : phase === 'done' ? 'done' : null,
    index: phase === 'done' ? 1 + borsches.length * STEPS.length : 0,
    total: 2 + borsches.length * STEPS.length,
    finished: phase === 'done',
    context: { code, blind: Boolean(table.blind), borsch_count: borsches.length },
  });

  // a guest who has rated everything waits for the host to close the table
  useVisiblePolling(reload, GUEST_POLL_MS, phase === 'done');

  // --- the door ------------------------------------------------------------
  const start = () => {
    if (identity === 'new') {
      const problem = nameProblem(name);
      setNameTouched(true);
      if (problem) return;
      saveTableGuest(code, { name: cleanName(name) });
      onGuest();
    }
    setJoinError('');
    track('table_joined', {
      code,
      as: identity === 'new' ? 'guest' : asKind,
      resumed: rated.length > 0,
      blind: Boolean(table.blind),
      borsch_count: borsches.length,
    });
    setPosition(nextUnrated(borsches, rated));
    setStatus({ saving: false, sent: false, error: '' });
    setPhase('rate');
  };

  const signIn = useCallback(async (credentialResponse) => {
    try {
      const data = await googleAuth(credentialResponse.credential);
      completeGoogleSignIn(data);
      setJoinError('');
      // a signed-in person sees their own ratings at this table, if any
      const fresh = await reload();
      if (fresh?.me) setRated(fresh.me.rated_positions || []);
    } catch (e) {
      setJoinError(t('table.errSignIn'));
    }
  }, [completeGoogleSignIn, reload, t]);

  // --- the questions --------------------------------------------------------
  // Every answer and every step goes to the device at once, so a reload in the
  // middle of a borshch comes back to the same question with the same answers.
  const gradesRef = useRef(grades);
  gradesRef.current = grades;

  const onChange = useCallback((key, value) => {
    const next = { ...gradesRef.current, [key]: value };
    gradesRef.current = next;
    setGrades(next);
    saveTableGuest(code, { draft: { position, grades: next, step: stepRef.current } });
  }, [code, position]);

  const onStepChange = useCallback((step) => {
    stepRef.current = step;
    saveTableGuest(code, { draft: { position, grades: gradesRef.current, step } });
  }, [code, position]);

  const backToDoor = (message) => {
    setJoinError(message);
    setStatus({ saving: false, sent: false, error: '' });
    setPhase('join');
  };

  const submit = async () => {
    setStatus({ saving: true, sent: false, error: '' });
    try {
      const res = await tablesAPI.rate(code, {
        position,
        grades,
        as: asKind,
        guestName: cleanName(name || guest.name),
        guestToken: guest.token,
      });
      if (res?.guest_token && identity !== 'user') saveTableGuest(code, { token: res.guest_token });
      saveTableGuest(code, { draft: null });
      setRestore(null);
      onGuest();
      setRated(res?.rated_positions || [...rated, position]);
      setStatus({ saving: false, sent: true, error: '' });
    } catch (e) {
      const why = e?.code;
      if (why === 'table_closed') {
        await reload();
        return;
      }
      if (why === 'bad_guest_token') {
        dropTableGuestToken(code);
        onGuest();
        backToDoor(t('table.errToken'));
        return;
      }
      if (why === 'guest_name') {
        backToDoor(t('table.errName'));
        return;
      }
      if (why === 'guest_limit') {
        backToDoor(t('table.errGuestLimit'));
        return;
      }
      if (e?.message === AUTH_REQUIRED_ERROR || e?.status === 401) {
        backToDoor(t('table.errSignIn'));
        return;
      }
      setStatus({ saving: false, sent: false, error: e?.status === 429 ? t('table.errBusy') : t('rate.saveError') });
    }
  };

  const afterRated = async () => {
    if (!status.sent) {
      // the cross during the questions: back to the door, the answers stay
      setPhase('join');
      return;
    }
    if (nextPosition !== null) {
      setPosition(nextPosition);
      setGrades(EMPTY_GRADES);
      stepRef.current = 0;
      setStatus({ saving: false, sent: false, error: '' });
      return;
    }
    setPhase('done');
    const fresh = await reload();
    if (fresh?.me) setRated(fresh.me.rated_positions || rated);
  };

  // --- render -----------------------------------------------------------------
  const close = () => {
    if (onBack) onBack();
    else navigate('/');
  };

  if (phase === 'rate' && current) {
    const label = borschTitle(current, t, dishLabel);
    const nextLabel = nextEntry ? borschTitle(nextEntry, t, dishLabel) : '';
    return (
      <QuestFlow
        key={position}
        steps={STEPS}
        values={grades}
        onChange={onChange}
        scale10={hasTenPointScale}
        title={label}
        status={status}
        done={{
          title: t('table.ratedTitle', { borsch: label }),
          text: nextEntry ? t('table.nextText', { borsch: nextLabel }) : t('table.lastText'),
          cta: nextEntry ? t('table.toNext', { borsch: nextLabel }) : t('flow.finish'),
        }}
        onSubmit={submit}
        onRetry={submit}
        onExit={afterRated}
        initialStep={restore && restore.position === position ? restore.step : 0}
        onStepChange={onStepChange}
        analytics={{
          flow: 'table_join',
          offset: 1 + index * STEPS.length,
          context: { code, position, as: asKind, blind: Boolean(table.blind), borsch_count: borsches.length },
        }}
      />
    );
  }

  if (phase === 'done') {
    const mine = (table.me?.reviews || []).slice().sort((a, b) => a.position - b.position);
    return (
      <TableFrame hue="#DC143C" type="done" onClose={close} top={false}
        foot={(
          <>
            <button type="button" className={q.cta} onClick={() => navigate('/')}>{t('table.toMap')}</button>
            {onBack && <button type="button" className={q.skip} onClick={onBack}>{t('table.backToHost')}</button>}
          </>
        )}
      >
        <div className={q.mascotBox}><Mascot mood="party" size={112} /></div>
        <h2 className={q.question}>{t('table.thanksTitle')}</h2>
        <p className={bowl.doneText}>{t('table.thanksText')}</p>
        {mine.length > 0 && (
          <ul className={style.mine} aria-label={t('table.yourRatings')}>
            {mine.map((r) => {
              const entry = borsches.find((b) => b.position === r.position) || { position: r.position };
              return (
                <li key={r.position} className={style.mineRow}>
                  <span>{borschTitle(entry, t, dishLabel)}</span>
                  <span className={style.mineScore}>{formatAverage(r.overall_rating)}</span>
                </li>
              );
            })}
          </ul>
        )}
        <p className={q.hint}>{t('table.thanksHint')}</p>
      </TableFrame>
    );
  }

  // the door
  const problem = identity === 'new' ? nameProblem(name) : null;
  const showProblem = identity === 'new' && nameTouched && problem;
  const resumed = rated.length > 0;
  const who = identity === 'user'
    ? (user?.given_name || user?.name || user?.username || '')
    : cleanName(guest.name || name);

  return (
    <TableFrame
      hue="#A00322"
      onClose={close}
      foot={(
        <button type="button" className={`${q.cta} ${!problem ? q.ctaReady : ''}`} onClick={start} disabled={identity === 'new' && !cleanName(name)}>
          {resumed ? t('table.continue') : t('table.start')}
        </button>
      )}
    >
      <p className={q.stepCount}>{t('table.guestKicker')}</p>
      <h2 className={q.question}>{heading}</h2>
      {table.host_name && <p className={style.subline}>{t('table.hostedBy', { name: table.host_name })}</p>}

      <div className={`${bowl.venue} ${style.venueStatic}`}>
        <span className={bowl.venueIcon} aria-hidden="true"><IconMapPin size={22} /></span>
        <span className={bowl.venueWords}>
          <span className={bowl.venueName}>{venue}</span>
          <span className={bowl.venueAddr}>
            {addressLine(table.place, cityLabel)}
          </span>
        </span>
      </div>

      <div className={style.onTable}>
        <p className={style.onTableTitle}>{t('table.onTable', { count: borsches.length })}</p>
        <ul className={style.chipsRow}>
          {borsches.map((b) => (
            <li key={b.position} className={`${style.borschChip} ${rated.includes(b.position) ? style.borschChipDone : ''}`}>
              {table.names_hidden ? t('table.borschN', { n: b.position }) : `${t('table.numberShort', { n: b.position })} ${borschTitle(b, t, dishLabel)}`}
            </li>
          ))}
        </ul>
        {table.names_hidden && <p className={style.blindNote}>{t('table.blindGuest')}</p>}
        <p className={q.hint}>{t('table.onlyTaste')}</p>
      </div>

      {identity === 'new' && (
        <div className={style.door}>
          <label className={style.nameLabel} htmlFor="table-guest-name">{t('table.nameLabel')}</label>
          <input
            id="table-guest-name"
            className={q.input}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setNameTouched(true)}
            placeholder={t('table.namePlaceholder')}
            maxLength={GUEST_NAME_MAX + 10}
            autoComplete="given-name"
            enterKeyHint="go"
            aria-invalid={Boolean(showProblem)}
            aria-describedby="table-guest-name-hint"
          />
          <p id="table-guest-name-hint" className={showProblem ? style.error : q.hint}>
            {showProblem ? t(`table.nameErr.${problem}`, { max: GUEST_NAME_MAX }) : t('table.nameHint')}
          </p>
          <p className={style.or}><span>{t('table.or')}</span></p>
          <div className={q.signinBox}><GoogleAuth onSuccess={signIn} /></div>
        </div>
      )}
      {identity !== 'new' && who && (
        <p className={style.asWho}>{t(identity === 'user' ? 'table.asUser' : 'table.asGuest', { name: who })}</p>
      )}
      {joinError && <p className={style.errorBox} role="alert">{joinError}</p>}
    </TableFrame>
  );
};
