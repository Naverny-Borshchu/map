import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../components/Button";
import { ButtonVertion } from "../../components/ButtonVersion";
import { IconClose } from "../Icons";
import { BowlLoader } from '../EmptyState';
import style from './AddBorsch.module.scss';
import { useT } from '../../i18n';
import { useFilters } from '../../context/FiltersContext';
import { guessCountryFromAddress } from '../../utils/currency';

const API_KEY = process.env.REACT_APP_API_KEY_MAP;

// Будуємо посилання на фото (Places API v1)
const getPhotoUrl = (photo, maxWidth = 600) =>
  photo?.name
    ? `https://places.googleapis.com/v1/${photo.name}/media?key=${API_KEY}&maxWidthPx=${maxWidth}`
    : "";

export const AddBorsch = ({ onClose, placeData, place, candidates = [], onPickCandidate }) => {
  const t = useT();
  // whatever city the map is showing — the last honest answer when Google's
  // formatted address does not name one
  const { city: currentCity } = useFilters();
  const [street, setStreet] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [closeTime, setCloseTime] = useState("");
  const [close, setClose] = useState("");
  const [open, setOpen] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();


  useEffect(() => {
    if (place?.hours) {
      setClose(place.hours.openNow ? t('add.openNow') : t('add.closedNow'));
      setOpen(place.hours.openNow ? t('add.willClose') : t('add.willOpen'));
    }
    if (place?.hours?.nextCloseTime) {
      const date = new Date(place.hours.nextCloseTime);
      const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      setCloseTime(time);
    }
    if (place?.hours?.nextOpenTime) {
      const date = new Date(place.hours.nextOpenTime);
      const time = date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
      setCloseTime(time);
    }
  }, [place, t]);

  useEffect(() => {
    if (!placeData) return;

    setLoading(true);
    const timer = setTimeout(() => {
      // Google formats addresses as "street, number, city, postcode, country"
      // — but drops pieces when it does not know them, and the old
      // "city = parts[2]" then filed a borsch under the postal code, or under
      // nothing at all. An empty city is a 400 from the backend, so read the
      // address from the end and fall back to the city being browsed.
      const parts = placeData.split(",").map((x) => x.trim()).filter(Boolean);
      const meaningful = parts.filter(
        (x) => !/^\d{4,6}$/.test(x) && !/^(Україна|Ukraine)$/i.test(x)
      );
      const guessedCity = meaningful.length > 1 ? meaningful[meaningful.length - 1] : "";
      const guessedStreet = meaningful.length > 1
        ? meaningful.slice(0, -1).join(", ")
        : meaningful[0] || "";

      setStreet(guessedStreet);
      // Google's own label first. Reading the city off the tail of the address
      // only ever worked because "Україна" was special-cased out of it: for any
      // other country that tail *is* the country, which is how the first Berlin
      // venue was stored with city "Німеччина". The string parse stays as the
      // fallback for addresses Google did not label, then the city being browsed.
      setCity(place?.city || guessedCity || currentCity || "");
      // Best-effort only — drives the price-chip currency guess downstream,
      // never a required field, so an empty guess is fine.
      setCountry(place?.country || guessCountryFromAddress(placeData));
      setLoading(false);
    }, 0);

    return () => clearTimeout(timer);
  }, [placeData, currentCity, place?.city, place?.country]);

  const handleClose = () => {
    setStreet("");
    setCity("");
    setCountry("");
    setLoading(true);
    onClose();
  };

  const handleSelect = () => {
    navigate("/add-borsch/select-place", {
      state: {
        street,
        city,
        country,
        place
      },
    });
  };

  const photos = Array.isArray(place?.photos) ? place.photos.slice(0, 2) : [];
  // Everything else Google found around that tap. Offering them is the
  // difference between "we picked one for you" and "which of these is it?"
  const others = (candidates || []).filter((c) => c && c.id !== place?.id);

  return (
    <div className={style.container}>
      <div className={style.card}>
        <div className={style.boxClose}>
          <ButtonVertion type="button" onClick={handleClose} icon={IconClose} label={t('card.close')} />
        </div>

        <div className={style.boxContext}>
          {loading ? (
            <div className={style.loading}><BowlLoader size={44} label={t('rate.loading')} /></div>
          ) : (
            <div className={style.boxAddress}>
              <p className={style.kicker}>{t('add.kicker')}</p>
              <p className={style.name}>{place?.name}</p>
              {place?.type && <p className={style.type}>{String(place.type).replace(/_/g, ' ')}</p>}
              <p className={style.street}>{[street, city].filter(Boolean).join(', ')}</p>

              {close && (
                <div className={style.box_time}>
                  <p className={`${style.time} ${place?.hours?.openNow ? style.open : style.shut}`}>{close}</p>
                  {closeTime && <span className={style.close}>{open} {closeTime}</span>}
                </div>
              )}


              {photos.length > 0 && (
                <div className={style.photos}>
                  {photos.map((ph, idx) => {
                    const src = getPhotoUrl(ph, 800); 
                    return (
                      <img
                        key={ph.name || idx}
                        src={src}
                        alt={`${place?.name || ""} ${idx + 1}`}
                        className={style.photo}
                        loading="lazy"
                      />
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {others.length > 0 && (
            <div className={style.others}>
              <p className={style.othersTitle}>{t('add.otherNearby')}</p>
              <div className={style.othersList}>
                {others.slice(0, 5).map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={style.otherBtn}
                    onClick={() => onPickCandidate && onPickCandidate(c)}
                  >
                    <span className={style.otherName}>{c.name}</span>
                    {c.address && <span className={style.otherAddr}>{c.address}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            type="button"
            name={t('add.pickPlace')}
            onClick={handleSelect}
            disabled={loading}
          />
        </div>
      </div>
    </div>
  );
};
