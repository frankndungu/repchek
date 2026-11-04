import type { ExerciseProfile } from "../engine/types";

export const barbellRow: ExerciseProfile = {
  id: "barbell-row",
  name: "Bent-over barbell row",
  cameraView: "side",
  setupHint: "Full body in frame, bar visible",
  // Counting and form only use the head, shoulder, arm and hip on the side
  // facing the camera. Asking for the knee and ankle too threw frames away
  // whenever a plate or rack hid a foot, which delayed counting.
  requiredJoints: ["head", "shoulder", "elbow", "wrist", "hip"],
  // Provisional, from recorded sets: start was 160 and turn 80, which
  // needed almost straight arms and a very deep pull. Wider at both ends.
  rep: { metric: "elbowAngle", start: 150, turn: 90 },
  // Lifters hinge with the bar in their hands and row straight away, so the
  // first full rep arms counting, as on the bench press.
  rollingStart: true,
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
      // Was 145. Only a clearly dropped head. Provisional.
      min: 130,
      message: "Eyes forward, keep your back straight",
      cue: "Eyes forward",
    },
  ],
};
