import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { ReactComponent as IconMeat } from '../BorschPage/meat.svg';
import { ReactComponent as IconBeetroot } from '../BorschPage/beetroot.svg';
import { ReactComponent as IconDensity } from '../BorschPage/vegetable.svg';
import { ReactComponent as IconSalt } from '../BorschPage/salt.svg';
import { ReactComponent as IconAftertaste } from '../BorschPage/aftertaste.svg';
import { ReactComponent as IconServing } from '../BorschPage/serving.svg';
import { EmptyState } from '../../components/EmptyState';
import { PageHeader } from '../../components/PageHeader';
import { ProgressLine } from '../../components/ProgressLine/ProgressLine';
import { IconClose, IconShare } from '../../components/Icons';
import { tableLink, tablesAPI } from '../../api/tables';
import { track } from '../../analytics';
import { shareUrl } from '../../utils/share';
import { makeStoryImage, storyContent } from '../../utils/storyImage';
import { CRITERION_LABEL, borschTitle, divisiveLabel, formatAverage, tableDate } from '../../utils/tableView';
import { useI18n, useDishLabel, useVenueLabel, useCityLabel } from '../../i18n';
import { readTableGuest } from '../../services/tableGuest';
import { TableClaim } from './TableClaim';
import { NewBorschPrompt } from './NewBorschPrompt';
import layout from '../../styles/layout.module.scss';
import style from './TableResults.module.scss';

const METERS = [
  { key: 'rating_meat', icon: IconMeat },
  { key: 'rating_beet', icon: IconBeetroot },
  { key: 'rating_density', icon: IconDensity },
  { key: 'rating_salt', icon: IconSalt },
  { key: 'rating_aftertaste', icon: IconAftertaste },
  { key: 'rating_serving', icon: IconServing },
];

/**
 * The table's results: the table's average, how many rated, the criterion the
 * table agreed on least, and each borshch with the same meters as its card on
 * the map. A blind table shows its names here, for the first time. The story
 * picture (utils/storyImage) is made on the device from the same numbers.
 *
 * Everyone sees this once the table is closed; the host as well, right after
 * closing it.
 */
