import { useState} from 'react';
import { useNavigate} from "react-router-dom";
import { useFilters } from '../../context/FiltersContext';
import { usePlaces } from '../../context/PlacesContext';
import { ReactComponent as IconDelete } from './close.svg';
import { ReactComponent as IconSearch } from './search.svg';
import { ReactComponent as IconSearchGray } from './searchGray.svg';
import { cityCenter, CITY_FOCUS_ZOOM } from '../../utils/cityCenter';
import style from './CitySelect.module.scss';
import { useT } from '../../i18n';
import { useCityLabel } from '../../i18n';


export const CitySelect = ({onClose}) => {
  const { cities} = usePlaces(); 
  const {
    city,
    focusMap,
    updateCity,
    resetAllFilters,
  } = useFilters();
  const [searchValue, setSearchValue] = useState('');
  const navigate = useNavigate();
  const t = useT();
  const cityLabel = useCityLabel();

  const handleChange = (e) => {
    const cityName = e.target.value;
    // /places/cities/ now returns a plain array of {city, lat, lng}
    const cityData = cities?.find(
      item =>
        item.city.trim().toLowerCase() ===
        cityName.trim().toLowerCase()
    );

    if (!cityData) return;

    const c = cityCenter(cityData);
    updateCity(cityData.city);
    focusMap(c.lat, c.lng, CITY_FOCUS_ZOOM);
    navigate(`/`);
    // picking a city is a completed action — the sheet used to stay open
    if (onClose) onClose();
  };
  const handleSearchChange = (e) => {
    setSearchValue(e.target.value);
  };
 
  const handleSearch = () => {
    const query = searchValue.trim(); 
    
    const cityData = cities?.find(
    item =>
      item.city.trim().toLowerCase() ===
      query.trim().toLowerCase()
    );
   

    if (!cityData) return;

    const c = cityCenter(cityData);
    updateCity(cityData.city);
    focusMap(c.lat, c.lng, CITY_FOCUS_ZOOM);
    navigate(`/`);
    if (onClose) onClose();
  };

  const handleClearSearch = () => {
    resetAllFilters();
    setSearchValue('');        
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };  

  return (
    <div className={style.cardFilters}>
      <button type="button" onClick={onClose} className={style.btnClose} aria-label={t('card.close')}>                               
        <IconDelete   aria-label={'close'} id='close' />
      </button>  
      <h2 className={style.title}>{t('city.title')}</h2>
      <div className={style.inputWrap}>
              <button
                type="button"
                className={style.searchButton}
                onClick={handleSearch}
                aria-label="search"
              >
                <IconSearchGray className={`${style.icon} ${style.iconDefault}`} />
                <IconSearch className={`${style.icon} ${style.iconActive}`} />
              </button>
              <input
                className={style.input}
                type="text"
                id="search"
                placeholder={t('city.placeholder')}
                value={searchValue}
                onChange={handleSearchChange}
                onKeyDown={handleKeyPress}
              /> 
              {searchValue && (
              <button
                type="button"
                className={style.clearButton}
                onClick={handleClearSearch}
                aria-label="Очистити пошук"
              >
                ×
              </button>
            )}           
        </div>     
      <div className={style.boxType}>
        <h3 className={style.subTitle}>{t('city.popular')}</h3>                
        <div className={style.cityOptions}>           
          {cities
          ?.slice()
          .sort((a, b) => b.borsch_count - a.borsch_count)
          .slice(0, 5).map((item) => (
              <button
                key={item.city}
                type="button"
                className={city === item.city? style.activeCityButton: style.cityButton}
                onClick={handleChange}                 
                value={item.city || ''}
              >
                {cityLabel(item.city)}
              </button>
          ))}
        </div>
        <h3 className={style.subTitle}>{t('city.all')}</h3>                
        <div className={style.cityOptions}>           
          {cities?.slice()
            .sort((a, b) => b.borsch_count - a.borsch_count)
            .slice(5)
            .map((item) => (
              <button
                key={item.city}
                type="button"
                className={city === item.city? style.activeCityButton: style.cityButton}
                onClick={handleChange}                 
                value={item.city|| ''}
              >
                {cityLabel(item.city)}
              </button>
          ))}
        </div>
      </div>
    </div>
  );
};