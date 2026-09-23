import type { ExerciseProfile } from "../engine/types";

export const benchPress: ExerciseProfile = {
  id: "bench-press",
  name: "Bench press (dumbbell or barbell)",
  cameraView: "side",
  setupHint: "Side view at bench height, slightly above the weights",
  rep: { metric: "elbowAngle", start: 160, turn: 90 },
  phaseLabels: {
    idle: "GET SET",
    ready: "LOCKOUT",
    "moving-out": "LOWERING",
    turn: "BOTTOM",
    "moving-back": "PRESSING",
  },
  rules: [
    {
      id: "forearm-vertical",
      metric: "forearmTilt",
      max: 25,
      message: "Stack your wrists over your elbows",
    },
  ],
};
