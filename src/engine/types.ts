export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility: number;
}

export const LANDMARK = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
  LEFT_HIP: 23,
  RIGHT_HIP: 24,
  LEFT_KNEE: 25,
  RIGHT_KNEE: 26,
  LEFT_ANKLE: 27,
  RIGHT_ANKLE: 28,
  LEFT_HEEL: 29,
  RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31,
  RIGHT_FOOT_INDEX: 32,
} as const;

export type CameraView = "side" | "front";

export interface JointAngles {
  leftKnee: number;
  rightKnee: number;
  leftHip: number;
  rightHip: number;
  leftElbow: number;
  rightElbow: number;
}

export interface FrameMetrics extends JointAngles {
  hipAngle: number;
  kneeAngle: number;
  elbowAngle: number;
  torsoAngle: number;
  barOffset: number;
  neckAngle: number;
  forearmTilt: number;
  upperArmTilt: number;
  wristRise: number;
  shoulderOverWrist: number;
  elbowFlare: number;
  kneeDrive: number;
  shoulderTilt: number;
  hipDrop: number;
}

export type RepPhase = "idle" | "ready" | "moving-out" | "turn" | "moving-back";

export interface RepTrigger {
  metric: keyof FrameMetrics;
  start: number;
  turn: number;
  // When set, the trigger is learned from the person. start becomes the
  // value they held during the readiness hold, and turn becomes
  // start * turnRatio. The profile's own start is then only a loose floor
  // for arming, and its turn is ignored except to say which way the rep
  // goes (start above turn, or below it).
  turnRatio?: number;
}

export interface FormRule {
  id: string;
  metric: keyof FrameMetrics;
  min?: number;
  max?: number;
  message: string;
  phase?: RepPhase;
}

// A posture check used by the readiness gate before counting starts.
// Same shape as a form rule: a metric with an optional min and max.
// `hint` is what the counter pill shows when the check fails.
export interface ReadyCheck {
  metric: keyof FrameMetrics;
  min?: number;
  max?: number;
  hint: string;
}

export interface ExerciseProfile {
  id: string;
  name: string;
  cameraView: CameraView;
  setupHint?: string;
  bodyweight?: boolean;
  rep: RepTrigger;
  // Optional posture checks that must pass before counting starts.
  // Leave it out and the gate still waits for: visible, at the start
  // of the rep, and holding still for a second.
  ready?: ReadyCheck[];
  phaseLabels?: Partial<Record<RepPhase, string>>;
  rules: FormRule[];
}

export interface Verdict {
  ok: boolean;
  failures: FormRule[];
}
