import type { ExerciseProfile } from "../engine/types";

export const inclineBench: ExerciseProfile = {
  id: "incline-bench",
  name: "Incline bench press",
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
      max: 30,
      message: "Stack your wrists over your elbows",
    },
  ],
};
