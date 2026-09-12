import {Link, useNavigate} from "react-router-dom";
import { useEffect } from 'react';
import { Filters } from '../../components/Filters/Filters';
import { CardBosch } from "../../components/CardBorsch/CardBorsch";
import { RatingIconsSvg } from "../../components/RatingIconsSvg";
import { ButtonVertion } from "../../components/ButtonVersion";
import { ReactComponent as IconLike } from './like.svg';
import { ReactComponent as IconLink } from './link.svg';
import { ReactComponent as IconMap } from './map-pin.svg';
import { FotoBorschGallary } from "../../components/FotoBorschGallary";
import { usePlaces } from '../../context/PlacesContext';
import { useBorsch } from '../../context/BorschContext';
import { useFilters } from '../../context/FiltersContext';
import style from './ListPage.module.scss';
import { formatGrade } from "../../utils/rating";

const fallbackCopy = (text) => {
  const tempInput = document.createElement("input");
  tempInput.value = text;
  document.body.appendChild(tempInput);
  tempInput.select();
  document.execCommand("copy");
  document.body.removeChild(tempInput);
  console.log("Скопійовано через fallback:", text);
};
const normalizeRating = (value) => {
  const match = String(value ?? '')
    .replace(',', '.')
    .match(/\d+(\.\d+)?/);

  return match ? Number(match[0]) : 0;
}

export const ListPage=()=>{
  const navigate = useNavigate();
  const { places, updatePlacesBySearch,rating } = usePlaces();
  const { borsch } = useBorsch();
  const { filters, resetAllFilters } = useFilters();
  
 
  const onClickCard = (borschId) => {
    navigate(`/borsch/${borschId}`);
  };
  
  const nameBorsch=(place_id)=>{  
    const place = places.find(i => String(i.id) === String(place_id));   
    return place ? place.name : "Невідоме місце";
  }

  // Синхронизация с фильтрами - обновляем места при изменении поиска
  useEffect(() => {
    if (filters.search && filters.search.trim() !== '') {
      updatePlacesBySearch(filters.search);
    } else {
      updatePlacesBySearch('');
    }
  }, [filters.search, updatePlacesBySearch]); 
  
  const handleCopyAndShare = (id_borsch) => {
    const url = `${window.location.origin}/borsch/${id_borsch}`;

    // Если Web Share API поддерживается — вызываем нативное окно
    if (navigator.share) {
      navigator.share({
        title: 'Перегляньте цей борщ',
        text: 'Дивись ось цю сторінку борща:',
        url: url,
      })
      .then(() => console.log("Поділитися успішно"))
      .catch((err) => {
        console.error("Помилка при шерингу:", err);
        // Если шеринга нет или отказались — копируем в буфер один раз
        copyToClipboardWithAlert(url);
      });
    } else {
      // Web Share API нет — просто копируем в буфер и alert
      copyToClipboardWithAlert(url);
    }
  };

  const copyToClipboardWithAlert = (text) => {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => {
          alert("Посилання скопійоване в буфер. Поділитись можна вручну.");
        })
        .catch((err) => {
          console.error("Помилка копіювання:", err);
          fallbackCopy(text);
          alert("Посилання скопійоване в буфер. Поділитись можна вручну.");
        });
    } else {
      fallbackCopy(text);
      alert("Посилання скопійоване в буфер. Поділитись можна вручну.");
    }
  };
    return( 
      <div className={style.pageList}>
        <div className={style.containerFilter}> 
          <Filters/>  
          <div className={style.btnWrap}> 
            <Link to="/"  className={style.btn}>Мапа</Link>          
            <Link to="/list"  className={style.btn_inl}>Список</Link>               
          </div>
            <div className={style.borsch}>(зареєстровано {borsch?.length || 0} борщів)</div>
        </div>
        <div className={style.wrappBorsch}>
            {(() => {
              const filteredBorsch = borsch?.filter(el =>
                places.some(place => String(place.id) === String(el.place_id))
              );

              const resultBorsch = rating
              ? [...filteredBorsch].sort(
                  (a, b) =>
                    normalizeRating(b.overall_rating) -
                    normalizeRating(a.overall_rating)
                )
              : filteredBorsch; 
                
                if (resultBorsch && resultBorsch.length === 0) {
                 return (
                   <div className={style.noResults}>
                     <button 
                       className={style.closeButton}
                       onClick={() => resetAllFilters()}
                       aria-label="Закрити повідомлення"
                     >
                       ×
                     </button>
                     За вашим запитом жодного борща не знайдено
                   </div>
                 );
               }    
              return resultBorsch?.map((el,index)=>{                   
                return (
                  <div key={index} className={style.card}>
                    <FotoBorschGallary images={el.photo_urls} height={"210px"}/>                  
                    <div className={style.box}>                
                      <ButtonVertion
                        type="button"
                        onClick={() => handleCopyAndShare(el.id_borsch)}
                        icon={IconLink}
                      />
                      <ButtonVertion
                          type="button"
                          onClick={()=>console.log("Тут буде функція яка змінює ключ лайку")}
                          icon={IconLike}
                      />
                    </div> 
                    <h3 className={style.borschName}>{el.name}</h3>                   
                    <p className={style.grade}>Оцінка</p>
                    <div className={style.flex}>
                      <RatingIconsSvg overall_rating={el.overall_rating} /> 
                      <p className={style.rating}>{formatGrade(el.overall_rating)} <span className={style.rating_grade}>({'128'})</span></p>
                    </div>                    
                    <div className={style.flex}>
                      <div className={style.flex}>
                        <IconMap/>
                        <p className={style.namePlace}>{nameBorsch(el.place_id)}</p>
                      </div>                      
                      <button
                        className={style.btnAbout}
                        type="button"
                        onClick={() => onClickCard(el.id_borsch)}
                      >
                        
                        <span>Про борщик</span>                        
                      </button>                      
                    </div>                    
                  </div>
                )                    
              });
            })()} 
        </div>         
      </div>
    )   
  }