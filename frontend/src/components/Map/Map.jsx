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
import { clusterCircleSvg, countCircleIcon } from "./markerIcons";
import { cityCenter } from "../../utils/cityCenter";
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

  const { getAveragePlaceRating, getPlaceExploration } = useBorsch();
  const { selectedPlaceId, cities } = usePlaces();
  const { updateCity, updateCenter, mapTarget, focusMap } = useFilters();

  const mapRef = useRef(null);
  const [zoomLevel, setZoomLevel] = useState(16);

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

  // Pan and zoom to the selected place when selectedPlaceId changes
  useEffect(() => {
    if (!mapRef.current || !selectedPlaceId) return;
    const found = places.find((p) => String(p.id) === String(selectedPlaceId));
    if (found && found.latitude && found.longitude) {
      const target = {
        lat: Number(found.latitude),
        lng: Number(found.longitude),
      };
      mapRef.current.panTo(target);
      // Zoom in if current zoom is too far to see the marker clearly
      const currentZoom = mapRef.current.getZoom();
      if (currentZoom < 15) {
        mapRef.current.setZoom(16);
      }
    }
  }, [selectedPlaceId, places]);

  // Recentre (and optionally zoom) when something asks to focus the map —
  // e.g. picking a city from the sheet. updateCenter keeps the controlled
  // center prop in step; panTo/setZoom drive the live map imperatively.
  useEffect(() => {
    if (!mapTarget) return;
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
    <div className={`${style.container} nb-mapcanvas`}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={zoomLevel}
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={mapOptions}
        onClick={onClickMap}
      >
        {/* Low zoom: one marker per city with its total borsch count */}
        {showCityMarkers &&
          cities.map((c) => (
            <MarkerF
              key={c.city}
              position={{ lat: Number(c.lat), lng: Number(c.lng) }}
              icon={countCircleIcon(c.borsch_count ?? 0, 44, theme === 'dark')}
              title={`${c.city}: ${c.borsch_count ?? ""} борщ(ів)`}
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
            places.map((p) => (
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
