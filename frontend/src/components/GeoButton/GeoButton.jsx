
import { useState, useEffect, useRef } from "react";
import { hasSeenIntro, REQUEST_LOCATION_EVENT } from "../Onboarding";
import { ReactComponent as IconGeoActive } from './geoActive.svg';
import { Modal } from '../Modal/Modal';
import { ButtonVertion } from "../../components/ButtonVersion";
import { ReactComponent as IconClose } from './close.svg';
import { useFilters } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { CitySelect } from '../CitySelect/CitySelect';
import style from './GeoButton.module.scss';
import { useT } from '../../i18n';
import { publishLocation } from '../../utils/distance';
import { zoomToShowNearest } from '../../utils/mapZoom';
import { reverseGeocodeCity } from '../../services/geocode';

/**
 * The box the zoom has to fit a venue into: the rendered map, not the window.
 *
 * On desktop the map is roughly half the window wide, because the list sits
 * beside it, so `window.innerWidth/innerHeight` overstates the room available.
 * It happens not to change the answer at the distances measured so far — both
 * give zoom 12 for a venue 9 km out — but the map is the box actually being
 * filled, and the two diverge as the aspect ratio does.
 *
 * Falls back to the window when the map has not mounted yet: this flow can run
 * on first load, before Google's canvas exists.
 */
const mapViewport = () => {
  const rect = document.querySelector('.gm-style')?.getBoundingClientRect();
  return rect && rect.width > 0 && rect.height > 0
    ? { width: rect.width, height: rect.height }
    : { width: window.innerWidth, height: window.innerHeight };
};

