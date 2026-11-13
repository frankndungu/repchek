import type { ExerciseProfile } from "../engine/types";

// Mike Tyson push-up: start with the hips high and knees bent, dive forward
// and down into the bottom of a push-up, then push back to hips high. The hip
// angle (shoulder, hip, knee) is about 90 with the hips high and opens to 150
// or more when the body is long and low. Provisional: from one video, not yet
// tuned on recorded sets.
export const tysonPushUp: ExerciseProfile = {
  id: "tyson-push-up",
  name: "Mike Tyson push-up",
  cameraView: "side",
  bodyweight: true,
  setupHint: "Side view, phone on the floor, whole body in frame",
  requiredJoints: ["shoulder", "elbow", "wrist", "hip", "knee"],
  rep: { metric: "hipAngle", start: 100, turn: 150 },
  ready: [
    {
      metric: "torsoAngle",
      max: 20,
      hint: "Hands on the floor, hips high",
    },
  ],
  phaseLabels: {
    idle: "GET SET",
    ready: "HIPS UP",
    "moving-out": "DIVING",
    turn: "BOTTOM",
    "moving-back": "PUSHING BACK",
  },
  rules: [
    {
      id: "dip-low",
      metric: "elbowAngle",
      // Only at the bottom: the elbows should bend as the chest dips.
      max: 130,
      phase: "turn",
      message: "Dip your chest lower at the bottom",
      cue: "Lower",
    },
  ],
};
