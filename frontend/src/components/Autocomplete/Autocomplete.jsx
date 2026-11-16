import { useEffect, useMemo, useState } from "react";
import usePlacesAutocomplete, {getGeocode,getLatLng} from "use-places-autocomplete";
import useOnclickOutside from "react-cool-onclickoutside";
import { fetchPlaceById } from "../../services/placesLookup";
import { abroadInCyrillic, fetchVenueSuggestions } from "../../services/googlePlaces";
import style from './Autocomplete.module.css';
import { useT } from '../../i18n';

/**
 * The search box on the add-a-borsch map.
 *
 * It used to ask which CITY you were adding in — a leftover from when the map
 * only showed a handful of cities — and then left you to guess where on the map
 * the restaurant actually was. The same field now takes the venue's name: pick
 * one and the flow continues with that venue. Typing a city still works and
 * still just moves the map, because sometimes that is what you want.
 */
export const Autocomplete =({isLoaded,onSelect,onPickPlace,center})=>{
    const t = useT();
      // google.maps only exists once the script has loaded, so build this lazily
      const bias = useMemo(() => {
        if (!isLoaded || !center?.lat || !window.google?.maps) return {};
        return {
          location: new window.google.maps.LatLng(center.lat, center.lng),
          radius: 30000,
        };
      }, [isLoaded, center?.lat, center?.lng]);

    const {
        ready,
        value,
        suggestions: { status, data },
        setValue,
        init,
        clearSuggestions,
      } = usePlacesAutocomplete({
        initOnMount:false,
        debounce: 300,
        // Bias to what is on screen. Without it "Канапа" answered with a
        // village in Savona and four places in Odisha before the Kyiv
        // restaurant the person was standing outside of.
        requestOptions: bias,
      });
      const ref = useOnclickOutside(() => {        
        clearSuggestions();
      });

      // The Maps script speaks the browser's language, and in Ukrainian Google
      // names much of the world with Russian forms (Yokohama spelt the Russian way).
      // A suggestion abroad written in Cyrillic is shown in English instead.
      const [english, setEnglish] = useState({ text: '', byId: {} });
      const asked = status === 'OK' ? data.filter((s) => abroadInCyrillic({
        main: s.structured_formatting?.main_text, secondary: s.structured_formatting?.secondary_text,
      })).length : 0;
      useEffect(() => {
        if (!asked || english.text === value) return undefined;
        let cancelled = false;
        fetchVenueSuggestions(value, { language: 'en', kind: 'any', near: center?.lat ? center : null })
          .then((list) => {
            if (cancelled) return;
            setEnglish({ text: value, byId: Object.fromEntries(list.map((s) => [s.placeId, s])) });
          })
          .catch(() => { if (!cancelled) setEnglish({ text: value, byId: {} }); });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [asked, value]);
    
      const handleInput = (e) => {        
        setValue(e.target.value);
      };
    
      const handleSelect =
        (suggestion) =>
        async () => {
          const { description, place_id: placeId, types = [] } = suggestion;
          // A venue: hand the whole place to the flow, so the next screen is
          // about the place that was typed, not about a pixel on the map.
          const isVenue = types.includes('establishment') || types.includes('point_of_interest');
          if (isVenue && onPickPlace) {
            setValue(description, false);
            clearSuggestions();
            const venue = await fetchPlaceById(placeId);
            if (venue?.location?.lat) {
              onSelect(venue.location);
              onPickPlace(venue);
              return;
            }
          }          
          setValue(description, false);
          clearSuggestions();         
          getGeocode({ address: description }).then((results) => {
            const { lat, lng } = getLatLng(results[0]);
            console.log("📍 Coordinates: ", { lat, lng });
            onSelect({lat, lng})
          });
        };
    
      const renderSuggestions = () =>
        data.map((suggestion) => {
          const {
            place_id,
            structured_formatting: { main_text, secondary_text },
          } = suggestion;
          const russianRisk = abroadInCyrillic({ main: main_text, secondary: secondary_text });
          const twin = russianRisk && english.text === value ? english.byId[place_id] : null;
          // until its English twin is here, a line that may be Russian is not shown
          if (russianRisk && !twin) return null;

          return (
            <li  key={place_id} onClick={handleSelect(suggestion)}>
              <strong>{twin ? twin.main : main_text}</strong> <small>{twin ? twin.secondary : secondary_text}</small>
            </li>
          );
        });
        useEffect(()=>{
            if(isLoaded){
                init()
            }
        },[isLoaded,init])
    
    return(
        <div className={style.container} ref={ref}>
            <input type='text' className={style.input}
            value={value}
            onChange={handleInput}
            disabled={!ready}
            placeholder={t('add.venuePlaceholder')}
            />
            {status === "OK" && <ul className={style.select}>{renderSuggestions()}</ul>}
        </div>
    )
}