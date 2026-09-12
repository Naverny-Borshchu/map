import { submitAddBorsch, emptyProgress, STAGES } from './addBorschSubmit';

const place = { name: 'Ватра', location: { lat: 50.4, lng: 30.5 }, type: 'restaurant' };

const values = {
  meat: 8, beetroot: 10, density: 6, salt: 6, aftertaste: 8, serving: 4, overall: 8,
  meatType: 'Яловичина', name: 'Борщ український', price: '180', weight: '350',
  comment: '  смачно  ', photo: null,
};

const makeApis = (over = {}) => ({
  placesAPI: {
    search: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 'place-1' }),
    ...over.placesAPI,
  },
  borschAPI: {
    create: jest.fn().mockResolvedValue({ id_borsch: 'borsch-1' }),
    uploadPhoto: jest.fn().mockResolvedValue({}),
    ...over.borschAPI,
  },
  commentsAPI: {
    createByBorschId: jest.fn().mockResolvedValue({}),
    ...over.commentsAPI,
  },
});

test('creates the venue, the borsch and the review, in that order', async () => {
  const apis = makeApis();
  const stages = [];
  const progress = await submitAddBorsch({
    place, street: 'Городецького, 4', city: 'Київ', values,
    progress: emptyProgress(), apis, onStage: (s) => stages.push(s),
  });

  expect(stages).toEqual([STAGES.place, STAGES.borsch, STAGES.review]);
  expect(progress).toMatchObject({ placeId: 'place-1', borschId: 'borsch-1', reviewDone: true });

  expect(apis.placesAPI.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Ватра', city: 'Київ', address: 'Городецького, 4, Київ' })
  );
  expect(apis.borschAPI.create).toHaveBeenCalledWith(
    expect.objectContaining({ name: 'Борщ український', place_id: 'place-1', type_meat: 'Яловичина', price: '180', weight: '350' })
  );
  expect(apis.commentsAPI.createByBorschId).toHaveBeenCalledWith('borsch-1', expect.objectContaining({
    rating_meat: 8, rating_beet: 10, rating_density: 6, rating_salt: 6,
    rating_aftertaste: 8, rating_serving: 4, overall_rating: 8, message: 'смачно',
  }));
});

test('persists each completed write so a reload can resume without duplicates', async () => {
  const apis = makeApis();
  const snapshots = [];
  await submitAddBorsch({
    place, street: 's', city: 'c', values, progress: emptyProgress(), apis,
    onProgress: (next) => snapshots.push(next),
  });

  expect(snapshots).toEqual([
    expect.objectContaining({ placeId: 'place-1', borschId: null, reviewDone: false }),
    expect.objectContaining({ placeId: 'place-1', borschId: 'borsch-1', reviewDone: false }),
    expect.objectContaining({ placeId: 'place-1', borschId: 'borsch-1', reviewDone: true }),
  ]);
});

test('reuses a venue that is already in the catalogue, whatever its casing', async () => {
  const apis = makeApis({ placesAPI: { search: jest.fn().mockResolvedValue([{ id: 7, name: ' ватра ' }]) } });
  const progress = await submitAddBorsch({
    place, street: 's', city: 'c', values, progress: emptyProgress(), apis,
  });
  expect(progress.placeId).toBe('7');
  expect(apis.placesAPI.create).not.toHaveBeenCalled();
});

test('a retry after a failed review does not create a second venue or borsch', async () => {
  const failing = makeApis({
    commentsAPI: { createByBorschId: jest.fn().mockRejectedValue(new Error('500')) },
  });
  const progress = emptyProgress();
  await expect(submitAddBorsch({ place, street: 's', city: 'c', values, progress, apis: failing }))
    .rejects.toThrow('500');
  expect(progress).toMatchObject({ placeId: 'place-1', borschId: 'borsch-1', reviewDone: false });

  // second attempt with the same progress object — only the review is retried
  const retry = makeApis();
  await submitAddBorsch({ place, street: 's', city: 'c', values, progress, apis: retry });
  expect(retry.placesAPI.create).not.toHaveBeenCalled();
  expect(retry.borschAPI.create).not.toHaveBeenCalled();
  expect(retry.commentsAPI.createByBorschId).toHaveBeenCalledTimes(1);
});

test('a photo that fails to upload does not lose the rating', async () => {
  const apis = makeApis({ borschAPI: { uploadPhoto: jest.fn().mockRejectedValue(new Error('413')) } });
  jest.spyOn(console, 'error').mockImplementation(() => {});
  const progress = await submitAddBorsch({
    place, street: 's', city: 'c',
    values: { ...values, photos: [new File(['x'], 'one.jpg', { type: 'image/jpeg' })] },
    progress: emptyProgress(), apis,
  });
  expect(progress.reviewDone).toBe(true);
  expect(progress.photoDone).toBe(true);
  console.error.mockRestore();
});

test('an unnamed venue search failure still lets the borsch through', async () => {
  const apis = makeApis({ placesAPI: { search: jest.fn().mockRejectedValue(new Error('offline')) } });
  const progress = await submitAddBorsch({
    place, street: 's', city: 'c', values, progress: emptyProgress(), apis,
  });
  expect(progress.placeId).toBe('place-1');
});

