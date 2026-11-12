import type { ExerciseProfile } from "../engine/types";

// Glute bridge: on your back, knees bent, lift the hips until the body is in
// one line from shoulders to knees. The hip angle is about 135 with the hips
// down and close to 180 at the top. Provisional.
export const gluteBridge: ExerciseProfile = {
  id: "glute-bridge",
  name: "Glute bridge",
  cameraView: "side",
  bodyweight: true,
  setupHint: "Lie on your back, knees bent, side on to the phone. Whole body in frame",
  requiredJoints: ["shoulder", "hip", "knee"],
  rep: { metric: "hipAngle", start: 135, turn: 170 },
  ready: [
    {
      metric: "kneeAngle",
      min: 45,
      max: 125,
      hint: "Bend your knees, feet flat",
    },
    {
      metric: "torsoAngle",
      max: 30,
      hint: "Lie on your back",
    },
  ],
  phaseLabels: {
    idle: "LIE BACK",
    ready: "HIPS DOWN",
    "moving-out": "LIFTING",
    turn: "TOP",
    "moving-back": "LOWERING",
  },
  rules: [],
};
