import { useState } from 'react';
import { AddPhotoLater } from '../../components/AddPhotoLater';
import { readHostTable, saveHostTable } from '../../services/tableHost';
import { sameBorschName } from '../../services/bowlTargets';
import { track } from '../../analytics';
import { useT } from '../../i18n';
import style from './NewBorschPrompt.module.scss';

/**
 * After the host closes a table that put a new borshch on the map, once: a
 * photo of it, so the new card does not stay grey (63% of the cards had no
 * photo on 14.11). The meat type was asked when the table was created: after
 * that only a moderator may change it (PATCH type_meat is staff-only).
 *
 * Which borshch were new is known only to the device that created the table
 * (services/tableHost); elsewhere this shows nothing.
 */
export const NewBorschPrompt = ({ code, results }) => {
  const t = useT();
  const [record, setRecord] = useState(() => readHostTable(code));

  if (!record || record.prompted || !record.newNames.length || results?.status !== 'closed') return null;

  const fresh = (results.borsches || [])
    .map((b) => b.borsch)
    .filter((b) => b?.id && record.newNames.some((n) => sameBorschName(n, b.name)))
    .filter((b) => !(b.photo_urls || []).length && !record.done.includes(String(b.id)));
  if (!fresh.length) return null;

  const dismiss = () => {
    track('table_new_borsch_prompt', { code, action: 'later', count: fresh.length });
    setRecord(saveHostTable(code, { prompted: true }));
  };
  const uploaded = (id) => {
    track('table_new_borsch_prompt', { code, action: 'photo' });
    const done = [...record.done, String(id)];
    const left = fresh.filter((b) => !done.includes(String(b.id)));
    setRecord(saveHostTable(code, { done, ...(left.length ? {} : { prompted: true }) }));
  };

  return (
    <section className={style.card} aria-labelledby="new-borsch-title" data-testid="new-borsch-prompt">
      <h2 id="new-borsch-title" className={style.title}>{t('table.newPromptTitle', { count: fresh.length })}</h2>
      <p className={style.text}>{t('table.newPromptText')}</p>
      <ul className={style.list}>
        {fresh.map((b) => (
          <li key={b.id} className={style.row}>
            <span className={style.name}>{b.name}</span>
            <AddPhotoLater borschId={b.id} onUploaded={() => uploaded(b.id)} />
          </li>
        ))}
      </ul>
      <button type="button" className={style.later} onClick={dismiss}>{t('table.newPromptLater')}</button>
    </section>
  );
};
