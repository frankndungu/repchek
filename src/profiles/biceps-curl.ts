import type { ExerciseProfile } from "../engine/types";

export const bicepsCurl: ExerciseProfile = {
  id: "biceps-curl",
  name: "Biceps curl (dumbbell, EZ bar or cable)",
  cameraView: "side",
  setupHint: "Side view, full body in frame",
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
