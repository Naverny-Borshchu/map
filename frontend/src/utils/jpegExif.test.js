import { insertExifSegment, patchExifForResized, readExifSegment } from './jpegExif';
import { APP0, SCAN, buildExifSegment, jpeg } from './exifFixture';

// читання тегу з уже пропатченого сегмента, тим самим порядком байтів
const tagValue = (seg, ifdOffsetInTiff, tag) => {
  const tiff = 10;
  const v = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  const le = v.getUint16(tiff) === 0x4949;
  const at = tiff + ifdOffsetInTiff;
  const count = v.getUint16(at, le);
  for (let i = 0; i < count; i += 1) {
    const e = at + 2 + i * 12;
    if (v.getUint16(e, le) === tag) {
      return v.getUint16(e + 2, le) === 3 ? v.getUint16(e + 8, le) : v.getUint32(e + 8, le);
    }
  }
  return undefined;
};
const nextIfd = (seg, ifdOffsetInTiff) => {
  const v = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
  const le = v.getUint16(10) === 0x4949;
  const at = 10 + ifdOffsetInTiff;
  return v.getUint32(at + 2 + v.getUint16(at, le) * 12, le);
};

describe.each([
  ['little-endian (II)', true],
  ['big-endian (MM, як в айфона)', false],
])('EXIF %s', (_, littleEndian) => {
  const segment = buildExifSegment({ littleEndian });

  it('finds the EXIF segment after JFIF', () => {
    expect(readExifSegment(jpeg(APP0, segment, SCAN))).toEqual(segment);
  });

  it('turns orientation to 1, updates the pixel size and unlinks the old thumbnail', () => {
    const patched = patchExifForResized(segment, { width: 1536, height: 2048 });
    expect(tagValue(patched, 8, 0x0112)).toBe(1);
    expect(tagValue(patched, 80, 0xa002)).toBe(1536);
    expect(tagValue(patched, 80, 0xa003)).toBe(2048);
    expect(nextIfd(patched, 8)).toBe(0);
    // the original is untouched: the caller may still need it
    expect(tagValue(segment, 8, 0x0112)).toBe(6);
  });

  it('keeps the GPS block byte for byte', () => {
    const patched = patchExifForResized(segment, { width: 1536, height: 2048 });
    expect(tagValue(patched, 8, 0x8825)).toBe(120);
    expect(Array.from(patched.slice(10 + 120, 10 + 138))).toEqual(Array.from(segment.slice(10 + 120, 10 + 138)));
  });

  it('puts the patched EXIF into the canvas JPEG right after JFIF', () => {
    const patched = patchExifForResized(segment, { width: 1536, height: 2048 });
    const canvasOut = jpeg(APP0, SCAN);
    const merged = insertExifSegment(canvasOut, patched);
    expect(Array.from(merged.slice(0, 2 + APP0.length))).toEqual(Array.from(canvasOut.slice(0, 2 + APP0.length)));
    expect(readExifSegment(merged)).toEqual(patched);
    expect(merged.length).toBe(canvasOut.length + patched.length);
  });
});

describe('EXIF edge cases', () => {
  it('inserts right after SOI when there is no JFIF block', () => {
    const seg = buildExifSegment({ littleEndian: true });
    const merged = insertExifSegment(jpeg(SCAN), seg);
    expect(Array.from(merged.slice(2, 4))).toEqual([0xff, 0xe1]);
  });

  it('a JPEG without EXIF has nothing to carry', () => {
    expect(readExifSegment(jpeg(APP0, SCAN))).toBeNull();
  });

  it('a file that is not a JPEG (PNG, HEIC) has nothing to carry', () => {
    expect(readExifSegment(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(insertExifSegment(Uint8Array.from([0, 0, 0, 0x24, 0x66, 0x74, 0x79, 0x70]), new Uint8Array(4))).toBeNull();
  });

  it('a truncated EXIF segment is not guessed at', () => {
    const seg = buildExifSegment({ littleEndian: true });
    const full = jpeg(APP0, seg, SCAN);
    expect(readExifSegment(full.slice(0, 2 + APP0.length + 40))).toBeNull();
  });

  it('unreadable TIFF inside EXIF means no EXIF rather than a sideways photo', () => {
    const seg = buildExifSegment({ littleEndian: true });
    const broken = seg.slice();
    broken[10] = 0x00; // byte order is neither II nor MM
    expect(patchExifForResized(broken, { width: 10, height: 10 })).toBeNull();
    const badIfd = seg.slice();
    new DataView(badIfd.buffer).setUint32(10 + 4, 5000, true); // IFD0 points outside
    expect(patchExifForResized(badIfd, { width: 10, height: 10 })).toBeNull();
  });
});
