import { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { TableQr } from './TableQr';
import { useI18n, useVenueLabel, useCityLabel } from '../../i18n';
import './TablePrint.scss';

/** The paper sizes the host can print the QR on. */
export const PRINT_SIZES = ['a4', 'a6'];

const Face = ({ code, link, heading, venue, small = false }) => {
  const { t } = useI18n();
  return (
    <div className={`nb-print-face ${small ? 'nb-print-face--small' : ''}`}>
      <p className="nb-print-brand">{t('table.printBrand')}</p>
      <h1 className="nb-print-title">{heading}</h1>
      {venue && <p className="nb-print-venue">{venue}</p>}
      <TableQr link={link} label={t('table.qrLabel', { code })} className="nb-print-qr" />
      <p className="nb-print-code-label">{t('table.codeLabel')}</p>
      <p className="nb-print-code">{code}</p>
      <ol className="nb-print-steps">
        <li>{t('table.printStep1')}</li>
        <li>{t('table.printStep2')}</li>
        <li>{t('table.printStep3')}</li>
      </ol>
      <p className="nb-print-link">{link.replace(/^https?:\/\//, '')}</p>
    </div>
  );
};

/**
 * «Надрукувати QR»: the table's QR on paper, through the browser's own print
 * dialog and print CSS (TablePrint.scss), no PDF made anywhere.
 *
 *   a4   one poster: a big QR, the title, the venue, the code and three lines
 *   a6   a table tent: an A4 sheet with two tents of two A6 faces each; cut
 *        along the dashed line, fold along the dotted one, stand it up
 *
 * While it prints, everything else on the page is hidden (body.nb-printing);
 * on screen the sheet is never shown.
 */
export const TablePrint = ({ size, code, table, link, onDone }) => {
  const { t } = useI18n();
  const venueLabel = useVenueLabel();
  const cityLabel = useCityLabel();

  useEffect(() => {
    if (!size) return undefined;
    document.body.classList.add('nb-printing');
    let finished = false;
    const done = () => {
      if (finished) return;
      finished = true;
      document.body.classList.remove('nb-printing');
      onDone?.();
    };
    window.addEventListener('afterprint', done);
    // one frame for the sheet to be in the DOM before the dialog takes a picture of it
    const timer = setTimeout(() => {
      try { window.print(); } catch (e) { done(); }
    }, 60);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('nb-printing');
    };
  }, [size, onDone]);

  if (!size) return null;

  const venue = venueLabel(table.place?.name || '');
  const heading = table.title || t('table.printTitle');
  const place = [venue, table.place?.city ? cityLabel(table.place.city) : null].filter(Boolean).join(', ');
  const face = (small) => <Face code={code} link={link} heading={heading} venue={place} small={small} />;

  return ReactDOM.createPortal(
    <div className="nb-print-root" data-size={size} data-testid="table-print">
      {size === 'a4' ? (
        <div className="nb-print-page nb-print-page--a4">{face(false)}</div>
      ) : (
        <div className="nb-print-page nb-print-page--a6">
          {face(true)}{face(true)}{face(true)}{face(true)}
        </div>
      )}
    </div>,
    document.body
  );
};
