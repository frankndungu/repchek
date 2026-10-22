import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionTracker, type SessionRecord } from "../src/engine/session";
import { acquireStartupResources } from "../src/sessionLifecycle";
import {
  deleteActiveWorkoutCheckpoint,
  getActiveWorkoutCheckpoint,
  listActiveWorkoutCheckpointIds,
  listSessions,
  saveActiveWorkoutCheckpoint,
  saveSession,
  type ActiveWorkoutCheckpointInput,
} from "../src/storage/db";

const DB_NAME = "repchek";
const SESSIONS_STORE = "sessions";
const CHECKPOINTS_STORE = "active-checkpoints";
const startedAt = "2026-10-22T09:00:00.000Z";
const checkpoint = new SessionTracker({ sets: 3, reps: 8 }).exportCheckpoint({
  id: startedAt,
  startedAt: new Date(startedAt),
});

function input(
  overrides: Partial<ActiveWorkoutCheckpointInput> = {},
): ActiveWorkoutCheckpointInput {
  return {
    version: 1,
    id: startedAt,
    checkpoint,
    exerciseId: "push-up",
    exerciseName: "Push-up",
    target: { sets: 3, reps: 8 },
    weightKg: null,
    startedAt,
    ...overrides,
  };
}

function sessionRecord(id: string): SessionRecord {
  return {
    id,
    exerciseId: "push-up",
    exerciseName: "Push-up",
    startedAt: id,
    endedAt: id,
    target: { sets: 1, reps: 1 },
    weightKg: null,
    sets: [{ set: 1, reps: [{ durationMs: 1000, faults: [], atMs: 0 }], partials: 0 }],
  };
}

class FakeRequest<T = unknown> {
  result!: T;
  error: DOMException | null = null;
  onsuccess: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  transaction: FakeTransaction | null = null;
}

class FakeStore {
  constructor(
    private readonly records: Map<IDBValidKey, unknown>,
    private readonly tx: FakeTransaction,
    private readonly factory: FakeIndexedDB,
  ) {}

  createIndex(): void {}

  put(value: unknown): IDBRequest<IDBValidKey> {
    return this.run(() => {
      const error = this.factory.takeWriteError();
      if (error) throw error;
      if (!value || typeof value !== "object" || !("id" in value)) {
        throw new DOMException("Missing key path", "DataError");
      }
      const id = (value as { id: IDBValidKey }).id;
      this.records.set(id, structuredClone(value));
      return id;
    });
  }

  get(key: IDBValidKey): IDBRequest {
    return this.run(() => {
      const value = this.records.get(key);
      return value === undefined ? undefined : structuredClone(value);
    });
  }

  getAllKeys(): IDBRequest<IDBValidKey[]> {
    return this.run(() => [...this.records.keys()]);
  }

  delete(key: IDBValidKey): IDBRequest<undefined> {
    return this.run(() => {
      this.records.delete(key);
      return undefined;
    });
  }

  getAll(): IDBRequest {
    return this.run(() => [...this.records.values()].map((value) => structuredClone(value)));
  }

  clear(): IDBRequest<undefined> {
    return this.run(() => {
      this.records.clear();
      return undefined;
    });
  }

  private run<T>(operation: () => T): IDBRequest<T> {
    const request = new FakeRequest<T>();
    request.transaction = this.tx;
    queueMicrotask(() => {
      try {
        request.result = operation();
        request.onsuccess?.(new Event("success"));
        this.tx.complete();
      } catch (err) {
        request.error =
          err instanceof DOMException
            ? err
            : new DOMException(String(err), "UnknownError");
        request.onerror?.(new Event("error"));
        this.tx.fail(request.error);
      }
    });
    return request as unknown as IDBRequest<T>;
  }
}

class FakeTransaction {
  error: DOMException | null = null;
  oncomplete: ((event: Event) => void) | null = null;
  onabort: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  private completed = false;

  constructor(
    private readonly stores: Map<string, Map<IDBValidKey, unknown>>,
    private readonly factory: FakeIndexedDB,
  ) {}

  objectStore(name: string): IDBObjectStore {
    const store = this.stores.get(name);
    if (!store) throw new DOMException("Object store not found", "NotFoundError");
    return new FakeStore(store, this, this.factory) as unknown as IDBObjectStore;
  }

  complete(): void {
    if (this.completed) return;
    this.completed = true;
    queueMicrotask(() => this.oncomplete?.(new Event("complete")));
  }

