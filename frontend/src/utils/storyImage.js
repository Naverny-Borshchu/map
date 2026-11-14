import plateUrl from '../assets/images/plate.svg';
import { borschTitle, divisiveLabel, formatAverage, tableDate } from './tableView';

/**
 * The table's results as a picture for stories: 1080×1920 PNG, drawn on a
 * canvas on the device, in the brand's identity (the quest's red stage, MAK
 * for words, Roboto for every number, cream type, the plate logo).
 *
 * storyContent() decides WHAT goes on the picture and is a plain function
 * (tested); drawStory() only paints it.
 */

export const STORY_W = 1080;
export const STORY_H = 1920;

const CREAM = '#FFFAF5';
const BORSHCH = '#DC143C';
const BEET = '#860130';
const INK_2 = '#5C4744';

const WORDS = (size, weight = 700) => `${weight} ${size}px Mak, Roboto, Georgia, serif`;
const TEXT = (size, weight = 500) => `${weight} ${size}px Roboto, system-ui, sans-serif`;

/** What the picture says, as strings; nothing here touches a canvas. */
export const storyContent = (results, { t, lang = 'uk', dishLabel = (n) => n, venueLabel = (n) => n, cityLabel = (c) => c }) => {
  const place = results?.place || {};
  const venue = place.name ? venueLabel(place.name) : '';
  const city = place.city ? cityLabel(place.city) : '';
  const title = String(results?.title || '').trim() || venue;
  const date = tableDate(results?.closed_at, lang);
  const borsches = results?.borsches || [];
  const rows = borsches.map((b) => {
    const avg = b?.averages?.overall_rating;
    return {
      number: t('table.numberShort', { n: b.position }),
      name: borschTitle(b, t, dishLabel),
      value: formatAverage(avg),
      percent: Number.isFinite(Number(avg)) && avg !== null ? Math.max(0, Math.min(100, Number(avg) * 10)) : 0,
    };
  });
  const divisive = divisiveLabel(results, t, dishLabel);
  return {
    kicker: [t('table.storyKicker'), date].filter(Boolean).join(' · '),
    title,
    place: title === venue ? city : [venue, city].filter(Boolean).join(', '),
    average: formatAverage(results?.overall_average),
    averageLabel: t('table.averageLabel'),
    raters: String(results?.raters_total ?? 0),
    ratersLabel: t('table.ratersLabel', { count: Number(results?.raters_total ?? 0) }),
    rows,
    divisive: divisive
      ? { label: t('table.divisiveTitle'), criterion: divisive.criterion, borsch: divisive.borsch || '' }
      : null,
    footer: t('table.storyFooter'),
    url: 'map.navernyborshchu.com',
    brand: t('brand.name'),
    moreLabel: (n) => t('table.storyMore', { count: n }),
  };
};

// --- painting --------------------------------------------------------------

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
};

/** Words that fit `maxWidth`, at most `maxLines` lines, the last one cut with «…». */
const wrap = (ctx, text, maxWidth, maxLines) => {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  words.forEach((w) => {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width <= maxWidth || !line) line = next;
    else { lines.push(line); line = w; }
  });
  if (line) lines.push(line);
  if (lines.length <= maxLines) return lines;
  const kept = lines.slice(0, maxLines);
  let last = kept[maxLines - 1];
  while (last.length > 1 && ctx.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
  kept[maxLines - 1] = `${last.trimEnd()}…`;
  return kept;
};

const fit = (ctx, text, maxWidth) => wrap(ctx, text, maxWidth, 1)[0] || '';

