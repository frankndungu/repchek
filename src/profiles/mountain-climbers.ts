import type { ExerciseProfile } from "../engine/types";

export const mountainClimbers: ExerciseProfile = {
  id: "mountain-climbers",
  name: "Mountain climbers",
  cameraView: "side",
  bodyweight: true,
  setupHint:
    "Side view, phone on the floor or a low bench. Counts the leg facing the camera",
  rep: { metric: "kneeAngle", start: 165, turn: 90 },
  ready: [
    {
      metric: "torsoAngle",
      min: -20,
      max: 40,
      hint: "Get into your plank",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "PLANK",
    "moving-out": "DRIVING",
    turn: "KNEE IN",
    "moving-back": "EXTENDING",
  },
  rules: [
    {
      id: "hips-piking",
      metric: "torsoAngle",
      min: -5,
      message: "Hips too high, keep your body flat",
    },
    {
      id: "hips-sagging",
      metric: "torsoAngle",
      max: 25,
      message: "Hips are sagging, brace your core",
    },
  ],
};
