import { dayMonth } from './dates';
/**
 * When and where a photo from the camera roll was taken, read on the device
 * from the ORIGINAL file, before preparePhoto shrinks it. Nothing of this is
 * sent anywhere: the bowl only uses it to suggest the venue («Фото зроблено
 * біля «Ватри». Це той заклад?») and to show the time on the bowl. The photo
 * itself keeps its EXIF on upload as before (preparePhoto + jpegExif; Andrii,
 * 18.10.2026).
 *
 * JPEG keeps EXIF in its APP1 segment; HEIC/HEIF keep the same TIFF block as
 * an item inside the file, so for those the first megabyte is searched for
 * the «Exif\0\0» header that precedes it. An iPhone sometimes strips the
 * coordinates when a photo is picked: then only the time is there, and that
 * is fine.
 *
 * parseExifMeta(bytes) → { takenAt, offset, gps }
 *   takenAt  'YYYY-MM-DDTHH:MM:SS', the camera's wall-clock time, or null
 *   offset   '+03:00' when the camera wrote OffsetTimeOriginal, or null
 *   gps      { lat, lng } or null
 */

const SCAN_BYTES = 1024 * 1024;

const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_DATETIME = 0x0132;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_OFFSET_ORIGINAL = 0x9011;
const GPS_LAT_REF = 0x0001;
const GPS_LAT = 0x0002;
const GPS_LNG_REF = 0x0003;
const GPS_LNG = 0x0004;

const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
const EXIF_HEADER = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]; // "Exif\0\0"

const EMPTY = { takenAt: null, offset: null, gps: null };

const hasExifHeader = (b, at) => EXIF_HEADER.every((v, k) => b[at + k] === v);

/** Where the TIFF block starts inside `b`, or -1. */
export const findTiffStart = (b) => {
  // JPEG: walk the segments to the APP1 «Exif\0\0» one; TIFF follows the header
  if (b.length > 4 && b[0] === 0xff && b[1] === 0xd8) {
    let off = 2;
    while (off + 4 <= b.length) {
      const marker = (b[off] << 8) | b[off + 1];
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda || marker === 0xffd9) return -1;
      const len = (b[off + 2] << 8) | b[off + 3];
      if (len < 2) return -1;
      if (marker === 0xffe1 && len >= 8 && hasExifHeader(b, off + 4)) return off + 10;
      off += 2 + len;
    }
    return -1;
  }
  // HEIC and the rest: "Exif\0\0" followed by a TIFF byte-order mark
  for (let i = 0; i + 14 <= b.length; i += 1) {
    if (b[i] !== 0x45 || !hasExifHeader(b, i)) continue;
    const t = i + 6;
    const ii = b[t] === 0x49 && b[t + 1] === 0x49 && b[t + 2] === 0x2a && b[t + 3] === 0x00;
    const mm = b[t] === 0x4d && b[t + 1] === 0x4d && b[t + 2] === 0x00 && b[t + 3] === 0x2a;
    if (ii || mm) return t;
  }
  return -1;
};

const readIfd = (view, tiff, at, le) => {
  const len = view.byteLength;
  if (at < tiff || at + 2 > len) return null;
  const count = view.getUint16(at, le);
  if (count > 512 || at + 2 + count * 12 > len) return null;
  const out = new Map();
  for (let i = 0; i < count; i += 1) {
    const e = at + 2 + i * 12;
    const tag = view.getUint16(e, le);
    const type = view.getUint16(e + 2, le);
    const n = view.getUint32(e + 4, le);
    const size = (TYPE_SIZE[type] || 0) * n;
    if (!size) continue;
    const valueAt = size <= 4 ? e + 8 : tiff + view.getUint32(e + 8, le);
    if (valueAt < 0 || valueAt + size > len) continue;
    out.set(tag, { type, n, valueAt });
  }
  return out;
};

