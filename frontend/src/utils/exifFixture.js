// Лише для тестів (jpegExif.test.js, preparePhoto.test.js); у збірку не потрапляє,
// бо його ніщо поза тестами не імпортує.

// Мінімальний EXIF, зібраний вручну, щоб у фікстурі не було нічиїх справжніх
// координат: IFD0 (Orientation=6, вказівники на Exif IFD і GPS IFD), IFD1
// (мініатюра), Exif IFD (PixelX як LONG, PixelY як SHORT), GPS IFD (широта N).
export const buildExifSegment = ({ littleEndian }) => {
  const le = littleEndian;
  const tiff = new Uint8Array(200);
  const v = new DataView(tiff.buffer);
  v.setUint16(0, le ? 0x4949 : 0x4d4d);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le); // IFD0 at 8

  const entry = (at, tag, type, count, value) => {
    v.setUint16(at, tag, le);
    v.setUint16(at + 2, type, le);
    v.setUint32(at + 4, count, le);
    if (type === 3 && count === 1) v.setUint16(at + 8, value, le);
    else v.setUint32(at + 8, value, le);
  };

  // IFD0: 3 entries at 8 → next IFD offset at 8+2+36 = 46
  v.setUint16(8, 3, le);
  entry(10, 0x0112, 3, 1, 6);     // Orientation = 6 (повернути на 90°)
  entry(22, 0x8769, 4, 1, 80);    // Exif IFD at 80
  entry(34, 0x8825, 4, 1, 120);   // GPS IFD at 120
  v.setUint32(46, 60, le);        // IFD1 at 60

  // IFD1 (мініатюра): 1 entry
  v.setUint16(60, 1, le);
  entry(62, 0x0201, 4, 1, 180);   // JPEGInterchangeFormat
  v.setUint32(74, 0, le);

  // Exif IFD: 2 entries
  v.setUint16(80, 2, le);
  entry(82, 0xa002, 4, 1, 8064);  // PixelXDimension (LONG)
  entry(94, 0xa003, 3, 1, 6048);  // PixelYDimension (SHORT)
  v.setUint32(106, 0, le);

  // GPS IFD: GPSLatitudeRef = "N"
  v.setUint16(120, 1, le);
  v.setUint16(122, 0x0001, le);
  v.setUint16(124, 2, le);        // ASCII
  v.setUint32(126, 2, le);
  tiff[130] = 0x4e;               // 'N'
  v.setUint32(134, 0, le);

  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const len = 2 + header.length + tiff.length;
  return Uint8Array.from([0xff, 0xe1, len >> 8, len & 0xff, ...header, ...tiff]);
};

export const APP0 = Uint8Array.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
export const SCAN = Uint8Array.from([0xff, 0xda, 0x00, 0x04, 0x00, 0x00, 0x11, 0x22, 0xff, 0xd9]);
export const jpeg = (...parts) => {
  const all = [Uint8Array.from([0xff, 0xd8]), ...parts];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) { out.set(p, at); at += p.length; }
  return out;
};

// «Фото вже на камері» (photoMeta.test.js, BowlFlow.test.jsx): a hand-built TIFF
// block with a shot time and coordinates, as a JPEG or inside a HEIC.
// A TIFF block with IFD0 → Exif IFD (DateTimeOriginal, OffsetTimeOriginal)
// and → GPS IFD (lat/lng as degrees, minutes, seconds).
export const buildTiff = ({ le = true, date = '2026:11:14 13:20:05', offset = '+02:00', gps = { lat: [50, 26, 54], latRef: 'N', lng: [30, 31, 24.6], lngRef: 'E' }, ifd0Date = null } = {}) => {
  const buf = new Uint8Array(512);
  const v = new DataView(buf.buffer);
  v.setUint16(0, le ? 0x4949 : 0x4d4d);
  v.setUint16(2, 42, le);
  v.setUint32(4, 8, le);
  const entry = (at, tag, type, count, value) => {
    v.setUint16(at, tag, le);
    v.setUint16(at + 2, type, le);
    v.setUint32(at + 4, count, le);
    v.setUint32(at + 8, value, le);
  };
  const writeAscii = (at, s) => { [...s].forEach((c, i) => { buf[at + i] = c.charCodeAt(0); }); buf[at + s.length] = 0; };

  // IFD0 at 8: Exif pointer, GPS pointer, DateTime
  const ifd0Count = 2 + (ifd0Date ? 1 : 0);
  v.setUint16(8, ifd0Count, le);
  entry(10, 0x8769, 4, 1, 100);
  entry(22, 0x8825, 4, 1, 200);
  if (ifd0Date) { entry(34, 0x0132, 2, ifd0Date.length + 1, 400); writeAscii(400, ifd0Date); }
  v.setUint32(10 + ifd0Count * 12, 0, le);

  // Exif IFD at 100
  const exifEntries = (date ? 1 : 0) + (offset ? 1 : 0);
  v.setUint16(100, exifEntries, le);
  let e = 102;
  if (date) { entry(e, 0x9003, 2, date.length + 1, 300); writeAscii(300, date); e += 12; }
  if (offset) { entry(e, 0x9011, 2, offset.length + 1, 330); writeAscii(330, offset); e += 12; }
  v.setUint32(e, 0, le);

  // GPS IFD at 200
  if (gps) {
    v.setUint16(200, 4, le);
    v.setUint16(202, 0x0001, le); v.setUint16(204, 2, le); v.setUint32(206, 2, le); buf[210] = gps.latRef.charCodeAt(0);
    entry(214, 0x0002, 5, 3, 350);
    v.setUint16(226, 0x0003, le); v.setUint16(228, 2, le); v.setUint32(230, 2, le); buf[234] = gps.lngRef.charCodeAt(0);
    entry(238, 0x0004, 5, 3, 374);
    v.setUint32(250, 0, le);
    const rat = (at, values) => values.forEach((x, i) => {
      const den = Number.isInteger(x) ? 1 : 100;
      v.setUint32(at + i * 8, Math.round(x * den), le);
      v.setUint32(at + i * 8 + 4, den, le);
    });
    rat(350, gps.lat);
    rat(374, gps.lng);
  } else {
    v.setUint16(200, 0, le);
  }
  return buf;
};

export const asJpeg = (tiff) => {
  const header = [0x45, 0x78, 0x69, 0x66, 0x00, 0x00];
  const len = 2 + header.length + tiff.length;
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, len >> 8, len & 0xff, ...header, ...tiff, 0xff, 0xda, 0x00, 0x02, 0xff, 0xd9]);
};

// HEIC keeps the TIFF block as an item: some boxes, then "Exif\0\0" + TIFF
export const asHeic = (tiff) => Uint8Array.from([
  0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63,
  0, 0, 0, 6, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, ...tiff,
]);


/** A camera-roll File whose EXIF says when and where (or only when, with gps: null). */
export const photoWithMeta = (name = 'roll.jpg', opts = {}) =>
  new File([asJpeg(buildTiff(opts))], name, { type: 'image/jpeg' });
