import type { ExerciseProfile } from "../engine/types";

export const latPulldown: ExerciseProfile = {
  id: "lat-pulldown",
  name: "Lat pulldown",
  cameraView: "side",
  rules: [
    {
      id: "torso-lean",
      metric: "torsoAngle",
      min: 60,
      message: "Sit tall, you are leaning back too far",
    },
  ],
};
