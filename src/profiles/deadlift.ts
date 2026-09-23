import type { ExerciseProfile } from "../engine/types";

export const deadlift: ExerciseProfile = {
  id: "deadlift",
  name: "Deadlift",
  cameraView: "side",
  setupHint: "Side view, full body in frame, bar visible",
  rep: { metric: "hipAngle", start: 160, turn: 90 },
  phaseLabels: {
    idle: "GET SET",
    ready: "STANDING",
    "moving-out": "LOWERING",
    turn: "BOTTOM",
    "moving-back": "PULLING",
  },
  rules: [
    {
      id: "torso-angle",
      metric: "torsoAngle",
      min: 15,
      message: "Chest up, hips are shooting up",
    },
    {
      id: "neck-angle",
      metric: "neckAngle",
      min: 145,
      message: "Eyes forward, keep your back straight",
    },
    {
      id: "bar-path",
      metric: "barOffset",
      max: 0.5,
      message: "Keep the bar close to your legs",
    },
  ],
};
