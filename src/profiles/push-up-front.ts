import type { ExerciseProfile } from "../engine/types";

export const pushUpFront: ExerciseProfile = {
  id: "push-up-front",
  name: "Push-up (front view)",
  cameraView: "front",
  bodyweight: true,
  setupHint:
    "Phone on the floor in front of you, facing your head. Catches elbow flare",
  // At the bottom the head hides the arms, so the elbows and wrists are
  // lost on most reps. The shoulders are enough to count: the hands are
  // remembered from the top (engine/reference.ts).
  requiredWhileCounting: ["shoulder"],
  // Auto-calibrated. start 0.8 is the lowest plausible top, the real top
  // is learned from the readiness hold and the bottom is half of it.
  rep: { metric: "shoulderOverWrist", start: 0.8, turn: 0.4, turnRatio: 0.5 },
  ready: [
    {
      metric: "hipDrop",
      max: 0.9,
      hint: "Get into your plank",
    },
  ],
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
      cue: "Tuck your elbows",
    },
  ],
};
