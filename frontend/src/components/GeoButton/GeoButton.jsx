
import { useState, useEffect } from "react";
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

const API_KEY=process.env.REACT_APP_API_KEY_MAP;

export const GeoButton = () => {
  const [geoMessage, setGeoMessage] = useState(null);
  const [showCitySelect, setShowCitySelect] = useState(false);
  const {updateCity,updateCenter,focusMap} = useFilters();
  const { places } = usePlaces();
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

  const getCityFromCoords = async (lat, lng) => {
  try {
    const response = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&language=uk&key=${API_KEY}`
    );

    const data = await response.json();

    if (!data.results || !data.results.length) {
      return null;
    }

    for (const result of data.results) {
      for (const component of result.address_components) {
        if (
          component.types.includes('locality') ||
          component.types.includes('postal_town') ||
          component.types.includes('administrative_area_level_2') ||
          component.types.includes('administrative_area_level_1')
        ) {
          return component.long_name;
        }
      }
    }

    return null;
  } catch (error) {
    console.error('GEOCODER ERROR:', error);
    return null;
  }
};

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

      const city = await getCityFromCoords(coords.lat, coords.lng);
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
      const zoom = zoomToShowNearest(coords, places, {
        width: window.innerWidth,
        height: window.innerHeight,
      });
      if (zoom !== null) focusMap(coords.lat, coords.lng, zoom);
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
