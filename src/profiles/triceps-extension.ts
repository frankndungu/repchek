import type { ExerciseProfile } from "../engine/types";

export const tricepsExtension: ExerciseProfile = {
  id: "triceps-extension",
  name: "Overhead triceps extension",
  cameraView: "side",
  setupHint: "Side view, standing or seated, arms overhead in frame",
  rep: { metric: "elbowAngle", start: 160, turn: 70 },
  ready: [
    {
      metric: "wristRise",
      min: 0.5,
      hint: "Get the weight overhead",
    },
    {
      metric: "torsoAngle",
      min: 65,
      hint: "Stand or sit tall",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "LOCKED OUT",
    "moving-out": "LOWERING",
    turn: "STRETCH",
    "moving-back": "PRESSING",
  },
  rules: [
    {
      id: "elbows-up",
      metric: "upperArmTilt",
      max: 30,
      message: "Keep your elbows pointing up",
    },
    {
      id: "torso-lean",
      metric: "torsoAngle",
      min: 75,
      message: "Stand tall, do not lean back",
    },
  ],
};
