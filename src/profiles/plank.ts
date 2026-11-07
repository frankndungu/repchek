import type { ExerciseProfile } from "../engine/types";

// A hold. Every second in the plank counts as one, and a second is clean when
// the body stays in one line. Provisional until it is tuned on recorded sets.
export const plank: ExerciseProfile = {
  id: "plank",
  name: "Plank",
  cameraView: "side",
  bodyweight: true,
  hold: true,
  setupHint:
    "Side view, phone on the floor, whole body in frame. Forearms or hands, either works",
  // Only the start of the hold, for arming: the body near flat.
  rep: { metric: "torsoAngle", start: 10, turn: 60 },
  ready: [
    {
      metric: "torsoAngle",
      min: -25,
      max: 25,
      hint: "Get into your plank",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "GET SET",
    "moving-out": "GET SET",
    turn: "HOLDING",
    "moving-back": "HOLDING",
  },
  rules: [
    {
      id: "body-line",
      metric: "hipAngle",
      min: 150,
      message: "Keep your body straight, no sagging or piking",
      cue: "Straight body",
    },
  ],
};
