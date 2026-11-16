/**
 * NAV-218: a photo from a regular user is checked by AI before it goes public.
 * The upload answers 202 `{photo_id, status: "pending", message}` instead of
 * 201 `{photo_url}`: the photo is on the server, so it counts as sent (no
 * retry, no «не вдалося»), but it is not on the card yet and nothing may show
 * it there. Staff and an older backend still answer 201.
 */
export const isPendingPhoto = (response) => response?.status === 'pending';

const validIndices = (list, length) => (list || [])
  .filter((i) => Number.isInteger(i) && i >= 0 && i < length);

/**
 * Фото борщу по одному запиту на кожне, з памʼяттю про те, які вже доїхали.
 *
 * Обидва флоу (новий борщ і оцінка наявного) раніше ковтали помилку
 * аплоуду в console.error і вважали крок виконаним. 17.10.2026 так зникли
 * три фото підряд: оцінка збереглась, екран сказав «Борщ на мапі!», а про
 * фото не сказав нічого. Тепер результат повертається, і екран фіналу може
 * чесно сказати, скільки не доїхало, та запропонувати повторити саме їх.
 *
 * `uploaded` — індекси, які вже на сервері з попередньої спроби. Повтор
 * пропускає їх, тож друга спроба не дублює фото, що пройшли з першої.
 * `pending` — ті з них, що сервер прийняв на перевірку (202): вони
 * повертаються разом з новими, щоб екран після повтору про них не забув.
 */
export async function uploadPhotos({ borschId, photos = [], uploaded = [], pending = [], upload }) {
  // індекси з чужого (старішого) набору фото не мають рахуватись як «доїхали»
  const done = new Set(validIndices(uploaded, photos.length));
  const checking = new Set(validIndices(pending, photos.length).filter((i) => done.has(i)));
  for (let i = 0; i < photos.length; i += 1) {
    if (done.has(i)) continue;
    try {
      const response = await upload(borschId, photos[i]);
      done.add(i);
      if (isPendingPhoto(response)) checking.add(i);
    } catch (e) {
      // одне фото не має тягнути за собою інші, тож лише лог і далі
      console.error('Не вдалося завантажити фото:', e);
    }
  }
  return {
    uploaded: [...done].sort((a, b) => a - b),
    failed: photos.length - done.size,
    // sent, but waiting for the check: not on the card yet
    pending: [...checking].sort((a, b) => a - b),
  };
}
