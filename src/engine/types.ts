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
}

export type RepPhase = "idle" | "ready" | "moving-out" | "turn" | "moving-back";

export interface RepTrigger {
  metric: keyof FrameMetrics;
  start: number;
  turn: number;
}

export interface FormRule {
  id: string;
  metric: keyof FrameMetrics;
  min?: number;
  max?: number;
  message: string;
  phase?: RepPhase;
}

export interface ExerciseProfile {
  id: string;
  name: string;
  cameraView: "side" | "front";
  setupHint?: string;
  rep: RepTrigger;
  phaseLabels?: Partial<Record<RepPhase, string>>;
  rules: FormRule[];
}

export interface Verdict {
  ok: boolean;
  failures: FormRule[];
}
