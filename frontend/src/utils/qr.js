import qrcode from 'qrcode-generator';

/**
 * A QR code for a table link, made on the device (no request to anyone).
 * Error correction M: a printed code survives a soup stain on a few percent
 * of it, and the code stays small enough to scan from across a table.
 *
 * Returns { size, dark(row, col) } or null for an empty text.
 */
export const qrMatrix = (text) => {
  if (!text) return null;
  const qr = qrcode(0, 'M');
  qr.addData(String(text));
  qr.make();
  const size = qr.getModuleCount();
  return { size, dark: (r, c) => qr.isDark(r, c) };
};

/**
 * One SVG path for all dark modules, a 1×1 square each, in module units; the
 * caller sets the viewBox with the quiet zone around it. Runs of dark modules
 * on a row become one rectangle, which keeps the path short.
 */
export const qrPath = (matrix, margin = 4) => {
  if (!matrix) return '';
  const parts = [];
  for (let r = 0; r < matrix.size; r += 1) {
    let c = 0;
    while (c < matrix.size) {
      if (!matrix.dark(r, c)) { c += 1; continue; }
      const start = c;
      while (c < matrix.size && matrix.dark(r, c)) c += 1;
      parts.push(`M${start + margin} ${r + margin}h${c - start}v1h${start - c}z`);
    }
  }
  return parts.join('');
};
