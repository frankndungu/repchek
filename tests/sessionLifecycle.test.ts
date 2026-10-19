import { describe, expect, it, vi } from "vitest";
import {
  acquireStartupResources,
  AnimationLoop,
  CompletionTimer,
  StartupGuard,
} from "../src/sessionLifecycle";

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
