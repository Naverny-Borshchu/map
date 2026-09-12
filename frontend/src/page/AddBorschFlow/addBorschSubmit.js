import { gradesToReview } from '../../components/QuestFlow/answers';
import { requireId } from '../../utils/ids';

/**
 * The four writes behind "add a borsch", in order, with the stage reported so
 * the closing screen can say what is happening instead of spinning silently.
 *
 * `progress` is the caller's mutable record of what already landed. A retry
 * passes the same object back in, so a failure at the review step does NOT
 * create a second place and a second borsch — which is exactly what the old
 * one-shot form did on every retry.
 */

export const STAGES = {
  place: 'flow.stagePlace',
  borsch: 'flow.stageBorsch',
  review: 'flow.stageReview',
  photo: 'flow.stagePhoto',
};

export const emptyProgress = () => ({
  placeId: null,
  borschId: null,
  reviewDone: false,
  photoDone: false,
});

export async function submitAddBorsch({
  place,           // Google Places object picked on the map
  street,
  city,
  values,          // grades + meatType/name/price/weight/photo/comment
  progress,
  apis,            // { placesAPI, borschAPI, commentsAPI }
  onStage = () => {},
  onProgress = () => {},
}) {
  const { placesAPI, borschAPI, commentsAPI } = apis;

  // 1. The venue may already be in our catalogue — adding a second row for the
  //    same restaurant would split its borsches across two pins.
  if (!progress.placeId) {
    onStage(STAGES.place);
    const found = await placesAPI.search(place.name).catch(() => []);
    const existing = (Array.isArray(found) ? found : []).find(
      (p) => String(p.name).trim().toLowerCase() === String(place.name).trim().toLowerCase()
    );
    if (existing) {
      // a catalogue row with no id is as unusable as a created one with no id,
      // and it reaches the same `place:` field on the next request
      progress.placeId = requireId(existing.id, 'existing place');
    } else {
      const created = await placesAPI.create({
        name: place.name,
        address: [street, city].filter(Boolean).join(', '),
        city,
        type: place.type || '',
        latitude: place.location?.lat || 0,
        longitude: place.location?.lng || 0,
      });
      progress.placeId = requireId(created?.id, 'created place');
    }
    onProgress({ ...progress });
  }

  // 2. the borsch itself
  if (!progress.borschId) {
    onStage(STAGES.borsch);
    const created = await borschAPI.create({
      name: values.name,
      place_id: progress.placeId,
      type_meat: values.meatType,
      price: values.price,
      weight: values.weight,
    });
    progress.borschId = requireId(created?.id_borsch ?? created?.id, 'created borsch');
    onProgress({ ...progress });
  }

  // 3. the rating the person came here to leave
  if (!progress.reviewDone) {
    onStage(STAGES.review);
    await commentsAPI.createByBorschId(progress.borschId, gradesToReview(values, values.comment));
    progress.reviewDone = true;
    onProgress({ ...progress });
  }

  // 4. the photos are a bonus: losing one must not fail a finished rating, and
  //    must not take the other photos with it either
  const photos = values.photos || [];
  if (photos.length && !progress.photoDone) {
    onStage(STAGES.photo);
    for (const file of photos) {
      try {
        await borschAPI.uploadPhoto(progress.borschId, file);
      } catch (e) {
        console.error('Не вдалося завантажити фото:', e);
      }
    }
    progress.photoDone = true;
    onProgress({ ...progress });
  }

  return progress;
}
