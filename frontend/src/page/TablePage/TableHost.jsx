import { useCallback, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { tableLink, tablesAPI } from '../../api/tables';
import { track } from '../../analytics';
import { copyUrl, shareUrl } from '../../utils/share';
import { borschTitle } from '../../utils/tableView';
import { useVisiblePolling } from '../../hook/useVisiblePolling';
import { showToast } from '../../components/Toast';
import { IconShare } from '../../components/Icons';
import { useI18n, useDishLabel, useVenueLabel, useCityLabel } from '../../i18n';
import { TableFrame } from './TableFrame';
import { TableQr } from './TableQr';
import { TablePrint } from './TablePrint';
import q from '../../components/QuestFlow/QuestFlow.module.scss';
import style from './Table.module.scss';

/** The host's progress is read every 10 seconds while the screen is visible. */
export const HOST_POLL_MS = 10000;

/**
 * The host's screen of an open table: a big QR code to show across the table
 * (or put on a projector, or print), the code to read aloud, the link for the
 * event chat, and who has rated what so far. «Закрити Стіл» ends the rating
 * and turns the same link into the results for everyone.
 */
export const TableHost = ({ code, table, onTable, reload, onRateSelf }) => {
  const { t } = useI18n();
  const dishLabel = useDishLabel();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();
  const navigate = useNavigate();
  const location = useLocation();
  const justCreated = Boolean(location.state?.created);
  // A blind table's QR is often on a projector or a phone held up to the
  // table, so the host's own names stay hidden until asked for.
  const [showNames, setShowNames] = useState(!table.blind);
  const [confirming, setConfirming] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState('');
  // «Надрукувати QR»: the size chooser, then the sheet that is being printed
  const [printMenu, setPrintMenu] = useState(false);
  const [printing, setPrinting] = useState(null);
  const printDone = useCallback(() => setPrinting(null), []);

  useVisiblePolling(reload, HOST_POLL_MS, table.status === 'open');

  const link = tableLink(code, table.share_url);
  const venue = venueLabel(table.place?.name || '');
  const heading = table.title || t('table.atVenue', { venue });
  const progress = table.progress || {};
  const raters = progress.raters_total || 0;
  const complete = progress.raters_complete || 0;

  const share = async () => {
    const method = await shareUrl({ url: link, title: heading, text: t('table.shareText', { venue }) }, t, { copiedKey: 'table.linkCopied' });
    if (method !== 'cancel') track('table_shared', { code, what: 'link', method, from: 'host' });
  };
  const copy = async () => {
    await copyUrl(link, t, 'table.linkCopied');
    track('table_shared', { code, what: 'link', method: 'copy', from: 'host' });
  };

  const print = (size) => {
    track('table_print', { code, size, blind: Boolean(table.blind), borsch_count: (table.borsches || []).length });
    setPrintMenu(false);
    setPrinting(size);
  };

  const close = async () => {
    if (closing) return;
    setClosing(true);
    setError('');
    try {
      const closed = await tablesAPI.close(code, { from: 'host' });
      showToast(t('table.closedToast'));
      onTable(closed);
    } catch (e) {
      console.error('Не вдалося закрити Стіл:', e);
      setError(t('table.closeFailed'));
      setClosing(false);
    }
  };

  const qrCard = (
    <section className={style.qrCard} aria-label={t('table.qrAria')}>
      <TableQr link={link} label={t('table.qrLabel', { code })} className={style.qr} />
      <p className={style.codeLabel}>{t('table.codeLabel')}</p>
      <p className={style.code} data-testid="table-code">{code}</p>
      <p className={style.link}>{link.replace(/^https?:\/\//, '')}</p>
      <div className={style.shareRow}>
        <button type="button" className={style.sharePrimary} onClick={share}>
          <IconShare size={20} /> {t('table.share')}
        </button>
        <button type="button" className={style.shareGhost} onClick={copy}>{t('table.copy')}</button>
      </div>
      <div className={style.printRow}>
        <button
          type="button"
          className={style.shareGhost}
          onClick={() => setPrintMenu((v) => !v)}
          aria-expanded={printMenu}
        >
          {t('table.print')}
        </button>
        {printMenu && (
          <div className={style.printOptions} role="group" aria-label={t('table.print')}>
            <button type="button" className={style.printOption} onClick={() => print('a4')}>
              <strong>{t('table.printA4')}</strong>
              <span>{t('table.printA4Hint')}</span>
            </button>
            <button type="button" className={style.printOption} onClick={() => print('a6')}>
              <strong>{t('table.printA6')}</strong>
              <span>{t('table.printA6Hint')}</span>
            </button>
          </div>
        )}
      </div>
    </section>
  );

  const progressPanel = (
    <section className={style.panel} aria-label={t('table.progressAria')}>
      <div className={style.bigRow}>
        <p className={style.bigNumber} data-testid="raters-total">{raters}</p>
        <div className={style.bigWords}>
          <p className={style.bigLabel}>{t('table.ratersNow', { count: raters })}</p>
          <p className={style.bigSub}>{t('table.ratersComplete', { n: complete, total: raters })}</p>
        </div>
      </div>
      <ul className={style.rows}>
        {(table.borsches || []).map((b) => (
          <li key={b.position} className={style.row}>
            <div className={style.rowTop}>
              <span className={style.badge}>{t('table.numberShort', { n: b.position })}</span>
              <span className={`${style.rowName} ${showNames ? '' : style.rowNameHidden}`}>
                {showNames ? borschTitle(b, t, dishLabel) : t('table.nameHidden')}
              </span>
              <span className={style.rowCount}>{t('table.ratedCount', { count: b.rated_count || 0 })}</span>
            </div>
            {(b.raters || []).length > 0 && (
              <ul className={style.names} aria-label={t('table.whoRated')}>
                {b.raters.map((r, i) => (
                  <li key={`${r.name}-${i}`} className={`${style.name} ${r.guest ? style.nameGuest : ''}`}>{r.name}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {table.blind && (
        <button type="button" className={style.namesToggle} onClick={() => setShowNames((v) => !v)} aria-pressed={showNames}>
          {t(showNames ? 'table.hideNames' : 'table.showNames')}
        </button>
      )}
      {raters === 0 && <p className={style.panelHint}>{t('table.nobodyYet')}</p>}
      <p className={style.panelHint}>{t('table.liveHint')}</p>
    </section>
  );

  return (
    <TableFrame hue="#A00322" onClose={() => navigate('/')} wide>
      <TablePrint size={printing} code={code} table={table} link={link} onDone={printDone} />
      <p className={q.stepCount}>{t('table.hostKicker')}</p>
      <h2 className={q.question}>{heading}</h2>
      <p className={style.subline}>
        {[table.title ? venue : null, table.place?.city ? cityLabel(table.place.city) : null].filter(Boolean).join(', ')}
      </p>
      {justCreated && <p className={style.notice} role="status">{t('table.createdNotice')}</p>}
      {table.blind && <p className={style.blindNote}>{t('table.blindHost')}</p>}

      <div className={style.hostGrid}>
        {qrCard}
        <div className={style.hostSide}>
          {progressPanel}
          <div className={style.hostActions}>
            <button type="button" className={style.ghostCream} onClick={onRateSelf}>{t('table.rateSelf')}</button>
            {!confirming ? (
              <button type="button" className={q.cta} onClick={() => setConfirming(true)}>{t('table.close')}</button>
            ) : (
              <div className={style.confirm} role="alertdialog" aria-label={t('table.closeConfirmTitle')}>
                <p className={style.confirmTitle}>{t('table.closeConfirmTitle')}</p>
                <p className={style.confirmText}>{t('table.closeConfirmText')}</p>
                <div className={style.confirmRow}>
                  <button type="button" className={q.cta} onClick={close} disabled={closing}>
                    {closing ? t('table.closing') : t('table.closeYes')}
                  </button>
                  <button type="button" className={q.skip} onClick={() => setConfirming(false)} disabled={closing}>
                    {t('table.closeNo')}
                  </button>
                </div>
              </div>
            )}
            {error && <p className={style.error} role="alert">{error}</p>}
          </div>
        </div>
      </div>
    </TableFrame>
  );
};
