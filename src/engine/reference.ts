import type { Landmark } from "./types";
import { LANDMARK } from "./types";

// Front view exercises with the hands on the floor (push-ups, mountain
// climbers) are measured against two things that do not change during a
// set: where the hands are on screen, and how wide the shoulders look.
//
// The model cannot be trusted for either at the bottom of a rep. The head
// hides the body, so it squashes the two shoulders together (their width
// drops to almost nothing) and loses confidence in the elbows and wrists.
// The height of the shoulders stays good the whole time.
//
// So this remembers the hands and the shoulder width from the frames where
// both arms are seen clearly, which is mostly the top of each rep, and the
// metrics use the remembered values instead of the live ones. See
// computeFrameMetrics in angles.ts.

export interface FrontReference {
  // Height of the hands on screen: 0 is the top edge, 1 the bottom edge.
  handsY: number;
  // Shoulder width in the same units as computeFrameMetrics, which are
  // screen heights.
  shoulderWidth: number;
}

// A joint below this is not seen well enough to learn from. The same bar
// main.ts sets for using a frame at all.
const MIN_VISIBILITY = 0.6;

// How long a remembered frame stays useful. Long enough to cover the
// bottom of a slow rep, short enough to follow someone who moves the phone
// or shifts their hands between sets.
const WINDOW_MS = 4000;

// Shoulders narrower than this share of the remembered width are squashed,
// not real. Such a frame is not learned from, and the elbow check skips it.
export const SQUASHED_SHARE = 0.6;

const ARMS = [
  LANDMARK.LEFT_SHOULDER,
  LANDMARK.RIGHT_SHOULDER,
  LANDMARK.LEFT_ELBOW,
  LANDMARK.RIGHT_ELBOW,
  LANDMARK.LEFT_WRIST,
  LANDMARK.RIGHT_WRIST,
];

interface Sample {
  at: number;
  handsY: number;
  shoulderWidth: number;
}

// The middle value, so a few bad frames cannot drag the answer.
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

export class FrontReferenceTracker {
  private samples: Sample[] = [];
  private current: FrontReference | undefined;

  // Call on every frame where the lifter was found. Returns what is known
  // about the hands and shoulders, or undefined when nothing clear has
  // been seen in the last WINDOW_MS.
  update(
    landmarks: Landmark[],
    aspect: number,
    nowMs: number,
  ): FrontReference | undefined {
    this.samples = this.samples.filter((s) => nowMs - s.at <= WINDOW_MS);
    if (this.samples.length === 0) this.current = undefined;

    const armsSeen = ARMS.every(
      (i) => landmarks[i].visibility >= MIN_VISIBILITY,
    );
    if (armsSeen) {
      const ls = landmarks[LANDMARK.LEFT_SHOULDER];
      const rs = landmarks[LANDMARK.RIGHT_SHOULDER];
      const shoulderWidth = Math.abs(ls.x - rs.x) * aspect;
      const squashed =
        this.current !== undefined &&
        shoulderWidth < this.current.shoulderWidth * SQUASHED_SHARE;
      if (!squashed && shoulderWidth > 0) {
        this.samples.push({
          at: nowMs,
          handsY:
            (landmarks[LANDMARK.LEFT_WRIST].y +
              landmarks[LANDMARK.RIGHT_WRIST].y) /
            2,
          shoulderWidth,
        });
        this.current = {
          handsY: median(this.samples.map((s) => s.handsY)),
          shoulderWidth: median(this.samples.map((s) => s.shoulderWidth)),
        };
      }
    }
    return this.current;
  }

  reset(): void {
    this.samples = [];
    this.current = undefined;
  }
}
