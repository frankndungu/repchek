import type { ExerciseProfile } from "../engine/types";

// Provisional: reasoned from the body, not yet tuned on recorded sets.
export const pullUp: ExerciseProfile = {
  id: "pull-up",
  name: "Pull-up",
  cameraView: "side",
  bodyweight: true,
  setupHint: "Side view, phone on the floor, you and the bar in frame",
  // Hips and shoulders and the arm must be seen. Feet may be bent behind.
  requiredJoints: ["shoulder", "elbow", "wrist", "hip"],
  // Hanging with straight arms is about 170 degrees at the elbow, the top
  // with the chin over the bar is about 60.
  rep: { metric: "elbowAngle", start: 155, turn: 70 },
  ready: [
    {
      metric: "torsoAngle",
      min: 60,
      hint: "Hang from the bar",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "HANGING",
    "moving-out": "PULLING",
    turn: "TOP",
    "moving-back": "LOWERING",
  },
  rules: [
    {
      id: "swing",
      metric: "torsoAngle",
      min: 65,
      message: "Stay controlled, no swinging",
      cue: "No swinging",
    },
  ],
};
