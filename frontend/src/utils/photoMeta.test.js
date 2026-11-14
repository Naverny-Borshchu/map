import { bestPhotoMeta, exifDateToIso, formatTakenAt, parseExifMeta, readPhotoMeta } from './photoMeta';
import { asHeic, asJpeg, buildTiff } from './exifFixture';

/**
 * «Фото вже на камері»: when and where a picked photo was taken, read from the
 * original before it is shrunk. The fixtures are built by hand here, so no
 * real person's coordinates live in the repository.
 */

describe('parseExifMeta', () => {
  it('reads the time and the coordinates of a JPEG, little-endian', () => {
    const meta = parseExifMeta(asJpeg(buildTiff()));
    expect(meta.takenAt).toBe('2026-11-14T13:20:05');
    expect(meta.offset).toBe('+02:00');
    expect(meta.gps.lat).toBeCloseTo(50.448333, 5);
    expect(meta.gps.lng).toBeCloseTo(30.5235, 4);
  });

  it('reads a big-endian block, and south and west are negative', () => {
    const meta = parseExifMeta(asJpeg(buildTiff({ le: false, gps: { lat: [33, 52, 0], latRef: 'S', lng: [151, 12, 0], lngRef: 'W' } })));
    expect(meta.gps.lat).toBeCloseTo(-33.866667, 5);
    expect(meta.gps.lng).toBeCloseTo(-151.2, 5);
  });

  it('finds the block inside a HEIC', () => {
    const meta = parseExifMeta(asHeic(buildTiff()));
    expect(meta.takenAt).toBe('2026-11-14T13:20:05');
    expect(meta.gps).not.toBeNull();
  });

  it('keeps the time when the iPhone stripped the coordinates', () => {
    const meta = parseExifMeta(asJpeg(buildTiff({ gps: null })));
    expect(meta).toEqual({ takenAt: '2026-11-14T13:20:05', offset: '+02:00', gps: null });
  });

  it('falls back to the file date of IFD0 when the shot has none', () => {
    const meta = parseExifMeta(asJpeg(buildTiff({ date: null, offset: null, gps: null, ifd0Date: '2026:11:13 20:01:00' })));
    expect(meta.takenAt).toBe('2026-11-13T20:01:00');
  });

  it('says nothing for a file without EXIF, a broken one, or zero coordinates', () => {
    expect(parseExifMeta(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 2]))).toEqual({ takenAt: null, offset: null, gps: null });
    expect(parseExifMeta(Uint8Array.from([1, 2, 3]))).toEqual({ takenAt: null, offset: null, gps: null });
    const truncated = asJpeg(buildTiff()).slice(0, 40);
    expect(parseExifMeta(truncated).gps).toBeNull();
    const zero = parseExifMeta(asJpeg(buildTiff({ gps: { lat: [0, 0, 0], latRef: 'N', lng: [0, 0, 0], lngRef: 'E' } })));
    expect(zero.gps).toBeNull();
  });
});

describe('dates', () => {
  it('turns EXIF dates into ISO and rejects zeros', () => {
    expect(exifDateToIso('2026:11:14 13:20:05')).toBe('2026-11-14T13:20:05');
    expect(exifDateToIso('0000:00:00 00:00:00')).toBeNull();
    expect(exifDateToIso('rubbish')).toBeNull();
  });

  it('prints the camera time in both languages', () => {
    expect(formatTakenAt('2026-11-14T13:20:05', 'uk')).toBe('14\u00a0листопада, 13:20');
    expect(formatTakenAt('2026-11-14T09:05:00', 'en')).toBe('14\u00a0November, 09:05');
    expect(formatTakenAt(null, 'uk')).toBe('');
  });
});

describe('several photos', () => {
  it('prefers the one that knows where, then the one that knows when', () => {
    const a = { takenAt: '2026-11-14T13:00:00', offset: null, gps: null };
    const b = { takenAt: '2026-11-14T13:05:00', offset: null, gps: { lat: 50, lng: 30 } };
    expect(bestPhotoMeta([a, b])).toEqual({ takenAt: '2026-11-14T13:05:00', offset: null, gps: { lat: 50, lng: 30 } });
    expect(bestPhotoMeta([a])).toEqual({ takenAt: '2026-11-14T13:00:00', offset: null, gps: null });
    expect(bestPhotoMeta([])).toEqual({ takenAt: null, offset: null, gps: null });
  });

  it('reads a File without uploading anything', async () => {
    const file = new File([asJpeg(buildTiff())], 'roll.jpg', { type: 'image/jpeg' });
    const meta = await readPhotoMeta(file);
    expect(meta.takenAt).toBe('2026-11-14T13:20:05');
    expect(await readPhotoMeta(null)).toEqual({ takenAt: null, offset: null, gps: null });
  });
});
