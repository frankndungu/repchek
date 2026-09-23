import type { ExerciseProfile } from "../engine/types";

export const bicepsCurl: ExerciseProfile = {
  id: "biceps-curl",
  name: "Biceps curl (dumbbell, EZ bar or cable)",
  cameraView: "side",
  setupHint: "Side view, full body in frame",
  rep: { metric: "elbowAngle", start: 150, turn: 60 },
  phaseLabels: {
    idle: "GET SET",
    ready: "ARMS DOWN",
    "moving-out": "CURLING",
    turn: "TOP",
    "moving-back": "LOWERING",
  },
  rules: [
    {
      id: "elbow-drift",
      metric: "upperArmTilt",
      max: 25,
      message: "Keep your elbows pinned to your sides",
    },
    {
      id: "torso-swing",
      metric: "torsoAngle",
      min: 75,
      message: "Stand tall, no swinging",
    },
  ],
};
