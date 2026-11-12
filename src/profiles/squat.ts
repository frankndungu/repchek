import type { ExerciseProfile } from "../engine/types";

// Squat, bodyweight or with a weight. Counts the knee bending from standing
// (about 175 degrees) to the bottom (about 90). Provisional: reasoned from the
// body, not yet tuned on recorded sets.
export const squat: ExerciseProfile = {
  id: "squat",
  name: "Squat",
  cameraView: "side",
  // Bodyweight by default. A goblet or barbell squat adds its kilos on setup.
  bodyweight: true,
  setupHint: "Stand sideways to the phone, whole body in frame",
  requiredJoints: ["shoulder", "hip", "knee", "ankle"],
  rep: { metric: "kneeAngle", start: 160, turn: 95 },
  ready: [
    {
      metric: "torsoAngle",
      min: 60,
      hint: "Stand tall",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "STANDING",
    "moving-out": "LOWERING",
    turn: "BOTTOM",
    "moving-back": "STANDING UP",
  },
  rules: [
    {
      id: "chest-up",
      metric: "torsoAngle",
      // Lenient: a forward lean is normal, folding over is not.
      min: 30,
      message: "Keep your chest up",
      cue: "Chest up",
    },
  ],
};
