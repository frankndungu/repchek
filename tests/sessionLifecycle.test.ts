import { describe, expect, it, vi } from "vitest";
import {
  acquireStartupResources,
  ActiveCheckpointWriter,
  AnimationLoop,
  canStartNewWorkout,
  CompletionTimer,
  restoreActiveWorkout,
  StartupGuard,
} from "../src/sessionLifecycle";
import { SessionTracker } from "../src/engine/session";
import type { ActiveWorkoutCheckpointInput } from "../src/storage/db";

function fakeStream(trackStop = vi.fn()): MediaStream {
  return {
    getTracks: () => [{ stop: trackStop }],
  } as unknown as MediaStream;
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
} {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

describe("startup lifecycle", () => {
  it("rejects a second start while camera or model initialization is pending", async () => {
    const guard = new StartupGuard();
    const cameraResult = deferred<MediaStream>();
    const modelResult = deferred<string>();
    const stream = fakeStream();
    const video = { srcObject: null as MediaProvider | null } as HTMLVideoElement;
    let cameraRequests = 0;
    let modelRequests = 0;
    let activations = 0;

    const start = async (): Promise<boolean> => {
      const attempt = guard.begin();
      if (attempt === null) return false;
      try {
        const resources = await acquireStartupResources(
          video,
          () => guard.isCurrent(attempt),
          async () => {
            cameraRequests += 1;
            const acquired = await cameraResult.promise;
            video.srcObject = acquired;
            return acquired;
          },
          async () => {
            modelRequests += 1;
            return modelResult.promise;
          },
          async () => null,
        );
        if (!resources || !guard.isCurrent(attempt)) return false;
        activations += 1;
        return true;
      } finally {
        guard.finish(attempt);
      }
    };

    const firstStart = start();
    expect(await start()).toBe(false);
    expect(cameraRequests).toBe(1);

    cameraResult.resolve(stream);
    await vi.waitFor(() => expect(modelRequests).toBe(1));
    expect(await start()).toBe(false);
    expect(modelRequests).toBe(1);

    modelResult.resolve("loaded model");
    expect(await firstStart).toBe(true);
    expect(activations).toBe(1);
  });

  it("releases the camera and leaves the session inactive when model startup fails", async () => {
    const stopTrack = vi.fn();
    const stream = fakeStream(stopTrack);
    const video = { srcObject: stream } as HTMLVideoElement;
    const startupGuard = new StartupGuard();
    const attempt = startupGuard.begin()!;
    const activateSession = vi.fn();
    const error = new Error("model initialization failed");

    const startup = acquireStartupResources(
      video,
      () => startupGuard.isCurrent(attempt),
      async () => stream,
      async () => {
        throw error;
      },
      async () => null,
    ).then((resources) => {
      if (resources) activateSession();
    });
    await expect(startup).rejects.toBe(error);

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(video.srcObject).toBeNull();
    expect(activateSession).not.toHaveBeenCalled();
  });

  it("cleans up an outdated attempt without touching a newer camera stream", async () => {
    const startupGuard = new StartupGuard();
    const oldAttempt = startupGuard.begin()!;
    const cameraResult = deferred<MediaStream>();
    const oldStop = vi.fn();
    const newStop = vi.fn();
    const oldStream = fakeStream(oldStop);
    const newStream = fakeStream(newStop);
    const video = { srcObject: null as MediaProvider | null } as HTMLVideoElement;
    const oldStartup = acquireStartupResources(
      video,
      () => startupGuard.isCurrent(oldAttempt),
      () => cameraResult.promise,
      async () => "old model",
      async () => null,
    );

    startupGuard.invalidate();
    const newAttempt = startupGuard.begin()!;
    video.srcObject = newStream;
    cameraResult.resolve(oldStream);

    await expect(oldStartup).resolves.toBeNull();
    expect(oldStop).toHaveBeenCalledOnce();
    expect(newStop).not.toHaveBeenCalled();
    expect(video.srcObject).toBe(newStream);
    expect(startupGuard.isCurrent(newAttempt)).toBe(true);
  });

  it("does not keep a stale frame loop alive across stop and restart", () => {
    let nextId = 0;
    const callbacks = new Map<number, FrameRequestCallback>();
    const cancelled: number[] = [];
    const loop = new AnimationLoop(
      (callback) => {
        const id = ++nextId;
        callbacks.set(id, callback);
        return id;
      },
      (id) => cancelled.push(id),
    );
    const oldFrame = vi.fn();
    const currentFrame = vi.fn();

    loop.start(oldFrame);
    const staleCallback = callbacks.get(1)!;
    loop.stop();
    loop.start(currentFrame);
    staleCallback(0);

    expect(cancelled).toEqual([1]);
    expect(oldFrame).not.toHaveBeenCalled();
    expect(currentFrame).not.toHaveBeenCalled();
    expect(callbacks.size).toBe(2);

    callbacks.get(2)!(16);
    expect(currentFrame).toHaveBeenCalledOnce();
    expect(nextId).toBe(3);

    loop.stop();
    callbacks.get(3)!(32);
    expect(currentFrame).toHaveBeenCalledOnce();
    expect(cancelled).toEqual([1, 3]);
  });
});

describe("automatic completion", () => {
  it("cancels a pending completion and allows only one delayed finish", () => {
    vi.useFakeTimers();
    try {
      const timer = new CompletionTimer();
      const finish = vi.fn();
      timer.scheduleOnce(finish, 1500);
      timer.scheduleOnce(finish, 1500);
      timer.clear();
      vi.advanceTimersByTime(1500);
      expect(finish).not.toHaveBeenCalled();

      timer.scheduleOnce(finish, 1500);
      vi.advanceTimersByTime(1500);
      expect(finish).toHaveBeenCalledOnce();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("active checkpoint autosaving", () => {
  const startedAt = new Date("2026-10-22T09:00:00.000Z");
  const id = startedAt.toISOString();

  function checkpointInput(
    tracker: SessionTracker,
  ): ActiveWorkoutCheckpointInput {
    return {
      version: 1,
      id,
      checkpoint: tracker.exportCheckpoint({ id, startedAt }),
      exerciseId: "push-up",
      exerciseName: "Push-up",
      target: { sets: 2, reps: 2 },
      weightKg: null,
      startedAt: id,
    };
  }

  it("creates the initial checkpoint only after startup resources resolve", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const writer = new ActiveCheckpointWriter(save, remove);
    const stream = fakeStream();
    const video = { srcObject: null as MediaProvider | null } as HTMLVideoElement;
    const resources = await acquireStartupResources(
      video,
      () => true,
      async () => {
        video.srcObject = stream;
        return stream;
      },
      async () => "estimator",
      async () => null,
    );

    if (resources) await writer.save(checkpointInput(new SessionTracker({ sets: 2, reps: 2 })));

    expect(save).toHaveBeenCalledOnce();
    expect(save.mock.calls[0][0].id).toBe(id);
    expect(remove).not.toHaveBeenCalled();
  });

  it("does not create a checkpoint when camera or model startup fails", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    const writer = new ActiveCheckpointWriter(save, vi.fn());
    const stream = fakeStream();
    const video = { srcObject: stream } as HTMLVideoElement;

    await expect(
      acquireStartupResources(
        video,
        () => true,
        async () => {
          throw new Error("camera failed");
        },
        async () => "estimator",
        async () => null,
      ),
    ).rejects.toThrow("camera failed");
    expect(save).not.toHaveBeenCalled();

    await expect(
      acquireStartupResources(
        video,
        () => true,
        async () => stream,
        async () => {
          throw new Error("model failed");
        },
        async () => null,
      ),
    ).rejects.toThrow("model failed");

    expect(save).not.toHaveBeenCalled();
  });

  it("writes committed rep, partial, and completed-set snapshots in order", async () => {
    const snapshots: ActiveWorkoutCheckpointInput[] = [];
    const writer = new ActiveCheckpointWriter(
      async (value) => {
        snapshots.push(structuredClone(value));
      },
      vi.fn().mockResolvedValue(undefined),
    );
    const tracker = new SessionTracker({ sets: 2, reps: 2 });
    const saveCommitted = () => writer.save(checkpointInput(tracker));

    await saveCommitted();
    tracker.onRepEvent({ type: "rep", count: 1, durationMs: 1000 }, [], 1000);
    await saveCommitted();
    tracker.onRepEvent({ type: "partial", count: 1, durationMs: 500 }, [], 1500);
    await saveCommitted();
    tracker.onRepEvent({ type: "rep", count: 2, durationMs: 1000 }, [], 3000);
    await saveCommitted();

    expect(snapshots.map((value) => value.checkpoint.currentReps.length)).toEqual([
      0, 1, 1, 0,
    ]);
    expect(snapshots[2].checkpoint.currentPartials).toBe(1);
    expect(snapshots[3].checkpoint.completed[0]).toMatchObject({
      set: 1,
      partials: 1,
      reps: [{ durationMs: 1000 }, { durationMs: 1000 }],
    });
  });

  it("serializes fast updates so a slower older write cannot finish last", async () => {
    const firstWrite = deferred<void>();
    const started: number[] = [];
    const writer = new ActiveCheckpointWriter(
      async (value) => {
        started.push(value.checkpoint.currentReps.length);
        if (started.length === 1) await firstWrite.promise;
      },
      vi.fn().mockResolvedValue(undefined),
    );
    const tracker = new SessionTracker({ sets: 2, reps: 2 });
    const first = writer.save(checkpointInput(tracker));
    tracker.onRepEvent({ type: "rep", count: 1, durationMs: 1000 }, [], 1000);
    const second = writer.save(checkpointInput(tracker));

    await Promise.resolve();
    expect(started).toEqual([0]);
    firstWrite.resolve();
    await Promise.all([first, second]);

    expect(started).toEqual([0, 1]);
  });

  it("reports a failed checkpoint write and continues with later updates", async () => {
    const failure = new Error("storage unavailable");
    const save = vi
      .fn()
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(undefined);
    const writer = new ActiveCheckpointWriter(save, vi.fn());
    const tracker = new SessionTracker({ sets: 2, reps: 2 });
    const first = writer.save(checkpointInput(tracker));
    await expect(first).rejects.toBe(failure);
    await expect(writer.save(checkpointInput(tracker))).resolves.toBeUndefined();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("saves the completed session before deleting its checkpoint", async () => {
    const events: string[] = [];
    const writer = new ActiveCheckpointWriter(
      vi.fn().mockResolvedValue(undefined),
      async () => {
        events.push("delete");
      },
    );

    await writer.complete(id, async () => {
      events.push("save");
    });

    expect(events).toEqual(["save", "delete"]);
  });

  it("drains pending checkpoint writes before saving the completed session", async () => {
    const write = deferred<void>();
    const events: string[] = [];
    const tracker = new SessionTracker({ sets: 2, reps: 2 });
    const writer = new ActiveCheckpointWriter(
      async () => {
        events.push("checkpoint-start");
        await write.promise;
        events.push("checkpoint-finish");
      },
      async () => {
        events.push("delete");
      },
    );
    void writer.save(checkpointInput(tracker));
    const completing = writer.complete(id, async () => {
      events.push("session-save");
    });

    await Promise.resolve();
    expect(events).toEqual(["checkpoint-start"]);
    write.resolve();
    await completing;

    expect(events).toEqual([
      "checkpoint-start",
      "checkpoint-finish",
      "session-save",
      "delete",
    ]);
  });

  it("keeps the checkpoint when saving the completed session fails", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    const writer = new ActiveCheckpointWriter(vi.fn(), remove);

    await expect(
      writer.complete(id, async () => {
        throw new Error("completed session save failed");
      }),
    ).rejects.toThrow("completed session save failed");
    expect(remove).not.toHaveBeenCalled();
  });

  it("restores a valid workout's identity, metadata, and committed progress", () => {
    const tracker = new SessionTracker({ sets: 3, reps: 4 });
    tracker.onRepEvent({ type: "rep", count: 1, durationMs: 900 }, ["fault"], 1000);
    tracker.onRepEvent({ type: "partial", count: 1, durationMs: 400 }, [], 1400);
    const checkpoint = {
      version: 1 as const,
      id,
      checkpoint: tracker.exportCheckpoint({ id, startedAt }),
      exerciseId: "push-up",
      exerciseName: "Push-up",
      target: { sets: 3, reps: 4 },
      weightKg: 2.5,
      startedAt: id,
      updatedAt: id,
    };

    const restored = restoreActiveWorkout(checkpoint);
    restored.session.onRepEvent(
      { type: "rep", count: 2, durationMs: 950 },
      [],
      2000,
    );

    expect(restored.startedAt).toEqual(startedAt);
    expect(restored.target).toEqual({ sets: 3, reps: 4 });
    expect(restored.weightKg).toBe(2.5);
    expect(restored.session.reps).toBe(2);
    expect(restored.session.records).toHaveLength(0);
    expect(restored.session.exportCheckpoint({ id, startedAt }).currentPartials).toBe(1);
  });

  it("does not allow a new workout until recovery lookup finds no checkpoints", () => {
    expect(canStartNewWorkout(false, 0)).toBe(false);
    expect(canStartNewWorkout(true, 1)).toBe(false);
    expect(canStartNewWorkout(true, 0)).toBe(true);
  });
});
