import { useMemo } from 'react';
import { qrMatrix, qrPath } from '../../utils/qr';

const MARGIN = 4;

/**
 * The table's QR code as an SVG drawn on the device: beet on white, with the
 * quiet zone a scanner needs. crispEdges keeps the modules sharp at any size,
 * on a phone held up across the table or on a projector.
 */
export const TableQr = ({ link, label, className = '' }) => {
  const matrix = useMemo(() => qrMatrix(link), [link]);
  if (!matrix) return null;
  const n = matrix.size + MARGIN * 2;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${n} ${n}`}
      role="img"
      aria-label={label}
      shapeRendering="crispEdges"
      data-testid="table-qr"
      data-link={link}
    >
      <rect width={n} height={n} fill="#FFFFFF" />
      <path d={qrPath(matrix, MARGIN)} fill="#860130" />
    </svg>
  );
};
