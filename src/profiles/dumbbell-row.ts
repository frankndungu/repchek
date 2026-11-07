import type { ExerciseProfile } from "../engine/types";

// One arm at a time, hinged over with the other hand on a bench or your
// knee. Same measure as the barbell row, on the arm nearest the phone.
// Provisional: reasoned from the barbell row numbers, not yet tuned on
// recorded sets.
export const dumbbellRow: ExerciseProfile = {
  id: "dumbbell-row",
  name: "Dumbbell row",
  cameraView: "side",
  setupHint:
    "Stand sideways with the working arm nearest the phone, whole body in frame",
  requiredJoints: ["head", "shoulder", "elbow", "wrist", "hip"],
  rep: { metric: "elbowAngle", start: 150, turn: 90 },
  rollingStart: true,
  ready: [
    {
      metric: "torsoAngle",
      min: 8,
      max: 70,
      hint: "Hinge over, hand on the bench",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "ARM DOWN",
    "moving-out": "PULLING",
    turn: "AT YOUR HIP",
    "moving-back": "LOWERING",
  },
  rules: [
    {
      id: "torso-too-upright",
      metric: "torsoAngle",
      max: 70,
      message: "Stay bent over, do not stand up",
      cue: "Stay bent",
    },
    {
      id: "neck-angle",
      metric: "neckAngle",
      min: 130,
      message: "Eyes forward, keep your back straight",
      cue: "Eyes forward",
    },
  ],
};
