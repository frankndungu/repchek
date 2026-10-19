import { stopCameraStream } from "./camera";

export class StartupGuard {
  private generation = 0;
  private starting = false;

  begin(): number | null {
    if (this.starting) return null;
    this.starting = true;
    this.generation += 1;
    return this.generation;
  }

  isCurrent(attempt: number): boolean {
    return this.generation === attempt;
  }

  finish(attempt: number): boolean {
    if (!this.starting || !this.isCurrent(attempt)) return false;
    this.starting = false;
    return true;
  }

  invalidate(): void {
    this.generation += 1;
    this.starting = false;
  }
}

export class AnimationLoop {
  private frameId: number | null = null;
  private generation = 0;
  private readonly requestFrame: (
    callback: FrameRequestCallback,
  ) => number;
  private readonly cancelFrame: (id: number) => void;

  constructor(
    requestFrame: (callback: FrameRequestCallback) => number,
    cancelFrame: (id: number) => void,
  ) {
    this.requestFrame = requestFrame;
    this.cancelFrame = cancelFrame;
  }

  start(frame: () => void): void {
    this.stop();
    const generation = ++this.generation;
    const tick: FrameRequestCallback = () => {
      if (generation !== this.generation) return;
      this.frameId = null;
      frame();
      if (generation === this.generation) {
        this.frameId = this.requestFrame(tick);
      }
    };
    this.frameId = this.requestFrame(tick);
  }

  stop(): void {
    this.generation += 1;
    if (this.frameId !== null) this.cancelFrame(this.frameId);
    this.frameId = null;
  }
}

export class CompletionTimer {
  private timerId: ReturnType<typeof globalThis.setTimeout> | null = null;
  private readonly schedule: typeof globalThis.setTimeout;
  private readonly cancel: typeof globalThis.clearTimeout;

  constructor(
    schedule: typeof globalThis.setTimeout =
      globalThis.setTimeout.bind(globalThis),
    cancel: typeof globalThis.clearTimeout =
      globalThis.clearTimeout.bind(globalThis),
  ) {
    this.schedule = schedule;
    this.cancel = cancel;
  }

  scheduleOnce(callback: () => void, delay: number): void {
    if (this.timerId !== null) return;
    this.timerId = this.schedule(() => {
      this.timerId = null;
      callback();
    }, delay);
  }

  clear(): void {
    if (this.timerId === null) return;
    this.cancel(this.timerId);
    this.timerId = null;
  }
}

export function releaseWakeLock(wakeLock: WakeLockSentinel | null): void {
  if (!wakeLock) return;
  try {
    void wakeLock.release().catch((err) => {
      console.warn("Could not release the screen wake lock", err);
    });
  } catch (err) {
    console.warn("Could not release the screen wake lock", err);
  }
}

export interface StartupResources<T> {
  stream: MediaStream;
  estimator: T;
  wakeLock: WakeLockSentinel | null;
}

export async function acquireStartupResources<T>(
  video: HTMLVideoElement,
  isCurrent: () => boolean,
  acquireCamera: () => Promise<MediaStream>,
  loadEstimator: () => Promise<T>,
  acquireWakeLock: () => Promise<WakeLockSentinel | null>,
  onCameraReady: () => void = () => {},
): Promise<StartupResources<T> | null> {
  let stream: MediaStream | null = null;
  let wakeLock: WakeLockSentinel | null = null;

  const release = () => {
    if (stream) {
      stopCameraStream(video, stream);
      stream = null;
    }
    if (wakeLock) {
      releaseWakeLock(wakeLock);
      wakeLock = null;
    }
  };

  try {
    stream = await acquireCamera();
    if (!isCurrent()) {
      release();
      return null;
    }

    onCameraReady();
    const estimator = await loadEstimator();
    if (!isCurrent()) {
      release();
      return null;
    }

    wakeLock = await acquireWakeLock();
    if (!isCurrent()) {
      release();
      return null;
    }

    const resources = { stream, estimator, wakeLock };
    stream = null;
    wakeLock = null;
    return resources;
  } catch (err) {
    release();
    throw err;
  }
}

export function releaseStartupResources(
  video: HTMLVideoElement,
  resources: StartupResources<unknown>,
): void {
  stopCameraStream(video, resources.stream);
  releaseWakeLock(resources.wakeLock);
}
