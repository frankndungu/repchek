import type { ExerciseProfile } from "../engine/types";

export const barbellRow: ExerciseProfile = {
  id: "barbell-row",
  name: "Bent-over barbell row",
  cameraView: "side",
  setupHint: "Side view, full body in frame, bar visible",
  rep: { metric: "elbowAngle", start: 160, turn: 80 },
  ready: [
    {
      metric: "torsoAngle",
      min: 10,
      max: 70,
      hint: "Hinge over the bar",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "ARMS DOWN",
    "moving-out": "PULLING",
    turn: "BAR AT TORSO",
    "moving-back": "LOWERING",
  },
  rules: [
    {
      id: "torso-too-upright",
      metric: "torsoAngle",
      max: 70,
      message: "Stay bent over, do not stand up with the bar",
      cue: "Stay bent",
    },
    {
      id: "torso-too-flat",
      metric: "torsoAngle",
      min: 15,
      message: "Chest up, hips too high",
      cue: "Chest up",
    },
    {
      id: "neck-angle",
      metric: "neckAngle",
      min: 145,
      message: "Eyes forward, keep your back straight",
      cue: "Eyes forward",
    },
  ],
};
