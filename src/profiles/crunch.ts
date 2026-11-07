import type { ExerciseProfile } from "../engine/types";

// Provisional: the numbers are reasoned from the body, not yet tuned on
// recorded sets. Record one with ?debug=1 and adjust.
export const crunch: ExerciseProfile = {
  id: "crunch",
  name: "Crunches",
  cameraView: "side",
  bodyweight: true,
  setupHint:
    "Lie on your back, knees bent, phone on the floor beside you. Whole body in frame",
  requiredJoints: ["shoulder", "hip", "knee"],
  // The torso angle is how far the shoulders sit above the hips: about 0
  // lying flat, 25 or so at the top of a crunch.
  rep: { metric: "torsoAngle", start: 8, turn: 25 },
  ready: [
    {
      metric: "kneeAngle",
      min: 40,
      max: 140,
      hint: "Bend your knees",
    },
  ],
  phaseLabels: {
    idle: "LIE BACK",
    ready: "DOWN",
    "moving-out": "CRUNCHING",
    turn: "TOP",
    "moving-back": "LOWERING",
  },
  rules: [
    {
      id: "neck-pull",
      metric: "neckAngle",
      // Lenient on purpose: only a head pulled well forward of the chest.
      min: 125,
      message: "Do not pull on your neck",
      cue: "Do not pull your neck",
    },
  ],
};