const ascii = (view, entry) => {
  if (!entry || entry.type !== 2) return '';
  let s = '';
  for (let i = 0; i < entry.n; i += 1) {
    const c = view.getUint8(entry.valueAt + i);
    if (!c) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
};

const rationals = (view, entry, le) => {
  if (!entry || (entry.type !== 5 && entry.type !== 10) || entry.n < 3) return null;
  const out = [];
  for (let i = 0; i < 3; i += 1) {
    const at = entry.valueAt + i * 8;
    const num = entry.type === 5 ? view.getUint32(at, le) : view.getInt32(at, le);
    const den = entry.type === 5 ? view.getUint32(at + 4, le) : view.getInt32(at + 4, le);
    if (!den) return null;
    out.push(num / den);
  }
  return out;
};

const dms = ([d, m, s], ref, neg) => {
  const v = d + m / 60 + s / 3600;
  return ref === neg ? -v : v;
};

/** "2026:11:14 13:20:05" → "2026-11-14T13:20:05", or null for zeros and rubbish. */
export const exifDateToIso = (raw) => {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(raw || '').trim());
  if (!m) return null;
  const [, y, mo, d, h, mi, s = '00'] = m;
  if (Number(y) < 1990 || Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
  if (Number(h) > 23 || Number(mi) > 59) return null;
  return `${y}-${mo}-${d}T${h}:${mi}:${s}`;
};

/** The meta of an EXIF/TIFF-carrying file's first bytes. Never throws. */
export const parseExifMeta = (bytes) => {
  try {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const tiff = findTiffStart(b);
    if (tiff < 0) return { ...EMPTY };
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    const order = view.getUint16(tiff);
    if (order !== 0x4949 && order !== 0x4d4d) return { ...EMPTY };
    const le = order === 0x4949;
    if (view.getUint16(tiff + 2, le) !== 42) return { ...EMPTY };
    const ifd0 = readIfd(view, tiff, tiff + view.getUint32(tiff + 4, le), le);
    if (!ifd0) return { ...EMPTY };

    const pointer = (tag) => {
      const e = ifd0.get(tag);
      return e && (e.type === 4 || e.type === 3) ? tiff + (e.type === 4 ? view.getUint32(e.valueAt, le) : view.getUint16(e.valueAt, le)) : null;
    };

    let takenAt = null;
    let offset = null;
    const exifAt = pointer(TAG_EXIF_IFD);
    const exif = exifAt !== null ? readIfd(view, tiff, exifAt, le) : null;
    if (exif) {
      takenAt = exifDateToIso(ascii(view, exif.get(TAG_DATETIME_ORIGINAL)));
      const off = ascii(view, exif.get(TAG_OFFSET_ORIGINAL));
      offset = /^[+-]\d{2}:\d{2}$/.test(off) ? off : null;
    }
    if (!takenAt) takenAt = exifDateToIso(ascii(view, ifd0.get(TAG_DATETIME)));

    let gps = null;
    const gpsAt = pointer(TAG_GPS_IFD);
    const g = gpsAt !== null ? readIfd(view, tiff, gpsAt, le) : null;
    if (g) {
      const lat = rationals(view, g.get(GPS_LAT), le);
      const lng = rationals(view, g.get(GPS_LNG), le);
      if (lat && lng) {
        const point = {
          lat: dms(lat, ascii(view, g.get(GPS_LAT_REF)).toUpperCase(), 'S'),
          lng: dms(lng, ascii(view, g.get(GPS_LNG_REF)).toUpperCase(), 'W'),
        };
        const valid = Number.isFinite(point.lat) && Number.isFinite(point.lng)
          && Math.abs(point.lat) <= 90 && Math.abs(point.lng) <= 180
          && !(point.lat === 0 && point.lng === 0);
        if (valid) gps = { lat: Number(point.lat.toFixed(6)), lng: Number(point.lng.toFixed(6)) };
      }
    }
    return { takenAt, offset, gps };
  } catch (e) {
    return { ...EMPTY };
  }
};

const readBytes = (blob) =>
  blob.arrayBuffer
    ? blob.arrayBuffer().then((buf) => new Uint8Array(buf))
    : new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(new Uint8Array(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(blob);
      });

/** The meta of a picked file; empty for anything unreadable. */
export const readPhotoMeta = async (file) => {
  if (!file || typeof file.slice !== 'function') return { ...EMPTY };
  try {
    return parseExifMeta(await readBytes(file.slice(0, SCAN_BYTES)));
  } catch (e) {
    return { ...EMPTY };
  }
};

/** The first of several photos that knows where (then when) it was taken. */
export const bestPhotoMeta = (metas = []) => {
  const withGps = metas.find((m) => m && m.gps);
  const withTime = metas.find((m) => m && m.takenAt);
  return {
    takenAt: (withGps && withGps.takenAt) || (withTime && withTime.takenAt) || null,
    offset: (withGps && withGps.offset) || (withTime && withTime.offset) || null,
    gps: withGps ? withGps.gps : null,
  };
};

/**
 * "14 листопада, 13:20" / "14 November, 13:20": the camera's own wall-clock
 * time, shown as it was on the camera (no time-zone arithmetic).
 */
export const formatTakenAt = (takenAt, lang = 'uk') => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(String(takenAt || ''));
  if (!m) return '';
  const [, y, mo, d, h, mi] = m.map(Number);
  const date = new Date(y, mo - 1, d, h, mi);
  const day = dayMonth(date, lang);
  return `${day}, ${String(h).padStart(2, '0')}:${String(mi).padStart(2, '0')}`;
};
