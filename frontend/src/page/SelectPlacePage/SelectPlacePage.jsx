import React, { useCallback, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";
import { defaultTheme } from "../../components/Map/Theme";
import { Button } from "../../components/Button";
import { PageHeader } from "../../components/PageHeader";
import { EmptyState } from "../../components/EmptyState";
import { ratingPinIcon } from "../../components/Map/markerIcons";
import { useT } from "../../i18n";
import style from "./SelectPlacePage.module.scss";
const containerStyle = {
  width: "100%",
  height: "100%",
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
        <PageHeader back kicker={t('add.kicker')} title={t('add.title')} />
        <EmptyState art="find" title={t('add.noData')} action={{ to: '/add-borsch', label: t('flow.pickPlace') }} />
      </div>
    );
  }

  const { street, city, country, place } = state;

  return (
    <div className={style.containerPage}>
      <PageHeader back kicker={t('add.kicker')} title={t('add.confirmTitle')} />
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
          <span className={style.label}>{t('add.city')}</span>
          <p className={style.value}>{city}</p>
        </div>
        <div className={style.card}>
          <span className={style.label}>{t('add.street')}</span>
          <p className={style.value}>{street}</p>
        </div>
      </div>
      <div className={`${style.container} ${style.mapBlock}`}>
      <div className={style.mapBox}>
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
                  icon={ratingPinIcon('', { height: 54, selected: true })}
                  title={venueName || place.name}
                />
              </GoogleMap>
            ) : (
              <p className={style.mapLoading}>{t('map.loadingMap')}</p>
            )}
      </div>
            <div className={style.btn}>
              <Button
                type="button"
                name={t('add.confirm')}
                onClick={handleSelect}
              />
            </div>
          </div>
      </div>      
  );
};
