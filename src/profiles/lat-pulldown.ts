import type { ExerciseProfile } from "../engine/types";

export const latPulldown: ExerciseProfile = {
  id: "lat-pulldown",
  name: "Lat pulldown",
  cameraView: "side",
  setupHint: "Side view, seated, arms visible at full stretch",
  rep: { metric: "elbowAngle", start: 160, turn: 80 },
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
