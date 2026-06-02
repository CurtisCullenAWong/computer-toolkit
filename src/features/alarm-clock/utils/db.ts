const DB_NAME = "AlarmAudioDB";
const STORE_NAME = "audioFiles";
const DB_VERSION = 1;

export interface AudioFile {
  id: string;
  name: string;
  blob: Blob;
  addedAt: number;
}

// ─── Singleton DB connection ──────────────────────────────────────────────────
// Re-using a single IDBDatabase connection avoids the overhead of opening a
// new connection on every read/write operation.
let _dbPromise: Promise<IDBDatabase> | null = null;

export function openDB(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => {
      _dbPromise = null; // allow retry on next call
      reject(request.error);
    };
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
  return _dbPromise;
}

// ─── Object URL cache ─────────────────────────────────────────────────────────
// Keeps one live object URL per audio file ID so we don't create a new URL
// every time a sound is previewed or played by an alarm.
const _urlCache = new Map<string, string>();

/** Returns a cached object URL for the given AudioFile, creating one if needed. */
export function getCachedObjectUrl(file: AudioFile): string {
  const existing = _urlCache.get(file.id);
  if (existing) return existing;
  const url = URL.createObjectURL(file.blob);
  _urlCache.set(file.id, url);
  return url;
}

/**
 * Revokes and removes the cached object URL for the given ID.
 * Call this only when the file itself is being deleted.
 */
export function revokeCachedObjectUrl(id: string): void {
  const url = _urlCache.get(id);
  if (url) {
    URL.revokeObjectURL(url);
    _urlCache.delete(id);
  }
}

export async function saveAudioFile(file: File): Promise<AudioFile> {
  const db = await openDB();
  const id = crypto.randomUUID();
  const audioFile: AudioFile = {
    id,
    name: file.name,
    blob: file,
    addedAt: Date.now(),
  };

  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.put(audioFile);
    request.onsuccess = () => resolve(audioFile);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllAudioFiles(): Promise<AudioFile[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteAudioFile(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
