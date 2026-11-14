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
