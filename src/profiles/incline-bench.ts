import type { ExerciseProfile } from "../engine/types";

export const inclineBench: ExerciseProfile = {
  id: "incline-bench",
  name: "Incline bench press",
  cameraView: "side",
  setupHint: "Side view at bench height, slightly above the weights",
  // Counting and form only use the upper body, so hidden legs are fine.
  requiredJoints: ["shoulder", "elbow", "wrist", "hip"],
  rep: { metric: "elbowAngle", start: 160, turn: 90 },
  ready: [
    {
      metric: "torsoAngle",
      max: 65,
      hint: "Lean back on the bench",
    },
  ],
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
      max: 30,
      message: "Stack your wrists over your elbows",
    },
  ],
};
