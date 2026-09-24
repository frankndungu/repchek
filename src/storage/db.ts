import type { SessionRecord } from "../engine/session";

const DB_NAME = "morgan";
const DB_VERSION = 1;
const STORE = "sessions";

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt");
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  await request(tx.objectStore(STORE).put(record));
  db.close();
}

export async function listSessions(): Promise<SessionRecord[]> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readonly");
  const all = await request(tx.objectStore(STORE).getAll());
  db.close();
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function clearSessions(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE, "readwrite");
  await request(tx.objectStore(STORE).clear());
  db.close();
}
