import { useRef, useState } from 'react';
import { borschAPI } from '../../api';
import { track } from '../../analytics';
import { uploadPhotos } from '../../utils/uploadPhotos';
import { MAX_PHOTOS } from '../QuestFlow';
import { showToast } from '../Toast';
import { IconCamera } from '../Icons';
import { useT } from '../../i18n';
import style from './AddPhotoLater.module.scss';

/**
 * «Фото пізніше» for a borshch you already rated: the picture is often still
 * on the camera when the rating is long done. Opens the photo library (no
 * capture: the bowl is empty by now) and sends each picture to the borshch
 * through the same upload as the flows, EXIF and all.
 *
 * upload is injectable for tests; production uses borschAPI.uploadPhoto.
 */
export const AddPhotoLater = ({ borschId, upload = borschAPI.uploadPhoto, onUploaded }) => {
  const t = useT();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const send = async (fileList) => {
    const photos = Array.from(fileList || []).slice(0, MAX_PHOTOS);
    if (!photos.length || busy) return;
    setBusy(true);
    const result = await uploadPhotos({ borschId, photos, upload });
    setBusy(false);
    track('photo_added_later', { borsch_id: borschId, count: photos.length, failed: result.failed });
    if (result.failed === 0) {
      showToast(t('rev.photoAdded'));
      window.dispatchEvent(new Event('borschDataUpdated'));
      onUploaded?.(photos.length);
    } else {
      showToast(t('rev.photoFailed', { n: result.failed, total: photos.length }));
      if (result.failed < photos.length) window.dispatchEvent(new Event('borschDataUpdated'));
    }
  };

  return (
    <>
      <button
        type="button"
        className={style.btn}
        onClick={() => inputRef.current?.click()}
        disabled={busy}
      >
        <IconCamera size={18} />
        {busy ? t('rev.photoUploading') : t('rev.addPhoto')}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        hidden
        data-testid={`add-photo-${borschId}`}
        onChange={(e) => { send(e.target.files); e.target.value = ''; }}
      />
    </>
  );
};
