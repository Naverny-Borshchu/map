import { useEffect, useRef, useState } from 'react';
import style from './FotoBorschGallary.module.css';
import { BorschSkeleton } from '../BorschSkeleton';
import { useT } from '../../i18n';

const srcOf = (path) =>
  path?.startsWith('http') ? path : `https://map.navernyborshchu.com${path}`;

export const FotoBorschGallary = ({ images, height }) => {
  const t = useT();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loaded, setLoaded] = useState(() => new Set());
  const imgRef = useRef(null);

  const total = images?.length || 0;

  // Warm the neighbours so flipping is instant. Only ±1 — preloading the whole
  // gallery would waste mobile data for photos most people never reach.
  useEffect(() => {
    if (total < 2) return;
    [currentIndex + 1, currentIndex - 1].forEach((raw) => {
      const i = (raw + total) % total;
      if (i === currentIndex) return;
      const img = new Image();
      img.onload = () => setLoaded((prev) => new Set(prev).add(i));
      img.src = srcOf(images[i]);
    });
  }, [currentIndex, images, total]);

  // A cached image can be complete before onLoad ever fires.
  useEffect(() => {
    if (imgRef.current?.complete) {
      setLoaded((prev) => (prev.has(currentIndex) ? prev : new Set(prev).add(currentIndex)));
    }
  }, [currentIndex]);

  if (!images || total === 0) return null;

  // stopPropagation: the photo sits inside a card that carries its own click
  // handlers — flipping a photo must not also trigger those.
  const step = (delta) => (e) => {
    e.stopPropagation();
    e.preventDefault();
    setCurrentIndex((i) => (i + delta + total) % total);
  };

  const goToSlide = (index) => (e) => {
    e.stopPropagation();
    setCurrentIndex(index);
  };

  const isLoaded = loaded.has(currentIndex);
  // Marks the current photo as settled — used both on load and on error, so a
  // broken URL doesn't leave the pot simmering forever.
  const settle = () => setLoaded((prev) => new Set(prev).add(currentIndex));

  return (
    <div className={style.gallery}>
      <div className={style.frame} style={{ height }}>
        <BorschSkeleton visible={!isLoaded} className={style.skeleton} />

        <img
          ref={imgRef}
          src={srcOf(images[currentIndex])}
          alt={images[currentIndex]?.split('/').pop() || ''}
          className={`${style.image} ${isLoaded ? style.imageReady : ''}`}
          loading="lazy"
          decoding="async"
          onLoad={settle}
          onError={settle}
        />

        {total > 1 && (
          <>
            <button
              type="button"
              className={`${style.nav} ${style.prev}`}
              onClick={step(-1)}
              aria-label={t('card.prevPhoto')}
            >
              ‹
            </button>
            <button
              type="button"
              className={`${style.nav} ${style.next}`}
              onClick={step(1)}
              aria-label={t('card.nextPhoto')}
            >
              ›
            </button>

            <div className={style.dots}>
              {images.map((_, index) => (
                <span
                  key={index}
                  className={`${style.dot} ${index === currentIndex ? style.active : ''}`}
                  onClick={goToSlide(index)}
                />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
