import type { Landmark } from "./types";
import { LANDMARK } from "./types";

// In a busy gym the camera often sees more than one person. LifterLock
// decides which of them is the lifter, every frame.
//
// Before counting starts, the lifter is the biggest person on screen,
// which is normally whoever set the phone up next to them. Once counting
// has started, we follow that person: the lifter is the pose whose
// shoulders are nearest to where the lifter's shoulders were last frame.
// Someone walking past far from that spot is ignored. If nobody is near
// it, the lifter counts as not found this frame, the same as the lifter
// being hidden.

// Further than this from the lifter's last spot, as a share of the screen
// width, and it is not the lifter.
const MAX_JUMP = 0.25;

// Below this, an ankle counts as not seen.
const MIN_VISIBILITY = 0.5;

interface Point {
  x: number;
  y: number;
}

function midpoint(a: Landmark, b: Landmark): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function shoulderMid(pose: Landmark[]): Point {
  return midpoint(
    pose[LANDMARK.LEFT_SHOULDER],
    pose[LANDMARK.RIGHT_SHOULDER],
  );
}

// Landmarks are 0 to 1 across the width and 0 to 1 down the height, which
// are different lengths on a non-square video. Distances here are measured
// in screen widths, so y is scaled by height / width (1 / aspect).
function distance(a: Point, b: Point, aspect: number): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
}

// How big the body looks: shoulders to ankles, or shoulders to hips when
// the ankles are not seen. Measured along the body, not straight up, so a
// lifter lying on a bench is not mistaken for someone small.
function bodySize(pose: Landmark[], aspect: number): number {
  const leftAnkle = pose[LANDMARK.LEFT_ANKLE];
  const rightAnkle = pose[LANDMARK.RIGHT_ANKLE];
  const anklesSeen =
    Math.max(leftAnkle.visibility, rightAnkle.visibility) >= MIN_VISIBILITY;
  const end = anklesSeen
    ? midpoint(leftAnkle, rightAnkle)
    : midpoint(pose[LANDMARK.LEFT_HIP], pose[LANDMARK.RIGHT_HIP]);
  return distance(shoulderMid(pose), end, aspect);
}

export class LifterLock {
  // Where the lifter's shoulders were in the last frame they were found.
  private last: Point | null = null;

  // Choose the lifter from this frame's poses, or null if the lifter is
  // not among them. `armed` is whether the readiness gate is on, `aspect`
  // the video's width / height.
  pick(poses: Landmark[][], armed: boolean, aspect = 1): Landmark[] | null {
    if (poses.length === 0) return null;

    let chosen: Landmark[] | null = null;
    if (!armed || !this.last) {
      let biggest = -1;
      for (const pose of poses) {
        const size = bodySize(pose, aspect);
        if (size > biggest) {
          biggest = size;
          chosen = pose;
        }
      }
    } else {
      let nearest = MAX_JUMP;
      for (const pose of poses) {
        const jump = distance(shoulderMid(pose), this.last, aspect);
        if (jump <= nearest) {
          nearest = jump;
          chosen = pose;
        }
      }
    }

    if (chosen) this.last = shoulderMid(chosen);
    return chosen;
  }

  // Forget the lifter. Called when a set or the session ends, so the next
  // set starts by picking the biggest person again.
  reset(): void {
    this.last = null;
  }
}
