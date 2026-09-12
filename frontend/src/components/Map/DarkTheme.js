// Night styling for the Google map, matching the app's dark palette.
// Kept compact: geometry + labels + the noisier feature classes.
// POI/transit hiding rules mirror Theme.js: parks fill-only, rail/metro
// station names kept as quiet text, everything else off.
export const darkTheme = [
  { elementType: 'geometry', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#1d1d1d' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#9a9a9a' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative', elementType: 'geometry', stylers: [{ color: '#3a3a3a' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#c2c2c2' }] },
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry', stylers: [{ visibility: 'on' }, { color: '#22301f' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#2c2c2c' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8f8f8f' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#343434' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#43413f' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#c2b9a8' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.text.fill', stylers: [{ color: '#8a8a8a' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', elementType: 'geometry', stylers: [{ color: '#12232b' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#4c6b78' }] },
];
