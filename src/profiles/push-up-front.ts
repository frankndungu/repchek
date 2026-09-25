import type { ExerciseProfile } from "../engine/types";

export const pushUpFront: ExerciseProfile = {
  id: "push-up-front",
  name: "Push-up (front view)",
  cameraView: "front",
  bodyweight: true,
  setupHint:
    "Phone on the floor in front of you, facing your head. Catches elbow flare",
  rep: { metric: "shoulderOverWrist", start: 0.9, turn: 0.3 },
  phaseLabels: {
    idle: "GET SET",
    ready: "TOP",
    "moving-out": "LOWERING",
    turn: "BOTTOM",
    "moving-back": "PRESSING",
  },
  rules: [
    {
      id: "elbow-flare",
      metric: "elbowFlare",
      max: 0.55,
      message: "Elbows are flaring, tuck them toward your body",
    },
  ],
};
