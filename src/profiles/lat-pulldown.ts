import type { ExerciseProfile } from "../engine/types";

export const latPulldown: ExerciseProfile = {
  id: "lat-pulldown",
  name: "Lat pulldown",
  cameraView: "side",
  setupHint: "Side view, seated, arms visible at full stretch",
  // Counting and form only use the upper body, so hidden legs are fine.
  requiredJoints: ["shoulder", "elbow", "wrist", "hip"],
  rep: { metric: "elbowAngle", start: 160, turn: 80 },
  ready: [
    {
      metric: "wristRise",
      min: 0.5,
      hint: "Grab the bar overhead",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "ARMS UP",
    "moving-out": "PULLING",
    turn: "BAR AT CHEST",
    "moving-back": "RELEASING",
  },
  rules: [
    {
      id: "torso-lean",
      metric: "torsoAngle",
      min: 60,
      message: "Sit tall, you are leaning back too far",
    },
  ],
};
