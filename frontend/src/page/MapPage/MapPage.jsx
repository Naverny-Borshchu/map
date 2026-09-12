import { useJsApiLoader } from '@react-google-maps/api';
import { useCallback, useState } from 'react';
import {useLocation, useNavigate} from "react-router-dom";
import { Autocomplete } from '../../components/Autocomplete';
import { Map } from '../../components/Map';
import { Filters } from '../../components/Filters/Filters';
import { GeoButton } from "../../components/GeoButton";
import { MODES } from '../../components/Map/Map';
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { useFilters } from '../../context/FiltersContext';
import { useMediaQuery } from "../../hook/useMediaQuery";
import { MapBrandBadge } from '../../components/MapBrandBadge';
import { QuestChip } from '../../components/QuestChip';
import { hasFullscreenMap } from '../../variant';
import style from './MapPage.module.scss';
import { useT } from "../../i18n";

const API_KEY=process.env.REACT_APP_API_KEY_MAP;
const libraries=['places'];

export const MapPage = ( )=> { 
  const isDesktop = useMediaQuery("(min-width: 1280px)");
  const navigate = useNavigate();
  const t = useT();
  const location = useLocation();

  const { places,loading: placesLoading, addPlace } = usePlaces(); 
  const { borsch, loading: borschLoading } = useBorsch();
  const { center, filters, resetAllFilters, updateCenter} = useFilters();
  const placesToShow = places;
  
// console.log(places)
 

  // React.useEffect(() => {
  //   const handleStorageChange = () => {
  //     // const savedLocation = localStorage.getItem('user_location');
  //     // if (savedLocation) {
  //     //   const newLocation = JSON.parse(savedLocation);
  //     //   setOriginalCenter(newLocation);
        
  //     //   if (!filters.search || filters.search.trim() === '') {
  //     //     setCenter(newLocation);
  //     //   }
  //     // }
  //     if (center) {
  //       const newLocation = JSON.parse(savedLocation);
  //       setOriginalCenter(newLocation);
        
  //       if (!filters.search || filters.search.trim() === '') {
  //         setCenter(newLocation);
  //       }
  //     }
  //   };

  //   window.addEventListener('storage', handleStorageChange);
  //   return () => window.removeEventListener('storage', handleStorageChange);
  // }, [filters.search]);
  

  
  
  
  // useEffect(() => {
    
  //   const savedFilteredPlaces = localStorage.getItem('filteredPlaces');
  //   const savedFilters = localStorage.getItem('borschFilters');
    
   
  //   if (savedFilteredPlaces && savedFilters && (!filters.search || filters.search.trim() === '') ) {
  //     try {
  //       const parsedFilters = JSON.parse(savedFilters);
  //       if (parsedFilters.search && parsedFilters.search.trim() !== '') {
  //         return;
  //       }
  //     } catch (error) {
  //       console.error('❌ Ошибка проверки восстановления:', error);
  //     }
  //   }
    
  //   if (filters.search && filters.search.trim() !== '') {
  //     updatePlacesBySearch(filters.search);
  //   } else {
  //     updatePlacesBySearch('');
  //   }
  // }, [filters.search, updatePlacesBySearch]);


  // useEffect(() => {
  //   setRestorePlaces(restoreAllPlaces);
  // }, [setRestorePlaces, restoreAllPlaces]);

  
  // useEffect(() => {    
  //   if (placesLoading) {
  //     return;
  //   }  
    
  //   if (filters.search && filters.search.trim() !== '' && places.length > 0) {
  //     const firstPlaceCenter = getFirstPlaceCenter();
  //     if (firstPlaceCenter) {        
  //       setCenter(firstPlaceCenter);
  //     }
  //   } else if (!filters.search || filters.search.trim() === '') {
     
  //     setCenter(originalCenter);
  //   }
  // }, [places, filters.search, placesLoading, getFirstPlaceCenter, originalCenter]);
  
  // Derive the mode from the route. It used to live in localStorage, so
  // leaving /add-borsch with the browser Back button (not our Cancel) left the
  // map stuck in add mode at '/' — and a refresh kept it that way.
  const mode = location.pathname.startsWith('/add-borsch')
    ? MODES.SET_MARKER
    : MODES.MOVE;
  const { isLoaded } = useJsApiLoader({
    id: 'google-map-script',
    googleMapsApiKey: API_KEY,
    libraries
  })

  const onMarkerAdd=useCallback((coordinates)=>{            
    const newPlace = {
      id: `${coordinates.lat}`,
      adress:"",        
      country:"", 
      city:"",
      name_shopping_mall:"",
      location:coordinates,      
      places:[  
         {place_id:`${coordinates.lat}+1`,
          name:"Кафе",
          type:"ресторан"},           
      ],
      grade:"9.0"
    };
    
    addPlace(newPlace);
  },[addPlace]) 

  // When user picks a location from the autocomplete search box,
  // move the map center there (manual geolocation picker).
  const onPlaceSelect=useCallback((coordinates)=>{
    updateCenter(coordinates);
  },[updateCenter]);

  // …and when what they picked is a venue rather than a city, carry it into the
  // sheet, so the flow continues with that venue instead of asking them to find
  // it on the map again.
  const [pickedPlace, setPickedPlace] = useState(null);
 

  return (        
    <div className={`${style.pageHome} nb-mappage`}>
      {!isDesktop && mode===MODES.SET_MARKER &&
      <>
        {/* Add mode used to look identical to the normal map apart from the
            search placeholder — nothing said a tap was required, and there was
            no way back out. */}
        <div className={style.addHint}>
          <div className={style.addHintText}>
            <strong>{t('add.title')}</strong>
            <span>{t('add.hintVenue')}</span>
          </div>
          <button
            type="button"
            className={style.addHintCancel}
            onClick={() => navigate('/')}
          >
            {t('add.cancel')}
          </button>
        </div>
        <div className={style.boxGeo}>
          <Autocomplete isLoaded={isLoaded} onSelect={onPlaceSelect} onPickPlace={setPickedPlace} center={center}/>
          <GeoButton />
        </div>
      </>
      }
      {isDesktop && mode===MODES.SET_MARKER &&
      <div div className={style.boxGeoDesctop}>
        <Autocomplete isLoaded={isLoaded} onSelect={onPlaceSelect} onPickPlace={setPickedPlace} center={center}/>
      </div>      
      }
      {mode===MODES.MOVE &&
      <>
        {/* On desktop the Layout header already renders Filters with the
            filter/rating buttons — avoid a duplicate set over the map */}
        {!isDesktop && <Filters/>}
        {/* The Мапа | Список segmented control used to float here. It has moved
            into the bottom nav as a single tab that swaps the two views, so the
            map keeps the width and there is one obvious place to switch. */}
        <div className={`${style.borsch} nb-borschcount`}>
          {borschLoading || placesLoading ? 'Завантаження...' : (
            <span className={style.borschCount}>
              (зареєстровано {borsch?.length || 0} борщів)
            </span>
          )}
        </div>
        {/* On phones the quest board lives inside the brand badge; desktop has
            no badge, so there it stays a floating pill over the map. */}
        {isDesktop && !borschLoading && !placesLoading && <QuestChip />}
      </>
      }
      {isLoaded && !placesLoading ? (
        <>          
          {filters.search && filters.search.trim() !== '' && places.length === 0 && (
            <div className={style.noResultsMessage}>
              <button 
                className={style.closeButton}
                onClick={() => resetAllFilters()}
                aria-label={t('map.closeMessage')}
              >
                ×
              </button>
              {t('map.noResults')}
            </div>
          )}
          <Map
            center={center}
            mode={mode}
            places={placesToShow}
            onMarkerAdd={onMarkerAdd}
            pickedPlace={pickedPlace}
          />
          {hasFullscreenMap && !isDesktop && mode === MODES.MOVE && <MapBrandBadge />}
        </>
      ) : (
        <div className={style.loadingContainer}>
          {!isLoaded ? t('map.loadingMap') : t('map.loadingPlaces')}
        </div>
      )} 
    </div>
  );
}

