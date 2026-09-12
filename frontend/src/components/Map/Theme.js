// Light styling for the Google map, tuned to the app's design system:
// primary green #638758, beet accent #A71E5B, light surfaces #F8F8F8 / #F2F2F2.
// The map is a calm neutral backdrop — beet-and-white marker pins own the scene.
// All POI icons/labels are hidden except parks (fill only, no labels) and
// rail/metro station names (quiet grey text) kept for orientation.
export const defaultTheme = [
  // Base surfaces: warm neutral, close to the app's #F2F2F2 surface tone
  { elementType: 'geometry', stylers: [{ color: '#f2f0ec' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#6f6a62' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#fafaf8' }] },
  // No pictogram icons anywhere — pins are the only iconography on the map
  { elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Administrative: hairline neutral borders, darker city names for orientation
  { featureType: 'administrative', elementType: 'geometry.stroke', stylers: [{ color: '#d9d4cb' }] },
  { featureType: 'administrative.land_parcel', stylers: [{ visibility: 'off' }] },
  { featureType: 'administrative.neighborhood', elementType: 'labels.text.fill', stylers: [{ color: '#8f8a82' }] },
  { featureType: 'administrative.locality', elementType: 'labels.text.fill', stylers: [{ color: '#57534c' }] },

  // Landscape: barely-there variation so blocks don't merge into one slab
  { featureType: 'landscape.natural', elementType: 'geometry', stylers: [{ color: '#eceae3' }] },
  { featureType: 'landscape.man_made', elementType: 'geometry', stylers: [{ color: '#f2f0ec' }] },

  // POI: everything off (attraction, business, government, medical,
  // place_of_worship, school, sports_complex — icons, labels and geometry)…
  { featureType: 'poi', stylers: [{ visibility: 'off' }] },
  // …except parks: quiet brand-tinted fill (light #638758), no labels, no icons
  { featureType: 'poi.park', elementType: 'geometry.fill', stylers: [{ visibility: 'on' }, { color: '#dbe4d0' }] },
  { featureType: 'poi.park', elementType: 'labels', stylers: [{ visibility: 'off' }] },

  // Roads: white ribbons with thin warm-grey casings, grey (not black) names
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  { featureType: 'road', elementType: 'geometry.stroke', stylers: [{ color: '#e6e2da' }] },
  { featureType: 'road', elementType: 'labels.text.fill', stylers: [{ color: '#8a857c' }] },
  { featureType: 'road.local', elementType: 'labels.text.fill', stylers: [{ color: '#9d978d' }] },
  { featureType: 'road.arterial', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
  // Highways: soft sand instead of Google's orange/yellow — visible, not loud
  { featureType: 'road.highway', elementType: 'geometry', stylers: [{ color: '#f6eedd' }] },
  { featureType: 'road.highway', elementType: 'geometry.stroke', stylers: [{ color: '#e8dfc9' }] },
  { featureType: 'road.highway', elementType: 'labels.text.fill', stylers: [{ color: '#7d766b' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry', stylers: [{ color: '#f0e6d0' }] },
  { featureType: 'road.highway.controlled_access', elementType: 'geometry.stroke', stylers: [{ color: '#e3d8bf' }] },

  // Transit: all off; only rail/metro station names stay as quiet grey text
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.text', stylers: [{ visibility: 'on' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.text.fill', stylers: [{ color: '#8b95a1' }] },
  { featureType: 'transit.station.rail', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },

  // Water: desaturated cool grey-blue — reads as water, doesn't glow
  { featureType: 'water', elementType: 'geometry.fill', stylers: [{ color: '#c9d9de' }] },
  { featureType: 'water', elementType: 'labels.text.fill', stylers: [{ color: '#84979e' }] },
];
