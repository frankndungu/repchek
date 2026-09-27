import type { Landmark, JointAngles, FrameMetrics, CameraView } from "./types";
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

const FRONT_CHAIN = [
  LANDMARK.LEFT_SHOULDER,
  LANDMARK.RIGHT_SHOULDER,
  LANDMARK.LEFT_ELBOW,
  LANDMARK.RIGHT_ELBOW,
  LANDMARK.LEFT_WRIST,
  LANDMARK.RIGHT_WRIST,
];

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

export function frameConfidence(
  landmarks: Landmark[],
  side: Side,
  view: CameraView = "side",
): number {
  const chain = view === "front" ? FRONT_CHAIN : SIDE_CHAIN[side];
  return Math.min(...chain.map((i) => landmarks[i].visibility));
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

  const ls = lm[LANDMARK.LEFT_SHOULDER];
  const rs = lm[LANDMARK.RIGHT_SHOULDER];
  const le = lm[LANDMARK.LEFT_ELBOW];
  const re = lm[LANDMARK.RIGHT_ELBOW];
  const lw = lm[LANDMARK.LEFT_WRIST];
  const rw = lm[LANDMARK.RIGHT_WRIST];
  const lh = lm[LANDMARK.LEFT_HIP];
  const rh = lm[LANDMARK.RIGHT_HIP];
  const lk = lm[LANDMARK.LEFT_KNEE];
  const rk = lm[LANDMARK.RIGHT_KNEE];
  const shoulderWidth = Math.abs(ls.x - rs.x) || 1;
  const shoulderMidY = (ls.y + rs.y) / 2;
  const shoulderOverWrist = ((lw.y + rw.y) / 2 - shoulderMidY) / shoulderWidth;
  const elbowFlare =
    (Math.abs(le.x - ls.x) + Math.abs(re.x - rs.x)) / 2 / shoulderWidth;
  const kneeDrive = (Math.max(lk.y, rk.y) - shoulderMidY) / shoulderWidth;
  const shoulderTilt = Math.abs(ls.y - rs.y) / shoulderWidth;
  // Front view: how far the hips sit below the shoulders on screen.
  // Standing it is well above 1. In a plank facing the camera the
  // hips are behind the shoulders, so it drops close to 0.
  const hipDrop = ((lh.y + rh.y) / 2 - shoulderMidY) / shoulderWidth;

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
    shoulderOverWrist,
    elbowFlare,
    kneeDrive,
    shoulderTilt,
    hipDrop,
  };
}
