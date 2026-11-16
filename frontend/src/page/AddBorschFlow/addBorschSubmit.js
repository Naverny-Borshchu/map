import { answersToReview } from '../../components/QuestFlow/answers';
import { requireId } from '../../utils/ids';
import { uploadPhotos } from '../../utils/uploadPhotos';

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
  photosUploaded: [],   // indices into values.photos that already landed
  photosPending: [],    // of those, the ones waiting for the AI check (202, NAV-218)
  photosFailed: 0,
  reviewUpdated: false, // the save replaced an earlier rating of this borshch
});

export async function submitAddBorsch({
  place,           // Google Places object picked on the map (googlePlaceId when from Google)
  street,
  city,
  country = '',
  values,          // the rating answers (answers.js) + meatType/name/price/weight/photos/comment
  progress,
  apis,            // { placesAPI, borschAPI, commentsAPI }
  onStage = () => {},
  onProgress = () => {},
}) {
  const { placesAPI, borschAPI, commentsAPI } = apis;

  // 1. The venue may already be in our catalogue — adding a second row for the
  //    same restaurant would split its borsches across two pins.
  //    A venue from Google Places carries its Place ID: the backend itself
  //    returns the venue it has (the same ID, or the same name within 50 m;
  //    200, reused), which is safer than matching names across the whole
  //    country, where «Пузата Хата» in Lviv is not the one in Kyiv.
  if (!progress.placeId) {
    onStage(STAGES.place);
    if (place.googlePlaceId) {
      const created = await placesAPI.create({
        name: place.name,
        address: [street, city].filter(Boolean).join(', '),
        city,
        country: country || undefined,
        type: place.type || '',
        latitude: place.location?.lat || 0,
        longitude: place.location?.lng || 0,
        google_place_id: place.googlePlaceId,
        via: 'add',
      });
      progress.placeId = requireId(created?.id, 'created place');
      onProgress({ ...progress });
    } else {
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
    const saved = await commentsAPI.createByBorschId(progress.borschId, answersToReview(values, values.comment));
    progress.reviewDone = true;
    // one rating per person per borshch: the server may have updated an
    // earlier one (a borshch the backend matched to one already on the map)
    progress.reviewUpdated = saved?.updated === true;
    onProgress({ ...progress });
  }

  // 4. the photos are a bonus: losing one must not fail a finished rating, and
  //    must not take the other photos with it either. But it must be SAID:
  //    photoDone stays false and photosFailed carries the count, so the closing
  //    screen can offer to retry just the ones that did not land.
  const photos = values.photos || [];
  if (photos.length && !progress.photoDone) {
    onStage(STAGES.photo);
    await uploadPendingPhotos({ photos, progress, borschAPI });
    onProgress({ ...progress });
  }

  return progress;
}

/** Step 4 on its own, for the "retry the photos" button on the closing screen. */
export async function uploadPendingPhotos({ photos, progress, borschAPI }) {
  const { uploaded, failed, pending } = await uploadPhotos({
    borschId: progress.borschId,
    photos,
    uploaded: progress.photosUploaded,
    pending: progress.photosPending,
    upload: borschAPI.uploadPhoto,
  });
  progress.photosUploaded = uploaded;
  // sent, so never retried; the closing screen says they are being checked
  progress.photosPending = pending;
  progress.photosFailed = failed;
  progress.photoDone = failed === 0;
  return progress;
}
