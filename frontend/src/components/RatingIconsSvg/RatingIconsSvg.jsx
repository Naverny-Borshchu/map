import { ReactComponent as IconStarFull } from './icon_soup.svg';
import { ReactComponent as IconStarEmpty } from './icon_soup_light.svg';

export const RatingIconsSvg = ({
  overall_rating = 0,
  max = 10,
  size = 18,
  FullIcon = IconStarFull,
  EmptyIcon = IconStarEmpty,
}) => {
  // parseFloat('—') = NaN → Array(NaN) кидає Invalid array length і валить сторінку
  // (борщі без оцінок мають overall_rating = '—')
  const parsed = parseFloat(overall_rating);
  const rating = isNaN(parsed) ? 0 : Math.round(parsed);
  const fullCount = Math.max(Math.min(rating, max), 0);
  const emptyCount = Math.max(max - fullCount, 0);

  const iconStyle = {
    width: `${size}px`,
    height: `${size}px`,
  };

  return (
    <div style={{ display: 'flex', gap: '4px' }}>
      {[...Array(fullCount)].map((_, i) => (
        <FullIcon key={`full-${i}`} style={iconStyle} />
      ))}
      {[...Array(emptyCount)].map((_, i) => (
        <EmptyIcon key={`empty-${i}`} style={iconStyle} />
      ))}
    </div>
  );
};
