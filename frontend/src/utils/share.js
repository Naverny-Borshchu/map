import { showToast } from '../components/Toast';

const copyWithInput = (text) => {
  const input = document.createElement('input');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  try { document.execCommand('copy'); } catch (e) { /* nothing else to try */ }
  document.body.removeChild(input);
};

/**
 * Share a borshch page: the system share sheet where there is one, otherwise
 * copy the link and say so in a toast.
 *
 * Six screens carried their own copy of this (list, favourites, reviews, the
 * map sheet, the borshch page, added borshches), each ending in alert(), some
 * with the Ukrainian text hardcoded. Behaviour is the same as theirs: share,
 * and fall back to the clipboard when sharing is unavailable or fails.
 */
export const shareBorsch = async (id, t) => {
  const url = `${window.location.origin}/borsch/${id}`;
  await shareUrl({ url, title: t('card.shareTitle'), text: t('card.shareText') }, t);
};

/**
 * Any link: the share sheet where there is one, the clipboard and a toast
 * otherwise. Resolves to how it went: 'share', 'copy' or 'cancel' (the person
 * closed the sheet), so a caller can count it.
 */
export const shareUrl = async ({ url, title = '', text = '' }, t, { copiedKey = 'card.shareCopied' } = {}) => {
  const copied = () => showToast(t(copiedKey));
  const copy = async () => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(url);
        copied();
        return 'copy';
      } catch (e) { /* fall through */ }
    }
    copyWithInput(url);
    copied();
    return 'copy';
  };

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url });
      return 'share';
    } catch (err) {
      // the person closing the share sheet is not an error worth a fallback
      if (err && err.name === 'AbortError') return 'cancel';
    }
  }
  return copy();
};

/** Copy only, no share sheet: the «Скопіювати» button next to «Поділитися». */
export const copyUrl = async (url, t, copiedKey = 'card.shareCopied') => {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(url);
      showToast(t(copiedKey));
      return 'copy';
    } catch (e) { /* fall through */ }
  }
  copyWithInput(url);
  showToast(t(copiedKey));
  return 'copy';
};
