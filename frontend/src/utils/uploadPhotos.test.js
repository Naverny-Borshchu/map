import { isPendingPhoto, uploadPhotos } from './uploadPhotos';

const files = ['a', 'b', 'c'].map((n) => new File(['x'], `${n}.jpg`, { type: 'image/jpeg' }));

// what the server answers (NAV-218): 202 for a regular user, 201 for staff
const PENDING = { photo_id: 'ph-1', status: 'pending', message: 'Фото на перевірці' };
const PUBLISHED = { photo_url: '/media/borsches/b1/photos/x.jpg' };

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => console.error.mockRestore());

test('counts the failures instead of swallowing them', async () => {
  const upload = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('HTTP error! status: 413'), { status: 413 }))
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('offline'));
  await expect(uploadPhotos({ borschId: 'b1', photos: files, upload }))
    .resolves.toEqual({ uploaded: [1], failed: 2, pending: [] });
  expect(upload).toHaveBeenCalledTimes(3);
});

test('skips what already landed and ignores indices from another set of photos', async () => {
  const upload = jest.fn().mockResolvedValue({});
  const result = await uploadPhotos({ borschId: 'b1', photos: files, uploaded: [1, 7, -1, '0'], upload });
  expect(upload.mock.calls.map(([, f]) => f.name)).toEqual(['a.jpg', 'c.jpg']);
  expect(result).toEqual({ uploaded: [0, 1, 2], failed: 0, pending: [] });
});

test('no photos, no calls', async () => {
  const upload = jest.fn();
  await expect(uploadPhotos({ borschId: 'b1', photos: [], upload })).resolves.toEqual({ uploaded: [], failed: 0, pending: [] });
  expect(upload).not.toHaveBeenCalled();
});

describe('a photo waiting for the AI check (NAV-218)', () => {
  test('202 pending is sent, not failed, and is counted as waiting', async () => {
    const upload = jest.fn().mockResolvedValue(PENDING);
    await expect(uploadPhotos({ borschId: 'b1', photos: files, upload }))
      .resolves.toEqual({ uploaded: [0, 1, 2], failed: 0, pending: [0, 1, 2] });
    expect(console.error).not.toHaveBeenCalled();
  });

  test('201 with photo_url is public at once: sent and not waiting', async () => {
    const upload = jest.fn().mockResolvedValue(PUBLISHED);
    await expect(uploadPhotos({ borschId: 'b1', photos: files, upload }))
      .resolves.toEqual({ uploaded: [0, 1, 2], failed: 0, pending: [] });
  });

  test('a mix: one waiting, one public, one failed', async () => {
    const upload = jest.fn()
      .mockResolvedValueOnce(PENDING)
      .mockResolvedValueOnce(PUBLISHED)
      .mockRejectedValueOnce(new Error('offline'));
    await expect(uploadPhotos({ borschId: 'b1', photos: files, upload }))
      .resolves.toEqual({ uploaded: [0, 1], failed: 1, pending: [0] });
  });

  test('a retry keeps the earlier waiting photos and adds its own', async () => {
    const upload = jest.fn().mockResolvedValue(PENDING);
    const result = await uploadPhotos({
      borschId: 'b1', photos: files, uploaded: [0, 1], pending: [0, 2, 9], upload,
    });
    expect(upload).toHaveBeenCalledTimes(1);
    // 2 was not uploaded before, so the old «pending» for it means nothing; now it is
    expect(result).toEqual({ uploaded: [0, 1, 2], failed: 0, pending: [0, 2] });
  });

  test('only status "pending" counts as waiting', () => {
    expect(isPendingPhoto(PENDING)).toBe(true);
    expect(isPendingPhoto(PUBLISHED)).toBe(false);
    expect(isPendingPhoto(null)).toBe(false);
    expect(isPendingPhoto({ status: 'approved' })).toBe(false);
  });
});
