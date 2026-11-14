/**
 * Where the photos of a bowl wait between «принесли» and «поїв».
 *
 * A phone photo is 3 to 15 MB. localStorage holds about 5 MB per origin and
 * only strings, so one photo could fill it and take the rest of the app's
 * storage (session, favourites, drafts) down with it. IndexedDB holds binary
 * data and far more of it, so the photos live there and the bowl's metadata
 * stays in localStorage, where it is cheap to read on every screen.
 *
 * The bytes are stored as an ArrayBuffer with the file's name, type and date,
 * not as the File itself: older Safari could not put a Blob into IndexedDB,
 * an ArrayBuffer always works, and the bytes are kept as they are, so the EXIF
 * time and GPS the upload step preserves are still there when the photo leaves.
 *
 * No IndexedDB (a private window in some browsers, or the test environment):
 * the photos are kept in memory for this tab. The bowl itself survives a
 * reload either way; only the picture would not.
 */

const DB_NAME = 'nb-bowls';
const DB_VERSION = 1;
const STORE = 'photos';

// Blob.arrayBuffer() arrived in Safari 14; FileReader is everywhere.
const readBuffer = (file) => {
  if (typeof file.arrayBuffer === 'function') return file.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
};

export const toRecord = async (file) => {
  const buffer = await readBuffer(file);
  return {
    buffer,
    name: file.name || 'borshch.jpg',
    type: file.type || 'image/jpeg',
    lastModified: file.lastModified || Date.now(),
  };
};

export const toFile = (rec) => {
  try {
    return new File([rec.buffer], rec.name, { type: rec.type, lastModified: rec.lastModified });
  } catch (e) {
    // very old WebKit had no File constructor
    const blob = new Blob([rec.buffer], { type: rec.type });
    blob.name = rec.name;
    blob.lastModified = rec.lastModified;
    return blob;
  }
};

/** In-memory store: the fallback, and the one the tests use. */
export const createMemoryPhotoStore = () => {
  const map = new Map();
  return {
    kind: 'memory',
    async put(id, files) { map.set(id, [...files]); },
    async get(id) { return [...(map.get(id) || [])]; },
    async remove(id) { map.delete(id); },
    async keys() { return [...map.keys()]; },
  };
};

const openDb = (indexedDB) => new Promise((resolve, reject) => {
  const req = indexedDB.open(DB_NAME, DB_VERSION);
  req.onupgradeneeded = () => {
    const db = req.result;
    if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
  };
  req.onsuccess = () => resolve(req.result);
  req.onerror = () => reject(req.error);
  req.onblocked = () => reject(new Error('indexedDB blocked'));
});

const run = (db, mode, fn) => new Promise((resolve, reject) => {
  const tx = db.transaction(STORE, mode);
  const store = tx.objectStore(STORE);
  let result;
  const req = fn(store);
  if (req) req.onsuccess = () => { result = req.result; };
  tx.oncomplete = () => resolve(result);
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error);
});

export const createIdbPhotoStore = (indexedDB) => {
  let dbPromise = null;
  const db = () => {
    if (!dbPromise) dbPromise = openDb(indexedDB);
    return dbPromise;
  };
  return {
    kind: 'indexeddb',
    async put(id, files) {
      // read every file before the transaction opens: an IndexedDB transaction
      // closes itself as soon as the code awaits anything that is not IDB
      const records = await Promise.all(files.map(toRecord));
      const d = await db();
      await run(d, 'readwrite', (s) => s.put(records, id));
    },
    async get(id) {
      const d = await db();
      const records = await run(d, 'readonly', (s) => s.get(id));
      return Array.isArray(records) ? records.map(toFile) : [];
    },
    async remove(id) {
      const d = await db();
      await run(d, 'readwrite', (s) => s.delete(id));
    },
    async keys() {
      const d = await db();
      const keys = await run(d, 'readonly', (s) => s.getAllKeys());
      return Array.isArray(keys) ? keys.map(String) : [];
    },
  };
};

/**
 * IndexedDB when it opens, memory when it does not. The first failed call
 * switches over for the rest of the tab instead of failing every time.
 */
const createDefaultStore = () => {
  const memory = createMemoryPhotoStore();
  const idb = typeof window !== 'undefined' && window.indexedDB
    ? createIdbPhotoStore(window.indexedDB)
    : null;
  let active = idb || memory;
  const call = (method) => async (...args) => {
    try {
      return await active[method](...args);
    } catch (e) {
      if (active === memory) throw e;
      console.warn('IndexedDB недоступна, фото миски тримаємо в памʼяті вкладки:', e);
      active = memory;
      return memory[method](...args);
    }
  };
  return {
    get kind() { return active.kind; },
    put: call('put'),
    get: call('get'),
    remove: call('remove'),
    keys: call('keys'),
  };
};

let store = null;

export const photoStore = () => {
  if (!store) store = createDefaultStore();
  return store;
};

/** Tests swap in a memory store; production never calls this. */
export const setPhotoStoreForTests = (next) => {
  store = next;
};
