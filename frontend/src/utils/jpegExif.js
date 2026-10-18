/**
 * EXIF зі старого JPEG у новий, після того як canvas перемалював кадр.
 *
 * canvas.toBlob віддає голий JPEG: без координат зйомки, дати й моделі.
 * А GPS нам потрібен (Андрій, 18.10.2026: «може навіть знадобитись нам
 * потім»), тож блок EXIF (APP1 «Exif\0\0») переносимо з оригіналу як є, з
 * трьома правками, без яких він збрехав би про новий файл:
 *
 * - Orientation → 1. Браузер уже повернув кадр, коли малював його в canvas;
 *   стара шістка змусила б кожен переглядач повернути його вдруге.
 * - PixelXDimension / PixelYDimension → нові розміри.
 * - Мініатюра (IFD1) відвʼязується: вона лишилась у старій орієнтації.
 *
 * Якщо структура не така, як очікуємо, EXIF не переносимо зовсім: краще фото
 * без координат, ніж фото, повернуте набік.
 */

const SOI = 0xffd8;
const APP0 = 0xffe0;
const APP1 = 0xffe1;
const SOS = 0xffda;
const EOI = 0xffd9;
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

const TAG_ORIENTATION = 0x0112;
const TAG_EXIF_IFD = 0x8769;
const TAG_PIXEL_X = 0xa002;
const TAG_PIXEL_Y = 0xa003;

const TYPE_SHORT = 3;
const TYPE_LONG = 4;

const hasExifHeader = (b, at) => EXIF_HEADER.every((v, i) => b[at + i] === v);

/** Повний APP1-сегмент з EXIF (з маркером і довжиною) або null. */
export function readExifSegment(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (b.length < 4 || ((b[0] << 8) | b[1]) !== SOI) return null;
  let off = 2;
  while (off + 4 <= b.length) {
    const marker = (b[off] << 8) | b[off + 1];
    if ((marker & 0xff00) !== 0xff00 || marker === SOS || marker === EOI) return null;
    const len = (b[off + 2] << 8) | b[off + 3];
    if (len < 2) return null;
    const end = off + 2 + len;
    if (end > b.length) return null; // сегмент обрізаний: не вгадуємо
    if (marker === APP1 && len >= 8 && hasExifHeader(b, off + 4)) {
      return b.slice(off, end);
    }
    off = end;
  }
  return null;
}

/**
 * Копія сегмента з виправленими орієнтацією й розмірами, або null, якщо
 * TIFF-структура всередині не розбирається.
 */
export function patchExifForResized(segment, { width, height }) {
  const seg = segment.slice();
  const tiff = 10; // FF E1, довжина (2), "Exif\0\0" (6)
  if (seg.length < tiff + 8) return null;
  const view = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  const order = view.getUint16(tiff);
  if (order !== 0x4949 && order !== 0x4d4d) return null; // II / MM
  const le = order === 0x4949;
  if (view.getUint16(tiff + 2, le) !== 42) return null;

  const inside = (at, size) => at >= tiff && at + size <= seg.length;

  const entries = (ifdAt) => {
    if (!inside(ifdAt, 2)) return null;
    const count = view.getUint16(ifdAt, le);
    if (!inside(ifdAt + 2, count * 12 + 4)) return null;
    return { count, first: ifdAt + 2, next: ifdAt + 2 + count * 12 };
  };

  const setNumber = (entryAt, value) => {
    const type = view.getUint16(entryAt + 2, le);
    const valueAt = entryAt + 8;
    if (type === TYPE_SHORT) view.setUint16(valueAt, value, le);
    else if (type === TYPE_LONG) view.setUint32(valueAt, value, le);
    else return false;
    return true;
  };

  const ifd0 = entries(tiff + view.getUint32(tiff + 4, le));
  if (!ifd0) return null;

  let exifIfdAt = null;
  for (let i = 0; i < ifd0.count; i += 1) {
    const at = ifd0.first + i * 12;
    const tag = view.getUint16(at, le);
    if (tag === TAG_ORIENTATION && !setNumber(at, 1)) return null;
    if (tag === TAG_EXIF_IFD) exifIfdAt = tiff + view.getUint32(at + 8, le);
  }
  // IFD1 = мініатюра у старій орієнтації; без посилання її ніхто не покаже
  view.setUint32(ifd0.next, 0, le);

  if (exifIfdAt !== null) {
    const exif = entries(exifIfdAt);
    if (exif) {
      for (let i = 0; i < exif.count; i += 1) {
        const at = exif.first + i * 12;
        const tag = view.getUint16(at, le);
        if (tag === TAG_PIXEL_X) setNumber(at, width);
        if (tag === TAG_PIXEL_Y) setNumber(at, height);
      }
    }
  }
  return seg;
}

/** Новий JPEG із вставленим EXIF-сегментом (після JFIF APP0, якщо він є). */
export function insertExifSegment(jpeg, segment) {
  const b = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
  if (b.length < 4 || ((b[0] << 8) | b[1]) !== SOI) return null;
  let at = 2;
  if (((b[2] << 8) | b[3]) === APP0) at = 4 + ((b[4] << 8) | b[5]);
  if (at > b.length) return null;
  const out = new Uint8Array(b.length + segment.length);
  out.set(b.subarray(0, at), 0);
  out.set(segment, at);
  out.set(b.subarray(at), at + segment.length);
  return out;
}
