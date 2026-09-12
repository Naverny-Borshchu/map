import { Marker, Circle } from "@react-google-maps/api";
import { ratingPinIcon } from "../Map/markerIcons";
import { formatGrade } from "../../utils/rating";

/**
 * A place on the map, showing its average borsch grade.
 *
 * The grade is drawn *inside* the SVG pin (see markerIcons.js) rather than as a
 * separate Google Maps label. The old approach placed the label at an x-offset
 * plus a random per-marker jitter, so the number never sat centred in the
 * bubble and wandered between markers; and the bubble itself was an upscaled
 * PNG, so it looked soft. Both are gone now.
 */
export const CurrentLocationMarker = ({
  position,
  onClick,
  id,
  grade,
  zIndexBase = 0,
  zoomLevel = 17,
  clusterer,
  isSelected = false,
  clickable = true,
  dark = false,
  state = 'confirmed',
}) => {
  // Whole scores drop the trailing zero ("8", not "8.0"); halves keep it
  // ("7.5"). The pill is a fixed width with the number centred, so a shorter
  // string still sits dead centre.
  //
  // Only a place nobody has ever rated shows "?" instead of a score. A place
  // rated in the founders' catalogue keeps its number — that was a real
  // tasting — and signals "unconfirmed" through the pin's beet outline.
  const numeric = Number(grade);
  const label = state === 'virgin'
    ? '?'
    : grade !== null && grade !== undefined && grade !== '' && !Number.isNaN(numeric)
      ? formatGrade(numeric)
      : '';

  // Selected marker floats above its siblings; otherwise southern markers
  // stack over northern ones, which is what reads naturally on a map.
  const zIndex = isSelected
    ? 9999999
    : Math.round((position.lat + 90) * 1000) + zIndexBase * 100;

  // Height is fixed per zoom; the pill's width follows the score's own width,
  // so "8" is a noticeably smaller marker than "8.5".
  const height = isSelected ? 54 : zoomLevel >= 17 ? 46 : zoomLevel >= 15 ? 41 : 36;

  const icon = ratingPinIcon(label, { height, selected: isSelected, dark, state });

  return (
    <>
      {isSelected && (
        <Circle
          center={position}
          radius={80}
          options={{
            strokeColor: "#638758",
            strokeOpacity: 0.8,
            strokeWeight: 2,
            fillColor: "#638758",
            fillOpacity: 0.15,
            clickable: false,
            zIndex,
          }}
        />
      )}
      <Marker
        clusterer={clusterer}
        position={position}
        icon={icon}
        zIndex={zIndex}
        clickable={clickable}
        title={
          state === 'virgin'
            ? 'Ніхто ще не куштував — стань Першоваром!'
            : state === 'unverified'
              ? `Оцінка ${label} · спільнота ще не підтвердила`
              : label
                ? `Оцінка ${label}`
                : undefined
        }
        onClick={() => clickable && onClick(id)}
      />
    </>
  );
};
