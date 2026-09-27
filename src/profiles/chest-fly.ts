import type { ExerciseProfile } from "../engine/types";

export const chestFly: ExerciseProfile = {
  id: "chest-fly",
  name: "Chest fly (dumbbell)",
  cameraView: "side",
  setupHint: "Side view at bench height. Experimental, tell me how it counts",
  rep: { metric: "wristRise", start: 0.55, turn: 0.15 },
  ready: [
    {
      metric: "torsoAngle",
      max: 50,
      hint: "Lie back on the bench",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "ARMS UP",
    "moving-out": "OPENING",
    turn: "STRETCH",
    "moving-back": "CLOSING",
  },
  rules: [
    {
      id: "elbow-too-bent",
      metric: "elbowAngle",
      min: 110,
      message: "Do not bend the elbows into a press",
    },
    {
      id: "elbow-locked",
      metric: "elbowAngle",
      max: 175,
      message: "Keep a soft bend in the elbows",
    },
  ],
};
