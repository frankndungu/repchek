import type { Landmark } from "./types";
import { LANDMARK } from "./types";

const RAD_TO_DEG = 180 / Math.PI;

export interface JointAngles {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
  leftElbow: number;
  rightElbow: number;
}

export function angleAt(a: Landmark, vertex: Landmark, c: Landmark): number {
  const dirToA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const dirToC = Math.atan2(c.y - vertex.y, c.x - vertex.x);
  let deg = Math.abs(dirToA - dirToC) * RAD_TO_DEG;
  if (deg > 180) {
    deg = 360 - deg;
  }
  return deg;
}

export function computeJointAngles(lm: Landmark[]): JointAngles {
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
