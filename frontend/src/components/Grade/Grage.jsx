import { useRef, useEffect } from "react";
import style from "./Grade.module.scss";

/**
 * @param {number|null} value  null = not rated yet. The slider used to SHOW 5
 *   while the form still held null, so the user saw a filled-in form and a
 *   dead Save button with no explanation.
 */
export const Grade = ({
  icon: Icon,
  title = "Оцінка",
  labels = ["мінімум", "максимум"],
  value = null,
  onChange,
  index,
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
    <div className={`${style.container} ${highlight && !rated ? style.needsInput : ''}`} key={index}>
      <div className={style.wrap}>
        {Icon && <Icon aria-label={`icon-${title}`} />}
        <label className={style.label}>
          <span className={style.titleRow}>
            {title}
            <span className={rated ? style.valueOn : style.valueOff}>
              {rated ? value : '—'}
            </span>
          </span>
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
          <div className={style.text}>
            <p>{labels[0]}</p>
            <p>{labels[1]}</p>
          </div>
        </label>
      </div>
    </div>
  );
};
