import type { ExerciseProfile } from "../engine/types";

export const tricepsPushdown: ExerciseProfile = {
  id: "triceps-pushdown",
  name: "Triceps pushdown (cable)",
  cameraView: "side",
  setupHint: "Side view, standing at the cable, full body in frame",
  // Counting and form only use the upper body, so hidden legs are fine.
  requiredJoints: ["shoulder", "elbow", "wrist", "hip"],
  // Measured from real gym clips: lifters do not come all the way up to 90
  // or lock out to 165.
  rep: { metric: "elbowAngle", start: 115, turn: 150 },
  ready: [
    {
      metric: "torsoAngle",
      min: 60,
      hint: "Stand tall at the cable",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "ELBOWS BENT",
    "moving-out": "PUSHING",
    turn: "LOCKED OUT",
    "moving-back": "RETURNING",
  },
  rules: [
    {
      id: "elbow-drift",
      metric: "upperArmTilt",
      max: 25,
      message: "Keep your elbows pinned to your sides",
      cue: "Elbows in",
    },
    {
      id: "torso-lean",
      metric: "torsoAngle",
      min: 70,
      message: "Stand tall, do not lean into the bar",
      cue: "Stand tall",
    },
  ],
};
