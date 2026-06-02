const DB_NAME = "AlarmAudioDB";
const STORE_NAME = "audioFiles";
const DB_VERSION = 1;

export interface AudioFile {
  id: string;
  name: string;
  blob: Blob;
  addedAt: number;
}

export function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
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