  fail(error: DOMException): void {
    if (this.completed) return;
    this.error = error;
    this.completed = true;
    queueMicrotask(() => {
      this.onerror?.(new Event("error"));
      this.onabort?.(new Event("abort"));
    });
  }
}

class FakeDatabase {
  objectStoreNames: DOMStringList;

  constructor(
    public version: number,
    private readonly stores: Map<string, Map<IDBValidKey, unknown>>,
    private readonly factory: FakeIndexedDB,
  ) {
    this.objectStoreNames = {
      contains: (name: string) => stores.has(name),
      item: (index: number) => [...stores.keys()][index] ?? null,
      get length() {
        return stores.size;
      },
    } as DOMStringList;
  }

  createObjectStore(
    name: string,
    _options?: IDBObjectStoreParameters,
  ): IDBObjectStore {
    const records = new Map<IDBValidKey, unknown>();
    this.stores.set(name, records);
    return new FakeStore(
      records,
      new FakeTransaction(this.stores, this.factory),
      this.factory,
    ) as unknown as IDBObjectStore;
  }

  transaction(
    _storeNames: string | string[],
    _mode?: IDBTransactionMode,
  ): IDBTransaction {
    return new FakeTransaction(this.stores, this.factory) as unknown as IDBTransaction;
  }

  close(): void {}
}

class FakeIndexedDB {
  private databases = new Map<
    string,
    { version: number; stores: Map<string, Map<IDBValidKey, unknown>> }
  >();
  private nextWriteError: DOMException | null = null;

