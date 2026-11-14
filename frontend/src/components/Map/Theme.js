// Google map style in the Naverny Borshchu identity (11.2026): cream land,
// white roads with sour-cream casings, highways in sour cream, a dill-tinted
// park and a quiet water tone. No red on the map itself: the bowl pins are
// the red, and nothing else competes with them.
// All POI icons and labels are hidden except park fills and rail/metro
// station names, kept as quiet text for orientation.
export const defaultTheme = [
  { elementType: 'geometry', stylers: [{ color: '#fbf2e8' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#7f6863' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fffaf5' }] },
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#ecd3c6' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#a08883' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#5c4744' }] },

  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#f6ead9' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#fbf2e8' }] },

  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ visibility: 'on' }, { color: '#e4ecd3' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#f1dfd2' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#9a827c' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#a8918b' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#fde5ce' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#f5cfb2' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#86615a' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#fbd9bd' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.stroke', stylers: [{ color: '#f1c3a2' }] },

  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.text.fill', stylers: [{ color: '#9a827c' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#d2dfdf' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#7c9496' }] },
];
