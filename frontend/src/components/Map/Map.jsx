import React, { useCallback, useMemo, useState, useRef, useEffect } from "react";
import { GoogleMap, MarkerClustererF, MarkerF } from "@react-google-maps/api";
import { defaultTheme } from "./Theme";
import { darkTheme } from "./DarkTheme";
import { getTheme, onThemeChange } from "../../theme";
import { resolveVenueAtTap } from "../../services/placesLookup";
import { CurrentLocationMarker } from "../CurrentLocationMarker/CurrentLocationMarker";
import { Modal } from "../Modal/Modal";
import { Gallery } from "../Gallery/Gallary";
import { useBorsch } from "../../context/BorschContext";
import { usePlaces } from "../../context/PlacesContext";
import { useFilters } from "../../context/FiltersContext";
import { AddBorsch } from "../AddBorsch/AddBorsch";
import { useMediaQuery } from "../../hook/useMediaQuery";
import { hasFullscreenMap } from "../../variant";
import { clusterCircleSvg, countCircleIcon, tipPinIcon } from "./markerIcons";
import { useMapTips } from "../../hook/useMapTips";
import { tipPoint } from "../../api/tips";
import { TipSheet } from "../TipSheet";
import { venueLabel as rawVenueLabel } from "../../i18n/venueNames";
import { useI18n } from "../../i18n";
import { cityCenter } from "../../utils/cityCenter";
import { coordsOf, focusPlan, viewBounds } from "../../utils/mapZoom";
import style from "./Map.module.scss";


const containerStyle = { width: "100%", height: "100%" };

const MIN_ZOOM = 6;
const MAX_ZOOM = 18;
// At this zoom or lower the map shows aggregate per-city markers
// (borsch count per city) instead of individual places
const CITY_MARKERS_MAX_ZOOM = 9;
// Zoom applied after the user picks a city via its aggregate marker
const CITY_FOCUS_ZOOM = 12;

const defoultOptions = {
  gestureHandling: "greedy", 
  zoomControl: true,
  mapTypeControl: false,
  scaleControl: false,
  streetViewControl: false,
  rotateControl: false,
  clickableIcons: false,
  keyboardShortcuts: false,
  scrollwheel: true,
  disableDoubleClickZoom: false,
  fullscreenControl: false,
  styles: defaultTheme,
  minZoom: MIN_ZOOM,
  maxZoom: MAX_ZOOM,
};

export const MODES = {
  MOVE: 0,
  SET_MARKER: 1,
};

// the last focusMap() target a map has applied (see the mapTarget effect); module level, so it outlives a remount
let appliedTargetNonce = 0;
// Where the last map ended (centre and zoom, saved on every idle). The desktop split creates a new map on every
// list <-> card switch and a phone on every tab switch; the new one opens exactly here (21.11.2026). Before this a
// new map only looked right because it re-applied the last focusMap target, which also undid the visitor's own pans.
let lastView = null;

