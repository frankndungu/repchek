// Debug capture for tuning exercises on real sets. Off for everyone unless
// someone opens the app once with ?debug=1. When on, a set is recorded two
// ways: the numbers the engine saw on every frame (enough to replay the
// counting offline), and the raw camera video with nothing drawn on it.
// Nothing is sent anywhere. The person chooses to share the files.

import type { FrameMetrics, Landmark } from "./engine/types";

export const DEBUG_KEY = "repchek.debug";

// "?debug=1" turns it on, "?debug=0" turns it off, anything else leaves it.
export function parseDebugParam(search: string): "on" | "off" | null {
  const value = new URLSearchParams(search).get("debug");
  if (value === "1") return "on";
  if (value === "0") return "off";
  return null;
}

export function debugModeOn(): boolean {
  try {
    return localStorage.getItem(DEBUG_KEY) === "on";
  } catch {
    return false;
  }
}

// Reads the address once at startup, saves the choice, and takes the
// parameter out of the address bar.
export function applyDebugParam(): void {
  const choice = parseDebugParam(window.location.search);
  if (!choice) return;
  try {
    if (choice === "on") localStorage.setItem(DEBUG_KEY, "on");
    else localStorage.removeItem(DEBUG_KEY);
  } catch {
    // Storage blocked: debug mode just stays off.
  }
  const url = new URL(window.location.href);
  url.searchParams.delete("debug");
  window.history.replaceState(null, "", url.toString());
}

// --- Numbers ---------------------------------------------------------------

// The landmarks worth keeping: nose, ears, shoulders, elbows, wrists, hips,
// knees, ankles, heels and toes. x, y, visibility for each, three decimals.
const KEPT = [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32];

export function packLandmarks(landmarks: Landmark[]): number[] {
  const out: number[] = [];
  for (const i of KEPT) {
    const p = landmarks[i];
    out.push(round(p.x, 3), round(p.y, 3), round(p.visibility, 2));
  }
  return out;
}

const METRICS: (keyof FrameMetrics)[] = [
  "elbowAngle",
  "leftElbow",
  "rightElbow",
  "torsoAngle",
  "neckAngle",
  "barOffset",
  "hipAngle",
  "kneeAngle",
  "kneeDrive",
  "hipDrop",
  "shoulderTilt",
  "wristRise",
  "forearmTilt",
  "upperArmTilt",
];

export function packMetrics(m: FrameMetrics): Record<string, number> {
  const out: Record<string, number> = {};
  for (const name of METRICS) out[name] = round(m[name], 2);
  return out;
}

export function round(value: number, places: number): number {
  const f = 10 ** places;
  return Math.round(value * f) / f;
}

export type FrameRow = Record<string, unknown>;

// Ten minutes at 30 frames a second. A phone left running stops recording
// instead of filling its memory.
const MAX_ROWS = 18_000;

export class DiagnosticLog {
  readonly rows: FrameRow[] = [];
  meta: Record<string, unknown> = {};
  marks: Record<string, number> = {};
  private t0 = 0;

  get startedAt(): number {
    return this.t0;
  }

  begin(meta: Record<string, unknown>): void {
    this.rows.length = 0;
    this.marks = {};
    this.meta = meta;
    this.t0 = performance.now();
  }

  // Milliseconds from the Start camera tap. Only the first call for a name
  // counts, so it is cheap to call on every frame.
  mark(name: string): void {
    this.marks[name] ??= Math.round(performance.now() - this.t0);
  }

  frame(row: FrameRow): void {
    if (this.rows.length < MAX_ROWS) this.rows.push(row);
  }

  get hasData(): boolean {
    return this.rows.length > 0;
  }

  json(): string {
    return JSON.stringify({
      meta: this.meta,
      marks: this.marks,
      landmarkOrder: KEPT,
      rows: this.rows,
    });
  }
}

// --- Raw video -------------------------------------------------------------

const VIDEO_TYPES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

// The camera stream, recorded as it is: no skeleton, no text.
export class RawClip {
  private recorder: MediaRecorder;
  private chunks: Blob[] = [];
  private done: Promise<Blob | null>;

  private constructor(recorder: MediaRecorder) {
    this.recorder = recorder;
    this.done = new Promise((resolve) => {
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) this.chunks.push(event.data);
      };
      recorder.onstop = () =>
        resolve(
          this.chunks.length
            ? new Blob(this.chunks, { type: recorder.mimeType })
            : null,
        );
      recorder.onerror = () => resolve(null);
    });
  }

  static start(stream: MediaStream): RawClip | null {
    if (typeof MediaRecorder === "undefined") return null;
    try {
      const type = VIDEO_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const recorder = new MediaRecorder(stream, {
        ...(type ? { mimeType: type } : {}),
        videoBitsPerSecond: 3_000_000,
      });
      const clip = new RawClip(recorder);
      recorder.start(1000);
      return clip;
    } catch (err) {
      console.warn("Could not record the raw clip", err);
      return null;
    }
  }

  // Resolves with the video once the recorder has stopped.
  stop(): Promise<Blob | null> {
    try {
      if (this.recorder.state !== "inactive") this.recorder.stop();
    } catch {
      // Already stopped.
    }
    return this.done;
  }
}

// --- Handing a file over -------------------------------------------------------

// Opens the phone's share sheet when it can, so the file goes straight into
// a chat or AirDrop. Otherwise it downloads. Call it from a tap.
export async function deliverFile(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type });
  const nav = navigator as Navigator & {
    canShare?: (data: ShareData) => boolean;
  };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "repchek debug" });
      return;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