  readonly indexedDB = {
    open: (name: string, version?: number): IDBOpenDBRequest => {
      const request = new FakeRequest<FakeDatabase>();
      queueMicrotask(() => {
        try {
          let state = this.databases.get(name);
          if (!state) {
            state = { version: 0, stores: new Map() };
            this.databases.set(name, state);
          }
          const requestedVersion = version ?? state.version;
          if (requestedVersion < state.version) {
            throw new DOMException("VersionError", "VersionError");
          }
          const database = new FakeDatabase(
            requestedVersion,
            state.stores,
            this,
          );
          request.result = database;
          if (requestedVersion > state.version) {
            state.version = requestedVersion;
            (request as FakeRequest & {
              onupgradeneeded?: (event: Event) => void;
            }).onupgradeneeded?.(new Event("upgradeneeded"));
          }
          request.onsuccess?.(new Event("success"));
        } catch (err) {
          request.error =
            err instanceof DOMException
              ? err
              : new DOMException(String(err), "UnknownError");
          request.onerror?.(new Event("error"));
        }
      });
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;

  seed(
    name: string,
    version: number,
    stores: Record<string, unknown[]> = {},
  ): void {
    this.databases.set(name, {
      version,
      stores: new Map(
        Object.entries(stores).map(([storeName, values]) => [
          storeName,
          new Map(
            values.map((value) => [
              (value as { id: IDBValidKey }).id,
              structuredClone(value),
            ]),
          ),
        ]),
      ),
    });
  }

  storeSize(name: string, storeName: string): number {
    return this.databases.get(name)?.stores.get(storeName)?.size ?? 0;
  }

  failNextWrite(error = new DOMException("Write failed", "QuotaExceededError")): void {
    this.nextWriteError = error;
  }

  takeWriteError(): DOMException | null {
    const error = this.nextWriteError;
    this.nextWriteError = null;
    return error;
  }
}

let fakeDb: FakeIndexedDB;

function useDatabase(): FakeIndexedDB {
  fakeDb = new FakeIndexedDB();
  vi.stubGlobal("indexedDB", fakeDb.indexedDB);
  return fakeDb;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("active workout checkpoint storage", () => {
  it("saves and retrieves a validated checkpoint", async () => {
    useDatabase();

    const saved = await saveActiveWorkoutCheckpoint(input());
    const loaded = await getActiveWorkoutCheckpoint(saved.id);

    expect(loaded).toEqual(saved);
    expect(saved.updatedAt).toBe(new Date(saved.updatedAt).toISOString());
    expect(fakeDb.storeSize(DB_NAME, CHECKPOINTS_STORE)).toBe(1);
    expect(await listActiveWorkoutCheckpointIds()).toEqual([startedAt]);
  });

  it("returns no IDs when there are no active checkpoints", async () => {
    useDatabase();
    await expect(listActiveWorkoutCheckpointIds()).resolves.toEqual([]);
  });

  it("keeps a saved checkpoint available when camera or model startup fails", async () => {
    useDatabase();
    await saveActiveWorkoutCheckpoint(input());
    const stream = {
      getTracks: () => [{ stop: vi.fn() }],
    } as unknown as MediaStream;
    const video = { srcObject: stream } as HTMLVideoElement;

    await expect(
      acquireStartupResources(
        video,
        () => true,
        async () => stream,
        async () => {
          throw new Error("model startup failed");
        },
        async () => null,
      ),
    ).rejects.toThrow("model startup failed");

    await expect(getActiveWorkoutCheckpoint(startedAt)).resolves.toMatchObject({
      id: startedAt,
    });
  });

  it("updates an existing checkpoint with the same stable ID", async () => {
    useDatabase();

    await saveActiveWorkoutCheckpoint(input());
    const updated = await saveActiveWorkoutCheckpoint(
      input({ exerciseName: "Push-up (front)" }),
    );

    expect(fakeDb.storeSize(DB_NAME, CHECKPOINTS_STORE)).toBe(1);
    expect(await getActiveWorkoutCheckpoint(startedAt)).toEqual(updated);
    expect(updated.exerciseName).toBe("Push-up (front)");
  });

  it("deletes an active checkpoint without affecting completed sessions", async () => {
    useDatabase();
    await saveSession(sessionRecord("2026-10-20T09:00:00.000Z"));
    await saveActiveWorkoutCheckpoint(input());

    await deleteActiveWorkoutCheckpoint(startedAt);

    expect(await getActiveWorkoutCheckpoint(startedAt)).toBeNull();
    expect(await listSessions()).toEqual([
      sessionRecord("2026-10-20T09:00:00.000Z"),
    ]);
  });

  it("preserves existing completed sessions when upgrading database version 1", async () => {
    const previous = sessionRecord("2026-10-20T09:00:00.000Z");
    const database = useDatabase();
    database.seed(DB_NAME, 1, { [SESSIONS_STORE]: [previous] });

    await saveActiveWorkoutCheckpoint(input());

    expect(await listSessions()).toEqual([previous]);
    expect(database.storeSize(DB_NAME, SESSIONS_STORE)).toBe(1);
    expect(database.storeSize(DB_NAME, CHECKPOINTS_STORE)).toBe(1);
  });

  it("rejects malformed or metadata-inconsistent checkpoints before saving", async () => {
    useDatabase();

    await expect(
      saveActiveWorkoutCheckpoint(input({ target: { sets: 4, reps: 8 } })),
    ).rejects.toThrow(/match/i);
    expect(fakeDb.storeSize(DB_NAME, CHECKPOINTS_STORE)).toBe(0);
  });

  it("rejects unsupported checkpoint versions retrieved from IndexedDB", async () => {
    const database = useDatabase();
    database.seed(DB_NAME, 2, {
      [CHECKPOINTS_STORE]: [
        {
          ...input(),
          updatedAt: startedAt,
          version: 2,
        },
      ],
    });

    await expect(getActiveWorkoutCheckpoint(startedAt)).rejects.toThrow();
  });

  it("rejects corrupted tracker checkpoints retrieved from IndexedDB", async () => {
    const database = useDatabase();
    database.seed(DB_NAME, 2, {
      [CHECKPOINTS_STORE]: [
        {
          ...input(),
          updatedAt: startedAt,
          checkpoint: { ...checkpoint, version: 99 },
        },
      ],
    });

    await expect(getActiveWorkoutCheckpoint(startedAt)).rejects.toThrow();
  });

  it("allows discarding a corrupted record with an empty key", async () => {
    const database = useDatabase();
    database.seed(DB_NAME, 2, {
      [CHECKPOINTS_STORE]: [{ ...input(), id: "" }],
    });

    expect(await listActiveWorkoutCheckpointIds()).toEqual([""]);
    await expect(getActiveWorkoutCheckpoint("")).rejects.toThrow();
    await deleteActiveWorkoutCheckpoint("");
    expect(await listActiveWorkoutCheckpointIds()).toEqual([]);
  });

  it("propagates IndexedDB write failures", async () => {
    const database = useDatabase();
    database.failNextWrite();

    await expect(saveActiveWorkoutCheckpoint(input())).rejects.toThrow();
    expect(database.storeSize(DB_NAME, CHECKPOINTS_STORE)).toBe(0);
  });
});
