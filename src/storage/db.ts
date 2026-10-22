import {
  SessionTracker,
  type SessionCheckpoint,
  type SessionRecord,
  type SetTarget,
} from "../engine/session";

const DB_NAME = "repchek";
const DB_VERSION = 2;
const SESSIONS_STORE = "sessions";
const ACTIVE_CHECKPOINTS_STORE = "active-checkpoints";

export interface ActiveWorkoutCheckpoint {
  version: 1;
  id: string;
  checkpoint: SessionCheckpoint;
  exerciseId: string;
  exerciseName: string;
  target: SetTarget;
  weightKg: number | null;
  startedAt: string;
  updatedAt: string;
}

export type ActiveWorkoutCheckpointInput = Omit<
  ActiveWorkoutCheckpoint,
  "updatedAt"
>;

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
      if (!db.objectStoreNames.contains(SESSIONS_STORE)) {
        const store = db.createObjectStore(SESSIONS_STORE, { keyPath: "id" });
        store.createIndex("startedAt", "startedAt");
      }
      if (!db.objectStoreNames.contains(ACTIVE_CHECKPOINTS_STORE)) {
        db.createObjectStore(ACTIVE_CHECKPOINTS_STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function transaction<T>(
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  return openDb().then(async (db) => {
    try {
      const tx = db.transaction(storeName, mode);
      const completed = new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onabort = () =>
          reject(tx.error ?? new Error("IndexedDB transaction aborted"));
        tx.onerror = () =>
          reject(tx.error ?? new Error("IndexedDB transaction failed"));
      });
      const result = await Promise.all([run(tx.objectStore(storeName)), completed]);
      return result[0];
    } finally {
      db.close();
    }
  });
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isIsoTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString() === value
  );
}

function isSetTarget(value: unknown): value is SetTarget {
  return (
    isObject(value) &&
    typeof value.sets === "number" &&
    Number.isSafeInteger(value.sets) &&
    value.sets >= 1 &&
    typeof value.reps === "number" &&
    Number.isSafeInteger(value.reps) &&
    value.reps >= 1
  );
}

function isWeight(value: unknown): value is number | null {
  return (
    value === null ||
    (typeof value === "number" && Number.isFinite(value) && value >= 0)
  );
}

function validateActiveCheckpoint(
  value: unknown,
): ActiveWorkoutCheckpoint {
  if (!isObject(value) || value.version !== 1) {
    throw new TypeError("Unsupported or invalid active checkpoint version");
  }
  if (
    typeof value.id !== "string" ||
    !value.id ||
    typeof value.exerciseId !== "string" ||
    !value.exerciseId.trim() ||
    typeof value.exerciseName !== "string" ||
    !value.exerciseName.trim() ||
    !isIsoTimestamp(value.startedAt) ||
    !isIsoTimestamp(value.updatedAt) ||
    !isSetTarget(value.target) ||
    !isWeight(value.weightKg)
  ) {
    throw new TypeError("Active workout checkpoint metadata is invalid");
  }

  const rawCheckpoint = value.checkpoint;
  if (
    !isObject(rawCheckpoint) ||
    typeof rawCheckpoint.id !== "string" ||
    typeof rawCheckpoint.startedAt !== "string"
  ) {
    throw new TypeError("Active workout checkpoint data is invalid");
  }
  if (
    value.id !== rawCheckpoint.id ||
    value.startedAt !== rawCheckpoint.startedAt ||
    !isSetTarget(rawCheckpoint.target) ||
    value.target.sets !== rawCheckpoint.target.sets ||
    value.target.reps !== rawCheckpoint.target.reps
  ) {
    throw new TypeError("Active workout checkpoint metadata does not match");
  }

  const restored = SessionTracker.restoreCheckpoint(rawCheckpoint);
  const validatedCheckpoint = restored.exportCheckpoint({
    id: rawCheckpoint.id,
    startedAt: new Date(rawCheckpoint.startedAt),
  });
  return {
    version: 1,
    id: value.id,
    checkpoint: validatedCheckpoint,
    exerciseId: value.exerciseId,
    exerciseName: value.exerciseName,
    target: { ...value.target },
    weightKg: value.weightKg,
    startedAt: value.startedAt,
    updatedAt: value.updatedAt,
  };
}

export async function saveSession(record: SessionRecord): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, "readwrite");
  await request(tx.objectStore(SESSIONS_STORE).put(record));
  db.close();
}

export async function listSessions(): Promise<SessionRecord[]> {
  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, "readonly");
  const all = await request(tx.objectStore(SESSIONS_STORE).getAll());
  db.close();
  return all.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function clearSessions(): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(SESSIONS_STORE, "readwrite");
  await request(tx.objectStore(SESSIONS_STORE).clear());
  db.close();
}

export async function saveActiveWorkoutCheckpoint(
  value: ActiveWorkoutCheckpointInput,
): Promise<ActiveWorkoutCheckpoint> {
  const validated = validateActiveCheckpoint({
    ...value,
    updatedAt: new Date().toISOString(),
  });
  await transaction(ACTIVE_CHECKPOINTS_STORE, "readwrite", (store) =>
    request(store.put(validated)).then(() => undefined),
  );
  return validated;
}

export async function getActiveWorkoutCheckpoint(
  id: string,
): Promise<ActiveWorkoutCheckpoint | null> {
  if (typeof id !== "string") {
    throw new TypeError("Active workout checkpoint ID is required");
  }
  const stored = await transaction<unknown>(
    ACTIVE_CHECKPOINTS_STORE,
    "readonly",
    (store) => request(store.get(id)),
  );
  return stored === undefined ? null : validateActiveCheckpoint(stored);
}

export async function listActiveWorkoutCheckpointIds(): Promise<string[]> {
  const keys = await transaction<IDBValidKey[]>(
    ACTIVE_CHECKPOINTS_STORE,
    "readonly",
    (store) => request(store.getAllKeys()),
  );
  if (!keys.every((key): key is string => typeof key === "string")) {
    throw new TypeError("Active workout checkpoint IDs are invalid");
  }
  return keys;
}

export async function deleteActiveWorkoutCheckpoint(id: string): Promise<void> {
  if (typeof id !== "string") {
    throw new TypeError("Active workout checkpoint ID is required");
  }
  await transaction(ACTIVE_CHECKPOINTS_STORE, "readwrite", (store) =>
    request(store.delete(id)).then(() => undefined),
  );
}
