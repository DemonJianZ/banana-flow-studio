const DB_NAME = "bananaflow_asset_library";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const STORE_KEY = "asset_library_store";

const createEmptyAssetLibraryStore = () => ({
  drafts: [],
  works: [],
  workVersions: [],
  assets: [],
  personas: [],
});

const openDb = () =>
  new Promise((resolve, reject) => {
    if (typeof window === "undefined" || !window.indexedDB) {
      reject(new Error("IndexedDB is not available"));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });

const withStore = async (mode, handler) => {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, mode);
    const store = tx.objectStore(STORE_NAME);
    let settled = false;
    const safeResolve = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const safeReject = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    tx.onerror = () => safeReject(tx.error || new Error("IndexedDB transaction failed"));
    tx.oncomplete = () => {
      db.close();
    };
    Promise.resolve(handler(store, safeResolve, safeReject)).catch(safeReject);
  });
};

export async function loadAssetLibraryDbStore() {
  try {
    return await withStore("readonly", (store, resolve) => {
      const request = store.get(STORE_KEY);
      request.onerror = () => resolve(createEmptyAssetLibraryStore());
      request.onsuccess = () => {
        const value = request.result;
        if (!value || typeof value !== "object") {
          resolve(createEmptyAssetLibraryStore());
          return;
        }
        resolve({
          drafts: Array.isArray(value.drafts) ? value.drafts : [],
          works: Array.isArray(value.works) ? value.works : [],
          workVersions: Array.isArray(value.workVersions) ? value.workVersions : [],
          assets: Array.isArray(value.assets) ? value.assets : [],
          personas: Array.isArray(value.personas) ? value.personas : [],
        });
      };
    });
  } catch {
    return createEmptyAssetLibraryStore();
  }
}

export async function saveAssetLibraryDbStore(storeValue) {
  const payload =
    storeValue && typeof storeValue === "object"
      ? {
          drafts: Array.isArray(storeValue.drafts) ? storeValue.drafts : [],
          works: Array.isArray(storeValue.works) ? storeValue.works : [],
          workVersions: Array.isArray(storeValue.workVersions) ? storeValue.workVersions : [],
          assets: Array.isArray(storeValue.assets) ? storeValue.assets : [],
          personas: Array.isArray(storeValue.personas) ? storeValue.personas : [],
        }
      : createEmptyAssetLibraryStore();
  await withStore("readwrite", (store, resolve, reject) => {
    const request = store.put(payload, STORE_KEY);
    request.onerror = () => reject(request.error || new Error("Failed to save asset library store"));
    request.onsuccess = () => resolve(payload);
  });
}

export async function migrateAssetLibraryLocalStorage(getLegacyStore) {
  const current = await loadAssetLibraryDbStore();
  if (
    (current.drafts && current.drafts.length > 0) ||
    (current.works && current.works.length > 0) ||
    (current.assets && current.assets.length > 0) ||
    (current.personas && current.personas.length > 0)
  ) {
    return current;
  }
  const legacy = typeof getLegacyStore === "function" ? getLegacyStore() : createEmptyAssetLibraryStore();
  if (
    (legacy.drafts && legacy.drafts.length > 0) ||
    (legacy.works && legacy.works.length > 0) ||
    (legacy.assets && legacy.assets.length > 0) ||
    (legacy.personas && legacy.personas.length > 0)
  ) {
    await saveAssetLibraryDbStore(legacy);
    return legacy;
  }
  return current;
}

export { createEmptyAssetLibraryStore };