export const Map = ({ center, mode, places, onMarkerAdd, pickedPlace = null }) => {
  const [isActiveAbout, setIsActiveAbout] = useState(false);
  const [isActiveAddForm, setIsActiveAddForm] = useState(false);
  const [newMarker, setIsNewMarker] = useState(null);
  const [place, setIsPlace] = useState(null);
  const [newMarkerData, setNewMarkerData] = useState(null);
  // Everything Google knows within a few dozen metres of the tap. The sheet
  // shows them as a list: picking one blindly is how "Гільда" ended up on a
  // borsch served by the restaurant that replaced it.
  const [candidates, setCandidates] = useState([]);

  const { getAveragePlaceRating, getPlaceExploration, getBorschByPlaceId } = useBorsch();
  const { t, lang, cityLabel } = useI18n();
  // «Кажуть, тут є Борщ»: the tip a grey bowl opened
  const [openTip, setOpenTip] = useState(null);
  const { selectedPlaceId, cities, allPlaces, getPlaceById } = usePlaces();
  const { updateCity, updateCenter, mapTarget, focusMap } = useFilters();

  const mapRef = useRef(null);
  const canvasRef = useRef(null);
  const [startView] = useState(() => lastView);
  const [zoomLevel, setZoomLevel] = useState(() => (startView && startView.zoom) || 16);
  // the previous view until something sets a new centre (a selected place, a city, «near me»)
  const mountCenter = useRef(center);
  const shownCenter = startView && center === mountCenter.current ? startView.center : center;

  const isDesktop = useMediaQuery("(min-width: 1280px)");

  // follow the time-of-day theme so the map does not glare at night
  const [theme, setTheme] = useState(getTheme());
  useEffect(() => onThemeChange(setTheme), []);

  // Full-screen variants drop the +/- buttons on mobile: native Google Maps has
  // none there, and they would sit right under the floating view toggle.
  const mapOptions = useMemo(() => {
    const base = {
      ...defoultOptions,
      styles: theme === 'dark' ? darkTheme : defaultTheme,
    };
    // In add mode Google's own restaurant/cafe icons become the target: tapping
    // one is how you say "this place", and it is what makes the map useful here.
    const withPois = { ...base, clickableIcons: mode === MODES.SET_MARKER };
    return hasFullscreenMap && !isDesktop ? { ...withPois, zoomControl: false } : withPois;
  }, [isDesktop, theme, mode]);

  // Show the selected place: a row picked in the list, the quest chip, and since 21.11.2026 the borshch card
  // open beside the map on desktop (useShowOnMap). Andrii: a card for Gudauri next to a map of Kyiv, «I would
  // like to show on map because it shows in general Kyiv in many cases». Three things that kept it from working:
  //  - the place was looked up in the FILTERED list, so a venue hidden by a filter could not be shown; now ALL places;
  //  - before the map exists nothing happened, and the desktop split creates a new map on every route change
  //    (list ↔ card), so a card opened from the list never moved it; now the new map starts right there;
  //  - re-running on every filter change pulled the map back to the selection; now only a new selection moves it.
  // It moves only when the pin is off screen and zooms in only from far out (focusPlan, utils/mapZoom).
  useEffect(() => {
    if (!selectedPlaceId) return undefined;
    const target = coordsOf(getPlaceById(selectedPlaceId));
    if (!target) return undefined;
    const map = mapRef.current;
    const show = (bounds, zoom) => {
      const plan = focusPlan({ target, bounds, zoom });
      if (plan.move) {
        updateCenter(target);
        if (map) map.panTo(target);
      }
      if (plan.zoom) {
        setZoomLevel(plan.zoom);
        if (map) map.setZoom(plan.zoom);
      }
    };
    if (map && map.getBounds()) {
      show(map.getBounds(), map.getZoom());
      return undefined;
    }
    const events = window.google && window.google.maps && window.google.maps.event;
    if (map && events) {   // created, not drawn yet: its first idle has the real bounds
      const once = events.addListenerOnce(map, 'idle', () => show(map.getBounds(), map.getZoom()));
      return () => events.removeListener(once);
    }
    // No map yet (the desktop split is creating a new one): judge against the view it is about to open with, so
    // a pin already in sight keeps the view and one off screen opens the map right there, without a jump.
    const box = canvasRef.current ? canvasRef.current.getBoundingClientRect() : null;
    show(startView ? viewBounds(startView.center, startView.zoom, box) : null, startView ? startView.zoom : zoomLevel);
    return undefined;
    // getPlaceById reads the full set through a ref; allPlaces is here so a deep link re-runs once places arrive
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedPlaceId, allPlaces]);

  // Recentre (and optionally zoom) when something asks to focus the map —
  // e.g. picking a city from the sheet. updateCenter keeps the controlled
  // center prop in step; panTo/setZoom drive the live map imperatively.
  // One-shot for real (21.11.2026): mapTarget stays in the context, and the desktop split creates a new map on
  // every route change (list <-> card), so every new map re-applied the LAST city pick / «nearby» / quest target
  // and pulled the view away from the borshch the card had just shown. A target now applies once per app session;
  // a map created later starts from `center`, which applying it already set.
  useEffect(() => {
    if (!mapTarget || mapTarget.nonce <= appliedTargetNonce) return;
    appliedTargetNonce = mapTarget.nonce;
    const { lat, lng, zoom } = mapTarget;
    updateCenter({ lat, lng });
    if (zoom) setZoomLevel(zoom);
    if (mapRef.current) {
      mapRef.current.panTo({ lat, lng });
      if (zoom) mapRef.current.setZoom(zoom);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTarget]);

  // ----------------------------------------------------
  //  FETCH PLACE DATA
  // ----------------------------------------------------
  // Venue lookup moved to services/placesLookup: the map, the search field
  // and the nearby fallback now share one field mask and one language, which
  // is what keeps the three of them naming the same venue the same way.

  // ----------------------------------------------------
  // MAP LOAD
  // ----------------------------------------------------
  const onLoad = useCallback((map) => {
    mapRef.current = map;

    setZoomLevel(map.getZoom());
    // saveCornersToLocalStorage(map);

    // Контроль зума
    map.addListener("zoom_changed", () => {
      let z = map.getZoom();
      if (z < MIN_ZOOM) {
        map.setZoom(MIN_ZOOM);
        z = MIN_ZOOM;
      }
      setZoomLevel(z);
    });
  }, []);

  const onUnmount = () => {
    mapRef.current = null;
  };

  // ----------------------------------------------------
  // ADD MARKER
  // ----------------------------------------------------
  const changeIsActiveAddForm = () => {
    setIsActiveAddForm((p) => !p);
  };

  const onAddMarker = () => {
    onMarkerAdd(newMarker);
    changeIsActiveAddForm();
  };

  const showVenue = useCallback((venue, others = []) => {
    setIsPlace(venue);
    setCandidates(others);
    setNewMarkerData(venue?.address || "Адреса не визначена");
  }, []);

  const onClickMap = useCallback(
    async (loc) => {
      if (mode !== MODES.SET_MARKER) return;

      const lat = loc.latLng.lat();
      const lng = loc.latLng.lng();

      setIsNewMarker({ lat, lng });
      setCandidates([]);
      changeIsActiveAddForm();

      // Google's own info window would fight the sheet for the tap
      if (loc.placeId && loc.stop) loc.stop();

      const { venue, candidates: nearby } = await resolveVenueAtTap({
        placeId: loc.placeId, lat, lng,
      });

      if (venue) {
        showVenue(venue, nearby);
      } else {
        setIsPlace(null);
        setNewMarkerData("Адреса не визначена");
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mode, showVenue]
  );

  // A venue picked from the search field opens the same sheet.
  useEffect(() => {
    if (!pickedPlace) return;
    setIsNewMarker(pickedPlace.location);
    showVenue(pickedPlace);
    setIsActiveAddForm(true);
  }, [pickedPlace, showVenue]);

  // ----------------------------------------------------
  // CLICK MARKER
  // ----------------------------------------------------
  const onClickMarker = (id) => {
    const found = places.find((p) => p.id === id);
    if (found) setIsPlace(found);
    setIsActiveAbout((p) => !p);
  };

  const getAverageOverallRating = (id) => getAveragePlaceRating(id);

  // ----------------------------------------------------
  // CITY AGGREGATE MARKERS (low zoom)
  // ----------------------------------------------------
  // Zoomed far out we show one marker per city (every city in the DB,
  // not only the one selected in filters) with its borsch count
  const showCityMarkers = mode === MODES.MOVE && zoomLevel <= CITY_MARKERS_MAX_ZOOM;

  // ----------------------------------------------------
  // TIPS «тут є Борщ» (grey bowls), read for the view on idle
  // ----------------------------------------------------
  const tipsOn = mode === MODES.MOVE && !showCityMarkers;
  const { tips, onIdle: onIdleTips, replaceTip } = useMapTips({ enabled: tipsOn });
  // zoomed in past the city markers: the view's tips at once, not at the next pan
  useEffect(() => {
    if (tipsOn && mapRef.current) onIdleTips(mapRef.current);
  }, [tipsOn, onIdleTips]);
  // A venue that already has a borshch on the map shows that pin; the tip
  // there says nothing the pin does not. A venue with nothing but a tip shows
  // the grey bowl instead of an empty pin.
  const shownTips = useMemo(
    () => tips.filter((tip) => tipPoint(tip) && !(getBorschByPlaceId(tip.place?.id) || []).length),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tips, getBorschByPlaceId]
  );
  const tipPlaceIds = useMemo(() => new Set(shownTips.map((tip) => String(tip.place.id))), [shownTips]);

  // Clicking a city marker switches the app to that city: the city
  // filter button updates, that city's places load, and the map zooms in
  const onClickCityMarker = useCallback(
    (cityItem) => {
      const target = cityCenter(cityItem);
      updateCity(cityItem.city);
      focusMap(target.lat, target.lng, CITY_FOCUS_ZOOM);
    },
    [updateCity, focusMap]
  );

  // ----------------------------------------------------
  // CLUSTER ICONS
  // ----------------------------------------------------
  // A plain brand-green circle with the count centred inside, instead of the
  // old restaurant glyph with the number pushed off to one side.
  // The clusterer picks a tier by digit count: 1 digit → 2 → 3+.
  const clusterStyles = useMemo(
    () =>
      [38, 46, 56].map((d, i) => ({
        url: clusterCircleSvg(d, theme === 'dark'),
        width: d,
        height: d,
        anchorIcon: [d / 2, d / 2], // centre the circle on the cluster point
        anchorText: [0, 0], // and the count in the middle of the circle
        textColor: "#ffffff",
        textSize: [13, 15, 17][i],
        fontWeight: "700",
        fontFamily: "Roboto, Arial, sans-serif",
      })),
    [theme]
  );

  return (
    <div ref={canvasRef} className={`${style.container} nb-mapcanvas`}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={shownCenter}
        zoom={zoomLevel}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
        onClick={onClickMap}
        onIdle={() => {
          const map = mapRef.current;
          if (map && map.getCenter()) lastView = { center: map.getCenter().toJSON(), zoom: map.getZoom() };
          onIdleTips(map);
        }}
      >
        {/* Low zoom: one marker per city with its total borsch count */}
        {showCityMarkers &&
          cities.map((c) => (
            <MarkerF
              key={c.city}
              position={{ lat: Number(c.lat), lng: Number(c.lng) }}
              icon={countCircleIcon(c.borsch_count ?? 0, 44, theme === 'dark')}
              title={`${cityLabel(c.city)}: ${t('list.count', { count: c.borsch_count ?? 0 })}`}
              onClick={() => onClickCityMarker(c)}
            />
          ))}

        {/* Higher zoom: individual places; the clusterer groups them */}
        {!showCityMarkers && (
        <MarkerClustererF
          key={theme} /* clusterer takes styles at construction — remount on theme flip */
          options={{
            minimumClusterSize: 3,
            gridSize: 50,
            maxZoom: MAX_ZOOM - 1,
            styles: clusterStyles,
          }}
        >
          {(clusterer) =>
            places.filter((p) => !tipPlaceIds.has(String(p.id))).map((p) => (
              <CurrentLocationMarker
                key={p.id}
                position={{"lat":Number(p.latitude),"lng":Number(p.longitude)}}
                id={p.id}
                onClick={onClickMarker}
                grade={getAverageOverallRating(p.id)}
                state={getPlaceExploration(p.id)}
                zIndexBase={zoomLevel}
                zoomLevel={zoomLevel}
                clusterer={clusterer}
                isSelected={String(p.id) === String(selectedPlaceId)}
                /* while placing a pin, taps belong to the map, not the markers */
                clickable={mode !== MODES.SET_MARKER}
                dark={theme === 'dark'}
              />
            ))
          }
        </MarkerClustererF>
        )}

        {/* «Кажуть, тут є Борщ»: grey, round and outside the clusterer, so a
            tip is never counted into a red bubble of rated borshch */}
        {tipsOn && shownTips.map((tip) => (
          <MarkerF
            key={`tip-${tip.id}`}
            position={tipPoint(tip)}
            icon={tipPinIcon({
              size: zoomLevel >= 15 ? 36 : 32,
              confirmed: tip.status === 'confirmed',
              selected: openTip?.id === tip.id,
              dark: theme === 'dark',
            })}
            zIndex={1}
            title={t('tip.markerTitle', { venue: rawVenueLabel(tip.place?.name || '', lang) })}
            onClick={() => setOpenTip(tip)}
          />
        ))}

        {openTip && (
          <Modal onClose={() => setOpenTip(null)}>
            <TipSheet
              tip={openTip}
              onClose={() => setOpenTip(null)}
              onChanged={replaceTip}
            />
          </Modal>
        )}

        {isActiveAbout && (
          <Modal onClose={onClickMarker}>
            <Gallery
              onClose={onClickMarker}
              id_place={place.id}
              place={place}
            />
          </Modal>
        )}

        {isActiveAddForm && (
          <Modal onClose={changeIsActiveAddForm}>
            <AddBorsch
              onClick={onAddMarker}
              placeData={newMarkerData}
              onClose={changeIsActiveAddForm}
              place={place}
              candidates={candidates}
              onPickCandidate={(venue) => showVenue(venue, candidates)}
            />
          </Modal>
        )}
      </GoogleMap>
    </div>
  );
};
