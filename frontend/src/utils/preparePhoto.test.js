import { fitWithin, preparePhotoForUpload, MAX_EDGE } from './preparePhoto';

// jsdom не має ні декодера картинок, ні canvas, тож тут підставляємо обидва:
// Image «розкодовує» файл у задані розміри, а canvas.toBlob віддає блоб і
// запамʼятовує, що на ньому намалювали.
const installFakeBrowser = ({ width, height, decodeFails = false, blobSize = 300_000 }) => {
  const drawn = [];
  const originalImage = global.Image;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const createElement = document.createElement.bind(document);

  URL.createObjectURL = jest.fn(() => 'blob:fake');
  URL.revokeObjectURL = jest.fn();
  global.Image = class {
    set src(_) {
      setTimeout(() => {
        if (decodeFails) return this.onerror && this.onerror(new Error('decode'));
        this.naturalWidth = width;
        this.naturalHeight = height;
        this.onload && this.onload();
      }, 0);
    }
  };
  const spy = jest.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag !== 'canvas') return createElement(tag);
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({
        fillRect: () => {},
        drawImage: (_img, x, y, w, h) => drawn.push({ w, h, canvasW: canvas.width, canvasH: canvas.height }),
        set fillStyle(_) {},
      }),
      toBlob: (cb, type, quality) => cb(new Blob([new Uint8Array(blobSize)], { type })),
    };
    return canvas;
  });

  return {
    drawn,
    restore: () => {
      global.Image = originalImage;
      URL.createObjectURL = originalCreate;
      URL.revokeObjectURL = originalRevoke;
      spy.mockRestore();
    },
  };
};

// розмір iPhone-знімка, що отримав 413 17.10.2026: 15,1 МБ
const bigPhone = () =>
  new File([new Uint8Array(15_123_390)], 'IMG_4821.JPG', { type: 'image/jpeg', lastModified: 1760715272000 });

describe('fitWithin', () => {
  it('shrinks the long edge to the limit and keeps the aspect ratio', () => {
    expect(fitWithin(8064, 6048)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3213, 5712)).toEqual({ width: 1152, height: 2048 });
  });

  it('never enlarges a small picture', () => {
    expect(fitWithin(1080, 720)).toEqual({ width: 1080, height: 720 });
  });
});

describe('preparePhotoForUpload', () => {
  it('turns a 15 MB phone photo into a JPEG well under the 10 MB nginx limit', async () => {
    const fake = installFakeBrowser({ width: 8064, height: 6048 });
    try {
      const out = await preparePhotoForUpload(bigPhone());
      expect(out.type).toBe('image/jpeg');
      expect(out.name).toBe('IMG_4821.jpg');
      expect(out.size).toBeLessThan(10 * 1024 * 1024);
      expect(fake.drawn).toEqual([{ w: MAX_EDGE, h: 1536, canvasW: MAX_EDGE, canvasH: 1536 }]);
      // the object URL is released, or every photo would leak its decoded copy
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:fake');
    } finally {
      fake.restore();
    }
  });

  it('sends the original when the browser cannot decode it (HEIC on desktop Chrome)', async () => {
    const fake = installFakeBrowser({ width: 0, height: 0, decodeFails: true });
    try {
      const heic = new File([new Uint8Array(10)], 'IMG_1.HEIC', { type: 'image/heic' });
      await expect(preparePhotoForUpload(heic)).resolves.toBe(heic);
    } finally {
      fake.restore();
    }
  });

  it('sends the original when there is no canvas at all (plain jsdom)', async () => {
    const file = new File([new Uint8Array(10)], 'a.jpg', { type: 'image/jpeg' });
    await expect(preparePhotoForUpload(file)).resolves.toBe(file);
  });

  it('leaves GIFs and non-images alone', async () => {
    const gif = new File(['GIF89a'], 'a.gif', { type: 'image/gif' });
    const pdf = new File(['%PDF'], 'menu.pdf', { type: 'application/pdf' });
    await expect(preparePhotoForUpload(gif)).resolves.toBe(gif);
    await expect(preparePhotoForUpload(pdf)).resolves.toBe(pdf);
  });

  it('gives a name-less file a usable jpg name', async () => {
    const fake = installFakeBrowser({ width: 100, height: 100 });
    try {
      const out = await preparePhotoForUpload(new File([new Uint8Array(10)], '', { type: 'image/png' }));
      expect(out.name).toBe('photo.jpg');
    } finally {
      fake.restore();
    }
  });
});