export const GeoButton = () => {
  const [geoMessage, setGeoMessage] = useState(null);
  const [showCitySelect, setShowCitySelect] = useState(false);
  const {updateCity,updateCenter,focusMap} = useFilters();
  const { places } = usePlaces();
  // A position that arrived before the venues did, still waiting to be framed.
  const pendingFrame = useRef(null);

  // The venues have landed: frame the position we could not frame earlier.
  // Runs at most once per position — the ref is cleared as it fires — so it
  // cannot fight the visitor for control of the map afterwards.
  useEffect(() => {
    const coords = pendingFrame.current;
    if (!coords || !places || places.length === 0) return;
    const zoom = zoomToShowNearest(coords, places, mapViewport());
    if (zoom === null) return;
    pendingFrame.current = null;
    focusMap(coords.lat, coords.lng, zoom);
  }, [places, focusMap]);
  const t = useT();
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  // Ask for location — but never before the user knows what this app is.
  // On a first run the intro owns the moment and fires nb:request-location
  // when its button is pressed; on later visits we resume asking on mount.
  useEffect(() => {
    const ask = () => {
      const hasCoords = !!localStorage.getItem("user_location");
      const refusal = !!localStorage.getItem("refusal");
      if (!hasCoords && !refusal) runGeolocation(isMobile);
    };

    if (hasSeenIntro()) ask();

    window.addEventListener(REQUEST_LOCATION_EVENT, ask);
    return () => window.removeEventListener(REQUEST_LOCATION_EVENT, ask);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runGeolocation = (useNative = false) => {
    if (!navigator.geolocation) {
      setGeoMessage({
        title: t('geo.failedTitle'),
        sub_title: t('geo.hintBrowser'),
        type: "error",
      });
      localStorage.setItem("refusal", "true");
      return;
    }

    const onSuccess = async (position) => {
      const coords = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
      };
      updateCenter(coords)

      const city = await reverseGeocodeCity(coords.lat, coords.lng);
      publishLocation(coords);
      localStorage.setItem("город", city)
      localStorage.removeItem("refusal");

      setGeoMessage(null);
      updateCity(city || 'Київ');

      // Recentring alone left the zoom wherever it was, so someone two
      // kilometres from the nearest bowl got their own empty neighbourhood and
      // the button looked broken. Pull back just far enough to include the
      // closest venue — same updateCity-then-focusMap order the city markers
      // already use, so the city change does not move the map afterwards.
      const zoom = zoomToShowNearest(coords, places, mapViewport());
      if (zoom !== null) focusMap(coords.lat, coords.lng, zoom);
      // On a first visit this whole flow runs from the mount effect, while the
      // venues are still loading — `places` is empty, there is no nearest one
      // to frame, and the map would just sit on the visitor with no pins in
      // sight, which is the complaint this was meant to fix. Remember the
      // position and frame it the moment the venues arrive.
      else pendingFrame.current = coords;
    };

    const onFinalError = async (error) => {
      console.error("Геолокація не визначена:", error);

      // Зʼясовуємо реальний стан дозволу, щоб показати влучну підказку
      let permissionState = null;
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: "geolocation" });
          permissionState = status.state; // granted | prompt | denied
        }
      } catch (_) { /* Permissions API недоступний — ігноруємо */ }

      const code = error && error.code;
      let title = t('geo.failedTitle');
      let sub_title = t('geo.hintBrowser');

      if (code === 1 || permissionState === "denied") {
        title = t('geo.blockedTitle');
        sub_title = isMobile
          ? "Дозвольте геодані для цього сайту: натисніть іконку замка біля адреси → Дозволи → Геодані. Якщо сайт відкрито всередині іншого застосунку (Telegram тощо) — відкрийте його в Chrome/Safari."
          : "Дозвольте геодані для цього сайту в налаштуваннях браузера (іконка замка біля адреси).";
      } else if (code === 3) {
        title = t('geo.failedTimeout');
        sub_title = t('geo.hintTimeout');
      } else if (code === 2) {
        title = t('geo.unavailable');
        sub_title = t('geo.hintUnavailable');
      }

      setGeoMessage({
        title,
        sub_title: `${sub_title} (код: ${code != null ? code : "?"}${permissionState ? ", дозвіл: " + permissionState : ""})`,
        type: "error",
      });
      localStorage.removeItem("user_location");
      // Запамʼятовуємо відмову лише коли юзер реально заборонив доступ,
      // інакше (немає сигналу GPS / таймаут) пробуємо знову при наступному запуску
      if (error && error.code === 1) {
        localStorage.setItem("refusal", "true");
      }
    };

    // Перша спроба: точна геолокація (GPS на мобільних), але з таймаутом,
    // бо на Android без таймауту запит може висіти/падати у приміщенні.
    navigator.geolocation.getCurrentPosition(
      onSuccess,
      (error) => {
        if (error && error.code === 1) {
          // доступ заборонено — повторювати немає сенсу
          onFinalError(error);
          return;
        }
        // Fallback: низька точність (мережева локація) — для міста достатньо
        navigator.geolocation.getCurrentPosition(onSuccess, onFinalError, {
          enableHighAccuracy: false,
          timeout: 15000,
          maximumAge: 300000,
        });
      },
      {
        enableHighAccuracy: !!useNative,
        timeout: 10000,
        maximumAge: 60000,
      }
    );
  };

  const closeMessage = () =>{
    setGeoMessage(null);
    localStorage.setItem("refusal", "true");
  }

  // Open city picker as manual fallback when geolocation is unavailable/denied
  const openManualCityPicker = () => {
    setGeoMessage(null);
    setShowCitySelect(true);
  };

  return (
    <div className={`nb-geo ${style.container || ''}`.trim()}>
      <button type="button" className={style.btnGeo} onClick={() => runGeolocation(isMobile)}>
        <IconGeoActive  />
        <span className={style.btnGeoText}>{t('map.nearby')}</span>
      </button>

      {geoMessage && (
        <Modal onClose={closeMessage}>
          <div className={`${style.geoMessage}`}>
            <div className={style.btnClose}>
              <ButtonVertion type="button" onClick={closeMessage} icon={IconClose} label={t('card.close')} />
            </div>
            <h4 className={style.error_title}>{geoMessage.title}</h4>
            <span className={style.error_sub_titl}>{geoMessage.sub_title}</span>
            <button
              type="button"
              className={style.manualBtn}
              onClick={openManualCityPicker}
            >
              {t('geo.pickCity')}
            </button>
          </div>
        </Modal>
      )}

      {showCitySelect && (
        <Modal onClose={() => setShowCitySelect(false)} version={"filters"}>
          <CitySelect onClose={() => setShowCitySelect(false)} />
        </Modal>
      )}
    </div>
  );
};
