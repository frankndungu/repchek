import type { ExerciseProfile } from "../engine/types";

export const pushUp: ExerciseProfile = {
  id: "push-up",
  name: "Push-up",
  cameraView: "side",
  bodyweight: true,
  setupHint:
    "Side view, phone on the floor or a low bench, whole body in frame. Any hand width",
  rep: { metric: "wristRise", start: -0.9, turn: -0.5 },
  phaseLabels: {
    idle: "GET SET",
    ready: "TOP",
    "moving-out": "LOWERING",
    turn: "BOTTOM",
    "moving-back": "PRESSING",
  },
  rules: [
    {
      id: "body-line",
      metric: "hipAngle",
      min: 150,
      message: "Keep your body straight, no sagging or piking",
    },
  ],
};
