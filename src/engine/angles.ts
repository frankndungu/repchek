import type { Landmark, JointAngles, FrameMetrics } from "./types";
import { LANDMARK } from "./types";

export type { JointAngles } from "./types";

const RAD_TO_DEG = 180 / Math.PI;

interface Point {
  x: number;
  y: number;
}

export function angleAt(a: Point, vertex: Point, c: Point): number {
  const dirToA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const dirToC = Math.atan2(c.y - vertex.y, c.x - vertex.x);
  let deg = Math.abs(dirToA - dirToC) * RAD_TO_DEG;
  if (deg > 180) {
    deg = 360 - deg;
  }
  return deg;
}

export function correctAspect(
  landmarks: Landmark[],
  aspect: number,
): Landmark[] {
  return landmarks.map((lm) => ({ ...lm, x: lm.x * aspect }));
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function computeJointAngles(lm: Point[]): JointAngles {
  return {
    leftKnee: angleAt(
      lm[LANDMARK.LEFT_HIP],
      lm[LANDMARK.LEFT_KNEE],
      lm[LANDMARK.LEFT_ANKLE],
    ),
    rightKnee: angleAt(
      lm[LANDMARK.RIGHT_HIP],
      lm[LANDMARK.RIGHT_KNEE],
      lm[LANDMARK.RIGHT_ANKLE],
    ),
    leftHip: angleAt(
      lm[LANDMARK.LEFT_SHOULDER],
      lm[LANDMARK.LEFT_HIP],
      lm[LANDMARK.LEFT_KNEE],
    ),
    rightHip: angleAt(
      lm[LANDMARK.RIGHT_SHOULDER],
      lm[LANDMARK.RIGHT_HIP],
      lm[LANDMARK.RIGHT_KNEE],
    ),
    leftElbow: angleAt(
      lm[LANDMARK.LEFT_SHOULDER],
      lm[LANDMARK.LEFT_ELBOW],
      lm[LANDMARK.LEFT_WRIST],
    ),
    rightElbow: angleAt(
      lm[LANDMARK.RIGHT_SHOULDER],
      lm[LANDMARK.RIGHT_ELBOW],
      lm[LANDMARK.RIGHT_WRIST],
    ),
  };
}

export function computeFrameMetrics(
  landmarks: Landmark[],
  aspect: number,
): FrameMetrics {
  const lm = correctAspect(landmarks, aspect);
  const angles = computeJointAngles(lm);

  const shoulder = midpoint(
    lm[LANDMARK.LEFT_SHOULDER],
    lm[LANDMARK.RIGHT_SHOULDER],
  );
  const hip = midpoint(lm[LANDMARK.LEFT_HIP], lm[LANDMARK.RIGHT_HIP]);
  const wrist = midpoint(lm[LANDMARK.LEFT_WRIST], lm[LANDMARK.RIGHT_WRIST]);
  const ankle = midpoint(lm[LANDMARK.LEFT_ANKLE], lm[LANDMARK.RIGHT_ANKLE]);

  const torsoLength = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) || 1;
  const rise = hip.y - shoulder.y;
  const run = Math.abs(shoulder.x - hip.x);
  const torsoAngle = Math.atan2(rise, run) * RAD_TO_DEG;
  const barOffset = Math.abs(wrist.x - ankle.x) / torsoLength;

  return { ...angles, torsoAngle, barOffset };
}
