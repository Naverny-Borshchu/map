import { uploadPhotos } from './uploadPhotos';

const files = ['a', 'b', 'c'].map((n) => new File(['x'], `${n}.jpg`, { type: 'image/jpeg' }));

beforeEach(() => jest.spyOn(console, 'error').mockImplementation(() => {}));
afterEach(() => console.error.mockRestore());

test('counts the failures instead of swallowing them', async () => {
  const upload = jest.fn()
    .mockRejectedValueOnce(Object.assign(new Error('HTTP error! status: 413'), { status: 413 }))
    .mockResolvedValueOnce({})
    .mockRejectedValueOnce(new Error('offline'));
  await expect(uploadPhotos({ borschId: 'b1', photos: files, upload }))
    .resolves.toEqual({ uploaded: [1], failed: 2 });
  expect(upload).toHaveBeenCalledTimes(3);
});

test('skips what already landed and ignores indices from another set of photos', async () => {
  const upload = jest.fn().mockResolvedValue({});
  const result = await uploadPhotos({ borschId: 'b1', photos: files, uploaded: [1, 7, -1, '0'], upload });
  expect(upload.mock.calls.map(([, f]) => f.name)).toEqual(['a.jpg', 'c.jpg']);
  expect(result).toEqual({ uploaded: [0, 1, 2], failed: 0 });
});

test('no photos, no calls', async () => {
  const upload = jest.fn();
  await expect(uploadPhotos({ borschId: 'b1', photos: [], upload })).resolves.toEqual({ uploaded: [], failed: 0 });
  expect(upload).not.toHaveBeenCalled();
});
