import type { ExerciseProfile } from "../engine/types";

// Wall sit: back against a wall, knees bent about 90 degrees. A hold, like the
// plank: every second sitting counts, and a second is clean when the thighs
// are close to level. Provisional.
export const wallSit: ExerciseProfile = {
  id: "wall-sit",
  name: "Wall sit",
  cameraView: "side",
  bodyweight: true,
  hold: true,
  setupHint: "Back against a wall, side on to the phone. Whole body in frame",
  requiredJoints: ["shoulder", "hip", "knee", "ankle"],
  // Only the start of the hold, for arming: knees bent.
  rep: { metric: "kneeAngle", start: 95, turn: 170 },
  ready: [
    {
      metric: "kneeAngle",
      min: 60,
      max: 125,
      hint: "Slide down the wall",
    },
    {
      metric: "torsoAngle",
      min: 60,
      hint: "Back flat against the wall",
    },
  ],
  phaseLabels: {
    idle: "SLIDE DOWN",
    ready: "SLIDE DOWN",
    "moving-out": "SLIDE DOWN",
    turn: "HOLDING",
    "moving-back": "HOLDING",
  },
  rules: [
    {
      id: "thighs-level",
      metric: "kneeAngle",
      max: 110,
      message: "Slide lower, thighs level with the floor",
      cue: "Sit lower",
    },
  ],
};
