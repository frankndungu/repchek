import type { Landmark, JointAngles, FrameMetrics } from "./types";
import { LANDMARK } from "./types";

export type { JointAngles } from "./types";

const RAD_TO_DEG = 180 / Math.PI;

interface Point {
  x: number;
  y: number;
}

export type Side = "left" | "right";

const LEFT_SIDE = [
  LANDMARK.LEFT_SHOULDER,
  LANDMARK.LEFT_HIP,
  LANDMARK.LEFT_KNEE,
  LANDMARK.LEFT_ANKLE,
  LANDMARK.LEFT_WRIST,
];

const RIGHT_SIDE = [
  LANDMARK.RIGHT_SHOULDER,
  LANDMARK.RIGHT_HIP,
  LANDMARK.RIGHT_KNEE,
  LANDMARK.RIGHT_ANKLE,
  LANDMARK.RIGHT_WRIST,
];

const SIDE_CHAIN: Record<Side, number[]> = {
  left: [
    LANDMARK.LEFT_EAR,
    LANDMARK.LEFT_SHOULDER,
    LANDMARK.LEFT_ELBOW,
    LANDMARK.LEFT_WRIST,
    LANDMARK.LEFT_HIP,
    LANDMARK.LEFT_KNEE,
    LANDMARK.LEFT_ANKLE,
  ],
  right: [
    LANDMARK.RIGHT_EAR,
    LANDMARK.RIGHT_SHOULDER,
    LANDMARK.RIGHT_ELBOW,
    LANDMARK.RIGHT_WRIST,
    LANDMARK.RIGHT_HIP,
    LANDMARK.RIGHT_KNEE,
    LANDMARK.RIGHT_ANKLE,
  ],
};

export function angleAt(a: Point, vertex: Point, c: Point): number {
  const dirToA = Math.atan2(a.y - vertex.y, a.x - vertex.x);
  const dirToC = Math.atan2(c.y - vertex.y, c.x - vertex.x);
  let deg = Math.abs(dirToA - dirToC) * RAD_TO_DEG;
  if (deg > 180) {
    deg = 360 - deg;
  }
  return deg;
}

export function tiltFromVertical(a: Point, b: Point): number {
  const dx = Math.abs(b.x - a.x);
  const dy = Math.abs(b.y - a.y);
  return Math.atan2(dx, dy) * RAD_TO_DEG;
}

export function correctAspect(
  landmarks: Landmark[],
  aspect: number,
): Landmark[] {
  return landmarks.map((lm) => ({ ...lm, x: lm.x * aspect }));
}

export function dominantSide(landmarks: Landmark[]): Side {
  const score = (indices: number[]) =>
    indices.reduce((sum, i) => sum + landmarks[i].visibility, 0);
  return score(LEFT_SIDE) >= score(RIGHT_SIDE) ? "left" : "right";
}

export function frameConfidence(landmarks: Landmark[], side: Side): number {
  return Math.min(...SIDE_CHAIN[side].map((i) => landmarks[i].visibility));
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
  const side = dominantSide(landmarks);
  const left = side === "left";

  const ear = lm[left ? LANDMARK.LEFT_EAR : LANDMARK.RIGHT_EAR];
  const shoulder = lm[left ? LANDMARK.LEFT_SHOULDER : LANDMARK.RIGHT_SHOULDER];
  const elbow = lm[left ? LANDMARK.LEFT_ELBOW : LANDMARK.RIGHT_ELBOW];
  const wrist = lm[left ? LANDMARK.LEFT_WRIST : LANDMARK.RIGHT_WRIST];
  const hip = lm[left ? LANDMARK.LEFT_HIP : LANDMARK.RIGHT_HIP];
  const ankle = lm[left ? LANDMARK.LEFT_ANKLE : LANDMARK.RIGHT_ANKLE];

  const hipAngle = left ? angles.leftHip : angles.rightHip;
  const kneeAngle = left ? angles.leftKnee : angles.rightKnee;
  const elbowAngle = left ? angles.leftElbow : angles.rightElbow;

  const torsoLength = Math.hypot(shoulder.x - hip.x, shoulder.y - hip.y) || 1;
  const rise = hip.y - shoulder.y;
  const run = Math.abs(shoulder.x - hip.x);
  const torsoAngle = Math.atan2(rise, run) * RAD_TO_DEG;
  const barOffset = Math.abs(wrist.x - ankle.x) / torsoLength;
  const neckAngle = angleAt(ear, shoulder, hip);
  const forearmTilt = tiltFromVertical(elbow, wrist);
  const upperArmTilt = tiltFromVertical(shoulder, elbow);
  const wristRise = (shoulder.y - wrist.y) / torsoLength;

  return {
    ...angles,
    hipAngle,
    kneeAngle,
    elbowAngle,
    torsoAngle,
    barOffset,
    neckAngle,
    forearmTilt,
    upperArmTilt,
    wristRise,
  };
}
