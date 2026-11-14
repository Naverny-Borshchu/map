import { useEffect, useRef, useState } from 'react';
import style from './Toast.module.scss';

const EVENT = 'nb:toast';
const SHOW_MS = 3200;

/**
 * One short confirmation at a time, e.g. «link copied».
 *
 * These used to be window.alert(): a browser dialog that stops the page, in
 * the browser's own design, for a message that needs no answer. Anything can
 * call showToast(); the single <Toaster/> in Layout draws it in a polite live
 * region, so screen readers announce it without moving focus.
 */
export const showToast = (message) => {
  if (!message) return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message: String(message) } }));
};

export const Toaster = () => {
  const [toast, setToast] = useState(null);
  const timer = useRef(null);

  useEffect(() => {
    const onToast = (e) => {
      clearTimeout(timer.current);
      setToast({ message: e.detail?.message, key: Date.now() });
      timer.current = setTimeout(() => setToast(null), SHOW_MS);
    };
    window.addEventListener(EVENT, onToast);
    return () => {
      window.removeEventListener(EVENT, onToast);
      clearTimeout(timer.current);
    };
  }, []);

  return (
    <div className={style.region} role="status" aria-live="polite">
      {toast && (
        <div key={toast.key} className={style.toast}>
          <span className={`${style.bowl} nb-bowl`} aria-hidden="true" />
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
};
