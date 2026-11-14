import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { EmptyState } from '../../components/EmptyState';
import { normalizeTableCode, tablesAPI } from '../../api/tables';
import { readTableGuest } from '../../services/tableGuest';
import { useT } from '../../i18n';
import { TableHost } from './TableHost';
import { TableGuest } from './TableGuest';
import { TableResults } from './TableResults';
import style from './Table.module.scss';

/**
 * map.navernyborshchu.com/t/<code>: the one link of a table (QR, chat, print).
 *
 * The same link is a different screen for different people and moments:
 *
 *   the host, table open     the QR, the code, who has rated, «Закрити Стіл»
 *   anyone else, table open  the door (a name or Google) and the taste questions
 *   anyone, table closed     the results, with blind names revealed
 *   no such code             a short explanation and the way back to the map
 *
 * Codes are case-insensitive: a lower-case link is quietly rewritten to the
 * canonical one, and something that cannot be a code is unknown without a
 * request to the API.
 */
export const TablePage = () => {
  const { code: raw } = useParams();
  const navigate = useNavigate();
  const code = normalizeTableCode(raw);

  useEffect(() => {
    if (code && raw !== code) navigate(`/t/${code}`, { replace: true });
  }, [code, raw, navigate]);

  // One wrapper as the page's root: the map1 variant pads the root of every
  // page for the tab bar. On the full-screen red stage that padding would land
  // inside the fixed frame and cut its bottom off; here it pads an empty block
  // behind the frame, and the bottom of the results page, where it belongs.
  return (
    <div className={style.route}>
      {code ? <TableLoader key={code} code={code} /> : <TableMissing />}
    </div>
  );
};

export const TableMissing = () => {
  const t = useT();
  const navigate = useNavigate();
  return (
    <div className={style.page}>
      <EmptyState
        art="find"
        title={t('table.unknownTitle')}
        text={t('table.unknownText')}
        action={{ onClick: () => navigate('/'), label: t('common.toMap') }}
      />
    </div>
  );
};

const TableLoader = ({ code }) => {
  const t = useT();
  const [guest, setGuest] = useState(() => readTableGuest(code));
  const [table, setTable] = useState(null);
  const [state, setState] = useState('loading'); // loading | ok | missing | error
  // the host can step out of the host screen to rate the borshch too
  const [hostRates, setHostRates] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await tablesAPI.get(code, { guestToken: readTableGuest(code).token });
      setTable(data);
      setState('ok');
      return data;
    } catch (e) {
      if (e?.status === 404) setState('missing');
      else setState((s) => (s === 'ok' ? s : 'error'));
      return null;
    }
  }, [code]);

  useEffect(() => {
    load();
  }, [load]);

  const refreshGuest = useCallback(() => setGuest(readTableGuest(code)), [code]);

  if (state === 'missing') return <TableMissing />;
  if (state === 'error') {
    return (
      <div className={style.page}>
        <EmptyState
          art="spoon"
          title={t('table.loadFailed')}
          text={t('table.loadFailedText')}
          action={{ onClick: () => { setState('loading'); load(); }, label: t('rate.retry') }}
        />
      </div>
    );
  }
  if (state === 'loading' || !table) {
    return (
      <div className={style.page}>
        <EmptyState loading title={t('table.loading')} />
      </div>
    );
  }

  if (table.status === 'closed') {
    return <TableResults code={code} table={table} guestToken={guest.token} />;
  }

  if (table.is_host && !hostRates) {
    return (
      <TableHost
        code={code}
        table={table}
        onTable={setTable}
        reload={load}
        onRateSelf={() => setHostRates(true)}
      />
    );
  }

  return (
    <TableGuest
      code={code}
      table={table}
      guest={guest}
      onGuest={refreshGuest}
      onTable={setTable}
      reload={load}
      onBack={table.is_host ? () => setHostRates(false) : null}
    />
  );
};
