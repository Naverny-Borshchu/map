import { useEffect, useState } from 'react';
import { BOWLS_EVENT, listDrafts } from '../services/bowlDrafts';

/** The bowls waiting on this device, kept current across screens and tabs. */
export const useBowlDrafts = () => {
  const [bowls, setBowls] = useState(() => listDrafts());

  useEffect(() => {
    const sync = () => setBowls(listDrafts());
    window.addEventListener(BOWLS_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(BOWLS_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  return bowls;
};