test('does not submit a borsch when the created venue response has no id', async () => {
  // placesAPI.mapPlace used to turn the backend's missing id into this string.
  const apis = makeApis({ placesAPI: { create: jest.fn().mockResolvedValue({ id: 'undefined' }) } });
  const progress = emptyProgress();

  await expect(submitAddBorsch({
    place, street: 's', city: 'c', values, progress, apis,
  })).rejects.toThrow('created place id');

  expect(progress.placeId).toBeNull();
  expect(apis.borschAPI.create).not.toHaveBeenCalled();
});

test('does not submit a review when the created borsch response has no id', async () => {
  // this is the exact shape the backend sent in production: a borsch-create
  // response missing its id, which used to be stringified into the literal
  // "undefined" and cached into progress — poisoning every retry forever.
  const apis = makeApis({ borschAPI: { create: jest.fn().mockResolvedValue({ id: 'undefined' }) } });
  const progress = emptyProgress();

  await expect(submitAddBorsch({
    place, street: 's', city: 'c', values, progress, apis,
  })).rejects.toThrow('created borsch id');

  expect(progress.placeId).toBe('place-1');
  expect(progress.borschId).toBeNull();
  expect(apis.commentsAPI.createByBorschId).not.toHaveBeenCalled();

  // and once the API is fixed, a retry with the same progress object succeeds
  // instead of retrying forever with the poisoned id — proving the guard
  // does not just fail loudly, it fails *recoverably*.
  const retry = makeApis();
  await submitAddBorsch({ place, street: 's', city: 'c', values, progress, apis: retry });
  expect(retry.placesAPI.create).not.toHaveBeenCalled();
  expect(progress.borschId).toBe('borsch-1');
  expect(progress.reviewDone).toBe(true);
});

const photoFile = (name) => new File(['x'], name, { type: 'image/jpeg' });

test('every photo is uploaded, one call each', async () => {
  const apis = makeApis();
  await submitAddBorsch({
    place, street: 's', city: 'c',
    values: { ...values, photos: [photoFile('1.jpg'), photoFile('2.jpg'), photoFile('3.jpg')] },
    progress: emptyProgress(), apis,
  });
  expect(apis.borschAPI.uploadPhoto).toHaveBeenCalledTimes(3);
  expect(apis.borschAPI.uploadPhoto.mock.calls.map(([id, f]) => [id, f.name]))
    .toEqual([['borsch-1', '1.jpg'], ['borsch-1', '2.jpg'], ['borsch-1', '3.jpg']]);
});

test('one photo failing does not take the others — or the rating — with it', async () => {
  const uploadPhoto = jest.fn()
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('413'))
    .mockResolvedValueOnce({});
  const apis = makeApis({ borschAPI: { uploadPhoto } });
  jest.spyOn(console, 'error').mockImplementation(() => {});

  const progress = await submitAddBorsch({
    place, street: 's', city: 'c',
    values: { ...values, photos: [photoFile('a.jpg'), photoFile('b.jpg'), photoFile('c.jpg')] },
    progress: emptyProgress(), apis,
  });

  expect(uploadPhoto).toHaveBeenCalledTimes(3);
  expect(progress.reviewDone).toBe(true);
  expect(progress.photoDone).toBe(true);
  console.error.mockRestore();
});

test('no photos means no upload calls at all', async () => {
  const apis = makeApis();
  await submitAddBorsch({ place, street: 's', city: 'c', values: { ...values, photos: [] }, progress: emptyProgress(), apis });
  expect(apis.borschAPI.uploadPhoto).not.toHaveBeenCalled();
});

/**
 * The catalogue branch was the one call site that never got a guard: the two
 * production incidents were both on *created* ids, so both fixes landed there
 * and this one kept doing a bare `String(existing.id)`. It feeds exactly the
 * same `place:` field on the next request.
 */
test('does not submit a borsch when the matched catalogue venue has no id', async () => {
  const apis = makeApis({
    placesAPI: { search: jest.fn().mockResolvedValue([{ name: 'Ватра' }]) },
  });
  const progress = emptyProgress();

  await expect(submitAddBorsch({
    place, street: 's', city: 'c', values, progress, apis,
  })).rejects.toThrow('existing place');

  expect(progress.placeId).toBeNull();
  expect(apis.placesAPI.create).not.toHaveBeenCalled();
  expect(apis.borschAPI.create).not.toHaveBeenCalled();
});

test('a catalogue venue whose id arrived as the string "undefined" is refused too', async () => {
  const apis = makeApis({
    placesAPI: { search: jest.fn().mockResolvedValue([{ name: 'Ватра', id: 'undefined' }]) },
  });
  const progress = emptyProgress();

  await expect(submitAddBorsch({
    place, street: 's', city: 'c', values, progress, apis,
  })).rejects.toThrow('existing place');

  expect(apis.borschAPI.create).not.toHaveBeenCalled();
});

test('a matched catalogue venue with a real id is used without creating a duplicate', async () => {
  const apis = makeApis({
    placesAPI: { search: jest.fn().mockResolvedValue([{ name: 'Ватра', id: 'place-42' }]) },
  });

  const progress = await submitAddBorsch({
    place, street: 's', city: 'c', values, progress: emptyProgress(), apis,
  });

  expect(progress.placeId).toBe('place-42');
  expect(apis.placesAPI.create).not.toHaveBeenCalled();
  expect(apis.commentsAPI.createByBorschId).toHaveBeenCalledWith('borsch-1', expect.any(Object));
});
