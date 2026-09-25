import type { ExerciseProfile } from "../engine/types";

export const pushUp: ExerciseProfile = {
  id: "push-up",
  name: "Push-up",
  cameraView: "side",
  bodyweight: true,
  setupHint:
    "Side view, phone on the floor or a low bench, whole body in frame",
  rep: { metric: "elbowAngle", start: 160, turn: 90 },
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
      min: 155,
      message: "Keep your body straight, no sagging or piking",
    },
    {
      id: "neck-angle",
      metric: "neckAngle",
      min: 140,
      message: "Keep your head in line, eyes to the floor ahead",
    },
  ],
};