export const TableResults = ({ code, table, guestToken: initialToken = null }) => {
  const { t, lang } = useI18n();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  const [results, setResults] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | error
  const [story, setStory] = useState(null); // { url, blob } | 'making' | 'failed'
  const reported = useRef(false);
  // the guest token, until the guest takes the ratings into an account
  const [guestToken, setGuestToken] = useState(initialToken);

  useEffect(() => {
    let cancelled = false;
    tablesAPI.results(code, { guestToken })
      .then((data) => {
        if (cancelled) return;
        setResults(data);
        setState('ok');
      })
      .catch(() => { if (!cancelled) setState('error'); });
    return () => { cancelled = true; };
  }, [code, guestToken]);

  useEffect(() => {
    if (!results || reported.current) return;
    reported.current = true;
    track('table_results_viewed', {
      code,
      as: table?.is_host ? 'host' : (table?.me?.kind || 'visitor'),
      status: results.status,
      blind: Boolean(results.blind),
      raters_total: results.raters_total ?? 0,
      borsch_count: (results.borsches || []).length,
    });
  }, [results, code, table]);

  useEffect(() => () => {
    if (story && story.url) URL.revokeObjectURL(story.url);
  }, [story]);

  if (state === 'loading') {
    return <div className={style.page}><EmptyState loading title={t('table.loading')} /></div>;
  }
  if (state === 'error' || !results) {
    return (
      <div className={style.page}>
        <EmptyState art="spoon" title={t('table.loadFailed')} text={t('table.loadFailedText')} action={{ to: '/', label: t('common.toMap') }} />
      </div>
    );
  }

  const venue = venueLabel(results.place?.name || '');
  const heading = results.title || t('table.atVenue', { venue });
  const lead = [
    results.title ? venue : null,
    results.place?.city ? cityLabel(results.place.city) : null,
    tableDate(results.closed_at, lang),
  ].filter(Boolean).join(' · ');
  const divisive = divisiveLabel(results, t, dishLabel);
  const raters = results.raters_total || 0;
  const link = tableLink(code, table?.share_url);

  const makeStory = async () => {
    setStory('making');
    try {
      const blob = await makeStoryImage(storyContent(results, { t, lang, dishLabel, venueLabel, cityLabel }));
      if (!blob) throw new Error('no canvas');
      setStory({ blob, url: URL.createObjectURL(blob) });
      track('table_shared', { code, what: 'story', method: 'preview' });
    } catch (e) {
      console.error('Не вдалося намалювати картинку:', e);
      setStory('failed');
    }
  };

  const shareLink = async () => {
    const method = await shareUrl({ url: link, title: heading, text: t('table.shareResultsText', { venue }) }, t, { copiedKey: 'table.linkCopied' });
    if (method !== 'cancel') track('table_shared', { code, what: 'results', method });
  };

  return (
    <div className={`${layout.wrapper} ${style.page}`}>
      <PageHeader back="/" kicker={t('table.resultsKicker')} title={heading} lead={lead} />

      {table?.is_host && <NewBorschPrompt code={code} results={results} />}
      {!table?.is_host && guestToken && (
        <TableClaim
          code={code}
          guestToken={guestToken}
          from="results"
          tone="page"
          onClaimed={() => setGuestToken(readTableGuest(code).token)}
        />
      )}

      {results.blind && (
        <p className={style.blindChip}>{t(results.names_hidden ? 'table.blindStill' : 'table.blindRevealed')}</p>
      )}

      {raters === 0 ? (
        <EmptyState compact art="spoon" title={t('table.noRatingsTitle')} text={t('table.noRatingsText')} />
      ) : (
        <>
          <section className={style.summary} aria-label={t('table.averageLabel')}>
            <div className={style.summaryMain}>
              <p className={style.kicker}>{t('table.averageLabel')}</p>
              <p className={style.average} data-testid="table-average">{formatAverage(results.overall_average)}</p>
            </div>
            <div className={style.summarySide}>
              <p className={style.raters}>{raters}</p>
              <p className={style.ratersLabel}>{t('table.ratersLabel', { count: raters })}</p>
            </div>
          </section>

          <section className={style.divisive} aria-label={t('table.divisiveTitle')} data-testid="table-divisive">
            <p className={style.kicker}>{t('table.divisiveTitle')}</p>
            {divisive ? (
              <>
                <p className={style.divisiveName}>{divisive.criterion}</p>
                {divisive.borsch && <p className={style.divisiveBorsch}>{divisive.borsch}</p>}
                <p className={style.divisiveHint}>{t('table.divisiveHint')}</p>
              </>
            ) : (
              <p className={style.divisiveHint}>{t('table.divisiveNone')}</p>
            )}
          </section>
        </>
      )}

      <div className={style.actions}>
        {raters > 0 && (
          <button type="button" className={style.primary} onClick={makeStory} disabled={story === 'making'}>
            {story === 'making' ? t('table.storyMaking') : t('table.story')}
          </button>
        )}
        <button type="button" className={style.ghost} onClick={shareLink}>
          <IconShare size={18} /> {t('table.shareResults')}
        </button>
      </div>
      {story === 'failed' && <p className={style.error} role="alert">{t('table.storyFailed')}</p>}

      <h2 className={style.sectionTitle}>{t('table.borschesTitle', { count: (results.borsches || []).length })}</h2>
      <ol className={style.list}>
        {(results.borsches || []).map((b) => {
          const avg = b.averages || {};
          const own = b.most_divisive && CRITERION_LABEL[b.most_divisive.criterion];
          return (
            <li key={b.position} className={style.card} data-testid={`table-borsch-${b.position}`}>
              <div className={style.cardHead}>
                <span className={style.badge}>{t('table.numberShort', { n: b.position })}</span>
                <div className={style.cardWords}>
                  <h3 className={style.cardName}>{borschTitle(b, t, dishLabel)}</h3>
                  <p className={style.cardMeta}>{t('table.ratersCount', { count: b.rater_count || 0 })}</p>
                </div>
                <p className={style.cardScore}>{formatAverage(avg.overall_rating) || '0'}</p>
              </div>
              {b.rater_count > 0 ? (
                <div className={style.meters}>
                  {METERS.map((m) => (
                    <ProgressLine key={m.key} title={t(CRITERION_LABEL[m.key])} value={avg[m.key]} icon={m.icon} />
                  ))}
                </div>
              ) : (
                <p className={style.cardMeta}>{t('table.borschNoRatings')}</p>
              )}
              {own && (results.borsches || []).length > 1 && (
                <p className={style.cardDivisive}>{t('table.borschDivisive', { criterion: t(own) })}</p>
              )}
              {b.borsch?.id && (
                <Link className={style.cardLink} to={`/borsch/${b.borsch.id}`}>{t('table.toCard')}</Link>
              )}
            </li>
          );
        })}
      </ol>

      {story && story.url && (
        <StorySheet
          url={story.url}
          blob={story.blob}
          code={code}
          onClose={() => setStory(null)}
        />
      )}
    </div>
  );
};

/** The picture before it leaves the phone: share it, save it, or close. */
const StorySheet = ({ url, blob, code, onClose }) => {
  const { t } = useI18n();
  const file = blob ? new File([blob], `naverny-borshchu-${code}.png`, { type: 'image/png' }) : null;
  const canShareFile = Boolean(file && navigator.canShare && navigator.canShare({ files: [file] }));

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const share = async () => {
    try {
      await navigator.share({ files: [file] });
      track('table_shared', { code, what: 'story', method: 'share' });
    } catch (e) {
      if (e?.name !== 'AbortError') console.error('Не вдалося поділитися картинкою:', e);
    }
  };

  return ReactDOM.createPortal(
    <div className={style.overlay} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className={style.sheet} role="dialog" aria-modal="true" aria-label={t('table.story')}>
        <div className={style.sheetTop}>
          <h2 className={style.sheetTitle}>{t('table.story')}</h2>
          <button type="button" className={style.sheetClose} onClick={onClose} aria-label={t('card.close')}>
            <IconClose size={22} />
          </button>
        </div>
        <img className={style.storyImg} src={url} alt={t('table.storyAlt')} data-testid="table-story" />
        <div className={style.sheetActions}>
          {canShareFile && (
            <button type="button" className={style.primary} onClick={share}>{t('table.storyShare')}</button>
          )}
          <a
            className={canShareFile ? style.ghost : style.primary}
            href={url}
            download={`naverny-borshchu-${code}.png`}
            onClick={() => track('table_shared', { code, what: 'story', method: 'download' })}
          >
            {t('table.storyDownload')}
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
};
