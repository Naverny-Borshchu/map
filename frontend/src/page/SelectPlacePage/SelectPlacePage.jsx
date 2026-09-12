import React, { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { defaultTheme } from "../../components/Map/Theme";
import { Button } from "../../components/Button";
import { BtnNavigate } from "../../components/BtnNavigate/BtnNavigate";
import { useT } from "../../i18n";
import style from "./SelectPlacePage.module.scss";
const containerStyle = {
  width: "100%",
  height: "450px",
};

const defoultOptions = {
  panControl: true,
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
};
const libraries=['places'];
const API_KEY = process.env.REACT_APP_API_KEY_MAP;

export const SelectPlacePage = () => {
  const { state } = useLocation();
  const t = useT();
  // Prefilled from Google, editable by the person who is actually there.
  const [venueName, setVenueName] = useState(state?.place?.name || '');
  const [zoomLevel, setZoomLevel] = useState(17);
  const mapRef = React.useRef(null);
  const navigate = useNavigate();
  const { isLoaded } = useJsApiLoader({
    id: "google-map-script",
    googleMapsApiKey: API_KEY,
    libraries
  });

  const onLoad = useCallback((map) => {
    mapRef.current = map;
    setZoomLevel(map.getZoom());
  }, []);

  const onUnmount = useCallback(() => {
    mapRef.current = null;
  }, []);
  const borschId="123";
  const handleSelect = () => {
    navigate(`/add-borsch/select-place/${borschId}`, {
      state: {
        // the name as confirmed here: Google is often a tenant behind
        place: { ...place, name: (venueName || '').trim() || place.name },
        street,
        city,
        country,
      },
    });
  };
  if (!state) {
    return (
      <div className={style.containerPage}>
        <BtnNavigate />
        <p>Дані відсутні. Поверніться назад і виберіть заклад.</p>
      </div>
    );
  }

  const { street, city, country, place } = state;

  return (
    <div className={style.containerPage}>
      <BtnNavigate />
      <div className={style.container}>
        {/* Editable: Google's answer is sometimes the previous tenant, and the
            person standing in the door knows better than the API does. */}
        <label className={style.card}>
          <span className={style.label}>{t('add.venueName')}</span>
          <input
            className={style.input}
            type="text"
            value={venueName}
            onChange={(e) => setVenueName(e.target.value)}
            maxLength={80}
          />
        </label>
        <div className={style.card}>
          <span className={style.label}>Місто</span>
          <p className={style.value}>{city}</p>
        </div>
        <div className={style.card}>
          <span className={style.label}>Вулиця</span>
          <p className={style.value}>{street}</p>
        </div>
      </div>
      <div className={style.container}>
      {isLoaded ? (
              <GoogleMap
                mapContainerStyle={containerStyle}
                center={place.location}
                zoom={zoomLevel}
                onLoad={onLoad}
                onUnmount={onUnmount}
                options={defoultOptions}
              >
                <Marker
                  position={place.location}
                  icon={{
                    url: `${process.env.PUBLIC_URL}/marker.png`,
                    scaledSize: new window.google.maps.Size(140, 40),
                    labelOrigin: new window.google.maps.Point(90, 20), 
                  }}
                  label={{
                    text:
                      place.name.length > 10
                        ? place.name.slice(0, 12) + " ..."
                        : place.name,
                    color: "#1A1A1A",
                    fontSize: "12px",
                    fontWeight: "bold",
                  }}
                />
              </GoogleMap>
            ) : (
              <p>Завантаження карти...</p>
            )}
            <div className={style.btn}>
              <Button
                type="button"
                name="Підтвердити адресу"
                onClick={handleSelect}
              />
            </div>
          </div>
      </div>      
  );
};
