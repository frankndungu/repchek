import type { ExerciseProfile } from "../engine/types";

export const benchPress: ExerciseProfile = {
  id: "bench-press",
  name: "Bench press (dumbbell or barbell)",
  cameraView: "side",
  setupHint: "Side view at bench height, slightly above the weights",
  // Counting and form only use the upper body, so hidden legs are fine.
  requiredJoints: ["shoulder", "elbow", "wrist", "hip"],
  rep: { metric: "elbowAngle", start: 160, turn: 90 },
  ready: [
    {
      metric: "torsoAngle",
      min: -30,
      max: 30,
      hint: "Lie back on the bench",
    },
  ],
  // Lifters unrack and press straight away, with no hold at lockout.
  rollingStart: true,
  phaseLabels: {
    idle: "GET SET",
    ready: "LOCKOUT",
    "moving-out": "LOWERING",
    turn: "BOTTOM",
    "moving-back": "PRESSING",
  },
  rules: [
    {
      id: "forearm-vertical",
      metric: "forearmTilt",
      max: 25,
      message: "Stack your wrists over your elbows",
      cue: "Wrists over elbows",
    },
  ],
};
