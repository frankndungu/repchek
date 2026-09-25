import type { ExerciseProfile } from "../engine/types";

export const mountainClimbersFront: ExerciseProfile = {
  id: "mountain-climbers-front",
  name: "Mountain climbers (front view)",
  cameraView: "front",
  bodyweight: true,
  setupHint:
    "Phone on the floor in front of you, facing your head. Counts both legs",
  rep: { metric: "kneeDrive", start: 0.4, turn: 1.0 },
  phaseLabels: {
    idle: "GET SET",
    ready: "PLANK",
    "moving-out": "DRIVING",
    turn: "KNEE IN",
    "moving-back": "EXTENDING",
  },
  rules: [
    {
      id: "shoulder-rock",
      metric: "shoulderTilt",
      max: 0.15,
      message: "Keep your shoulders level, no rocking",
    },
  ],
};
