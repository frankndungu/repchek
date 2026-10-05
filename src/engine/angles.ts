import type {
  Landmark,
  JointAngles,
  FrameMetrics,
  CameraView,
  Joint,
} from "./types";
import { LANDMARK } from "./types";
import { SQUASHED_SHARE } from "./reference";
import type { FrontReference } from "./reference";

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

export type BodyPart =
  | "hands"
  | "arms"
  | "shoulders"
  | "hips"
  | "legs"
  | "head";

// Most useful first: when the phone is too close, hands and feet are the
// first to leave the frame, and "move back" fixes it.
const BODY_PARTS: Array<{ part: BodyPart; joints: number[] }> = [
  { part: "hands", joints: [LANDMARK.LEFT_WRIST, LANDMARK.RIGHT_WRIST] },
  { part: "arms", joints: [LANDMARK.LEFT_ELBOW, LANDMARK.RIGHT_ELBOW] },
  {
    part: "shoulders",
    joints: [LANDMARK.LEFT_SHOULDER, LANDMARK.RIGHT_SHOULDER],
  },
  { part: "hips", joints: [LANDMARK.LEFT_HIP, LANDMARK.RIGHT_HIP] },
  {
    part: "legs",
    joints: [
      LANDMARK.LEFT_KNEE,
      LANDMARK.RIGHT_KNEE,
      LANDMARK.LEFT_ANKLE,
      LANDMARK.RIGHT_ANKLE,
    ],
  },
  { part: "head", joints: [LANDMARK.LEFT_EAR, LANDMARK.RIGHT_EAR] },
];

const MIN_PART_VISIBILITY = 0.6;

// The landmark for each joint name, on each side of the body.
const JOINT_LANDMARKS: Record<Joint, Record<Side, number>> = {
  head: { left: LANDMARK.LEFT_EAR, right: LANDMARK.RIGHT_EAR },
  shoulder: { left: LANDMARK.LEFT_SHOULDER, right: LANDMARK.RIGHT_SHOULDER },
  elbow: { left: LANDMARK.LEFT_ELBOW, right: LANDMARK.RIGHT_ELBOW },
  wrist: { left: LANDMARK.LEFT_WRIST, right: LANDMARK.RIGHT_WRIST },
  hip: { left: LANDMARK.LEFT_HIP, right: LANDMARK.RIGHT_HIP },
  knee: { left: LANDMARK.LEFT_KNEE, right: LANDMARK.RIGHT_KNEE },
  ankle: { left: LANDMARK.LEFT_ANKLE, right: LANDMARK.RIGHT_ANKLE },
};

// The joints that must be seen. With a profile's requiredJoints: those, on
// the dominant side from the side, on both sides from the front. Without:
// one whole side of the body from the side, both arms from the front.
function confidenceChain(
  side: Side,
  view: CameraView,
  required?: Joint[],
): number[] {
  if (required) {
    return view === "front"
      ? required.flatMap((joint) => [
          JOINT_LANDMARKS[joint].left,
          JOINT_LANDMARKS[joint].right,
        ])
      : required.map((joint) => JOINT_LANDMARKS[joint][side]);
  }
  return view === "front" ? FRONT_CHAIN : SIDE_CHAIN[side];
}

export function frameConfidence(
  landmarks: Landmark[],
  side: Side,
  view: CameraView = "side",
  required?: Joint[],
): number {
  const chain = confidenceChain(side, view, required);
  return Math.min(...chain.map((i) => landmarks[i].visibility));
}

// Which body parts frameConfidence could not see well enough, so the app
// can say what is out of frame instead of just skipping the frame.
export function missingParts(
  landmarks: Landmark[],
  side: Side,
  view: CameraView = "side",
  required?: Joint[],
): BodyPart[] {
  const chain = confidenceChain(side, view, required);
  const unseen = chain.filter(
    (i) => landmarks[i].visibility < MIN_PART_VISIBILITY,
  );
  return BODY_PARTS.filter(({ joints }) =>
    joints.some((i) => unseen.includes(i)),
  ).map(({ part }) => part);
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

// `reference` is for front view exercises with the hands on the floor: the
// remembered hands and shoulder width from reference.ts. Without it, every
// metric comes from this frame alone.
export function computeFrameMetrics(
  landmarks: Landmark[],
  aspect: number,
  reference?: FrontReference,
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
  // At the bottom of a front view push-up the model squashes the shoulders
  // together and loses the hands, but the height of the shoulders stays
  // good. So with a reference, the rep is the live shoulder height against
  // the remembered hands, over the remembered shoulder width.
  const handsY = reference?.handsY ?? (lw.y + rw.y) / 2;
  const steadyWidth = reference?.shoulderWidth ?? shoulderWidth;
  const shoulderOverWrist = (handsY - shoulderMidY) / steadyWidth;
  // Elbow flare needs the elbows and both shoulders in the right place.
  // With a reference we can tell when they are not (elbows not seen, or
  // shoulders squashed), and then the frame is not judged: 0 never breaks
  // the rule.
  const elbowsSeen =
    Math.min(le.visibility, re.visibility) >= MIN_PART_VISIBILITY;
  const squashed =
    reference !== undefined &&
    shoulderWidth < reference.shoulderWidth * SQUASHED_SHARE;
  const elbowFlare =
    reference !== undefined && (squashed || !elbowsSeen)
      ? 0
      : (Math.abs(le.x - ls.x) + Math.abs(re.x - rs.x)) / 2 / steadyWidth;
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
