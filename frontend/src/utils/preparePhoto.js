/**
 * Фото борщу перед відправкою: зменшене й перекодоване в JPEG.
 *
 * Навіщо. 17.10.2026 айфон віддав три знімки на 13,9, 14,6 і 15,1 МБ, а nginx
 * пускає на /api/ щонайбільше 10 МБ. Усі три отримали 413, і жодне фото не
 * доїхало, хоча оцінка збереглась. Картці борщу 48 мегапікселів ні до чого:
 * довша сторона 2048 px — це вже більше, ніж ширина будь-якого екрана, на
 * якому її покажуть, і важить такий знімок сотні кілобайт, а не десятки МБ.
 *
 * Перекодування ще й зрізає EXIF: координати зйомки, модель телефона й дату.
 * Фото лягають у публічний /media/, і все, що їде разом із ними, теж стає
 * публічним.
 *
 * Якщо браузер не вміє розкодувати файл (HEIC у десктопному Chrome) або
 * canvas недоступний, віддаємо оригінал: гірше стиснути не вийде, а сервер
 * сам вирішить, чи приймати.
 */

export const MAX_EDGE = 2048;
export const JPEG_QUALITY = 0.85;

// GIF може бути анімованим, а canvas залишить від нього один кадр.
const KEEP_AS_IS = new Set(['image/gif', 'image/svg+xml']);

const loadImage = (file) =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('cannot decode image'));
    };
    img.src = url;
  });

const toJpegName = (name) => `${String(name || 'photo').replace(/\.[^./\\]+$/, '') || 'photo'}.jpg`;

/** Розміри після вписування в квадрат maxEdge × maxEdge; менші знімки не збільшуємо. */
export const fitWithin = (width, height, maxEdge = MAX_EDGE) => {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

export async function preparePhotoForUpload(file, { maxEdge = MAX_EDGE, quality = JPEG_QUALITY } = {}) {
  if (!file || KEEP_AS_IS.has(file.type)) return file;
  // Порожній type трапляється на HEIC у браузерах, які його не знають;
  // спробувати розкодувати однаково варто, а не-картинки відсіюємо.
  if (file.type && !file.type.startsWith('image/')) return file;

  let url;
  try {
    const loaded = await loadImage(file);
    url = loaded.url;
    // naturalWidth/Height уже з урахуванням EXIF-орієнтації, і drawImage
    // малює повернутий кадр (Chrome 81+, Safari 13.1+), тож портрет лишається
    // портретом без ручного розбору EXIF.
    const { naturalWidth, naturalHeight } = loaded.img;
    if (!naturalWidth || !naturalHeight) return file;

    const { width, height } = fitWithin(naturalWidth, naturalHeight, maxEdge);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    // JPEG не має прозорості; без підкладки прозорий PNG стане чорним.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(loaded.img, 0, 0, width, height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob || !blob.size) return file;

    return new File([blob], toJpegName(file.name), {
      type: 'image/jpeg',
      lastModified: file.lastModified || Date.now(),
    });
  } catch (e) {
    return file;
  } finally {
    if (url) URL.revokeObjectURL(url);
  }
}
