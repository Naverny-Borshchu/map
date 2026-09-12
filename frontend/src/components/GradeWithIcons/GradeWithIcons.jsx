import { useRef, useEffect } from "react";
import style from "./GradeWithIcons.module.scss";

export const GradeWithIcons = ({
  title = "Оцінка",
  iconLabels = [null, null],
  value = null,
  onChange,
  highlight = false,
}) => {
  const rated = value !== null && value !== undefined;
  const shown = rated ? value : 5;
  const inputRef = useRef(null);

  useEffect(() => {
    const percent = ((shown - 1) / 9) * 100;
    if (inputRef.current) {
      inputRef.current.style.setProperty("--value", `${percent}%`);
    }
  }, [shown]);
   const handleChange = (e) => {
    if (onChange) onChange(Number(e.target.value));
  };

  return (
  
      <div className={`${style.wrap} ${highlight && !rated ? style.needsInput : ''}`}>
        <label className={style.labelCenter}>
          <div className={style.title}>
            {title} <span className={rated ? style.valueOn : style.valueOff}>{rated ? value : '—'}</span>
          </div>
          <div className={style.sliderWrapper}>
            <div className={style.track}>
              {Array.from({ length: 10 }).map((_, i) => (
                <div
                  key={i}
                  className={`${style.tick} ${rated && i < value ? style.filled : ''}`}
                />
              ))}
            </div>
            <input
              ref={inputRef}
              type="range"
              min="1"
              max="10"
              value={shown}
              onChange={handleChange}
              className={style.input}
            />
          </div>

          <div className={style.iconLabels}>
            <span>{iconLabels[0]}</span>
            <span>{iconLabels[1]}</span>
          </div>
        </label>
      </div>
    
  );
};