const loadImage = (src) => new Promise((resolve) => {
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

const loadFonts = async () => {
  if (typeof document === 'undefined' || !document.fonts?.load) return;
  await Promise.all([
    document.fonts.load(WORDS(96), 'Наверни Борщу Abc'),
    document.fonts.load(TEXT(40, 500), 'Аб 0123456789'),
    document.fonts.load(TEXT(40, 800), '0123456789'),
    document.fonts.load(TEXT(40, 900), '0123456789'),
  ]).catch(() => {});
};

/** Paint `content` (storyContent) onto a 1080×1920 2D context. */
export const drawStory = (ctx, content, logo = null) => {
  const W = STORY_W;
  const H = STORY_H;
  const X = 90;
  const IW = W - X * 2;

  // the quest's red stage: a deep gradient with two soft cream discs
  const bg = ctx.createLinearGradient(0, 0, W * 0.4, H);
  bg.addColorStop(0, '#D0153A');
  bg.addColorStop(1, '#5E0A22');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(255, 250, 245, 0.10)';
  ctx.beginPath(); ctx.arc(W - 40, 210, 360, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255, 250, 245, 0.07)';
  ctx.beginPath(); ctx.arc(60, H - 260, 420, 0, Math.PI * 2); ctx.fill();

  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  // logo and wordmark
  let y = 110;
  if (logo) {
    ctx.fillStyle = CREAM;
    ctx.beginPath(); ctx.arc(X + 60, y + 60, 64, 0, Math.PI * 2); ctx.fill();
    ctx.drawImage(logo, X + 6, y + 6, 108, 108);
  }
  ctx.fillStyle = CREAM;
  ctx.font = WORDS(56);
  ctx.fillText(content.brand || '', X + (logo ? 150 : 0), y + 80);

  // kicker
  y = 330;
  ctx.font = TEXT(32, 700);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '5px';
  ctx.fillStyle = 'rgba(255, 250, 245, 0.85)';
  ctx.fillText(fit(ctx, content.kicker.toLocaleUpperCase(), IW), X, y);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

  // title
  ctx.font = WORDS(92);
  ctx.fillStyle = CREAM;
  const titleLines = wrap(ctx, content.title, IW, 3);
  y += 108;
  titleLines.forEach((line, i) => ctx.fillText(line, X, y + i * 100));
  y += (titleLines.length - 1) * 100;

  if (content.place) {
    y += 70;
    ctx.font = TEXT(40, 500);
    ctx.fillStyle = 'rgba(255, 250, 245, 0.92)';
    ctx.fillText(fit(ctx, content.place, IW), X, y);
  }

  // the score card: the table's average and how many rated
  y += 60;
  const cardH = 330;
  ctx.fillStyle = CREAM;
  roundRect(ctx, X, y, IW, cardH, 48);
  ctx.fill();
  ctx.fillStyle = BORSHCH;
  ctx.font = TEXT(30, 800);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
  ctx.fillText(content.averageLabel.toLocaleUpperCase(), X + 56, y + 78);
  if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  ctx.font = TEXT(200, 900);
  ctx.fillText(content.average || '0', X + 48, y + 280);
  // raters, on the right
  ctx.textAlign = 'right';
  ctx.fillStyle = BEET;
  ctx.font = TEXT(120, 800);
  ctx.fillText(content.raters, X + IW - 56, y + 190);
  ctx.fillStyle = INK_2;
  ctx.font = TEXT(32, 600);
  ctx.fillText(content.ratersLabel, X + IW - 56, y + 246);
  ctx.textAlign = 'left';
  y += cardH;

  // the footer is fixed to the bottom; the rows and the divisive line share what is left
  const footerTop = H - 190;
  const divH = content.divisive ? 210 : 0;
  const rowH = 128;
  y += 48;
  const room = footerTop - y - divH;
  const fits = Math.max(0, Math.floor(room / rowH));
  const shown = content.rows.slice(0, Math.min(fits, content.rows.length));
  const hidden = content.rows.length - shown.length;
  shown.forEach((row, i) => {
    const top = y + i * rowH;
    // number badge
    ctx.fillStyle = 'rgba(255, 250, 245, 0.18)';
    roundRect(ctx, X, top, 112, 72, 36);
    ctx.fill();
    ctx.fillStyle = CREAM;
    ctx.font = TEXT(36, 800);
    ctx.textAlign = 'center';
    ctx.fillText(row.number, X + 56, top + 50);
    ctx.textAlign = 'right';
    ctx.font = TEXT(64, 800);
    ctx.fillText(row.value || '', X + IW, top + 58);
    const valueW = ctx.measureText(row.value || '').width;
    ctx.textAlign = 'left';
    ctx.font = WORDS(48);
    ctx.fillText(fit(ctx, row.name, IW - 150 - valueW - 24), X + 140, top + 54);
    // meter
    ctx.fillStyle = 'rgba(255, 250, 245, 0.22)';
    roundRect(ctx, X + 140, top + 84, IW - 140, 14, 7);
    ctx.fill();
    if (row.percent > 0) {
      const grad = ctx.createLinearGradient(X + 140, 0, X + IW, 0);
      grad.addColorStop(0, '#FC7536');
      grad.addColorStop(1, '#F7D774');
      ctx.fillStyle = grad;
      roundRect(ctx, X + 140, top + 84, Math.max(14, ((IW - 140) * row.percent) / 100), 14, 7);
      ctx.fill();
    }
  });
  y += shown.length * rowH;
  if (hidden > 0) {
    ctx.fillStyle = 'rgba(255, 250, 245, 0.85)';
    ctx.font = TEXT(32, 600);
    ctx.fillText(content.moreLabel ? content.moreLabel(hidden) : `+${hidden}`, X + 140, y + 10);
    y += 40;
  }

  if (content.divisive) {
    y += 30;
    ctx.fillStyle = 'rgba(255, 250, 245, 0.12)';
    roundRect(ctx, X, y, IW, 170, 40);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 250, 245, 0.85)';
    ctx.font = TEXT(28, 800);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    ctx.fillText(content.divisive.label.toLocaleUpperCase(), X + 44, y + 54);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    ctx.fillStyle = CREAM;
    ctx.font = WORDS(60);
    const crit = fit(ctx, content.divisive.criterion, IW * 0.5);
    ctx.fillText(crit, X + 44, y + 128);
    if (content.divisive.borsch) {
      const critW = ctx.measureText(crit).width;
      ctx.font = TEXT(34, 500);
      ctx.fillStyle = 'rgba(255, 250, 245, 0.9)';
      ctx.fillText(fit(ctx, content.divisive.borsch, IW - critW - 120), X + 44 + critW + 28, y + 126);
    }
  }

  // footer
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255, 250, 245, 0.85)';
  ctx.font = TEXT(32, 500);
  ctx.fillText(content.footer, W / 2, H - 120);
  ctx.fillStyle = CREAM;
  ctx.font = TEXT(40, 800);
  ctx.fillText(content.url, W / 2, H - 66);
  ctx.textAlign = 'left';
};

/** The PNG, as a Blob. Null where the browser has no canvas to draw on. */
export const makeStoryImage = async (content) => {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext && canvas.getContext('2d');
  if (!ctx) return null;
  const [logo] = await Promise.all([loadImage(plateUrl), loadFonts()]);
  drawStory(ctx, content, logo);
  return new Promise((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch (e) {
      resolve(null);
    }
  });
};
