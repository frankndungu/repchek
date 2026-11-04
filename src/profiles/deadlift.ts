import type { ExerciseProfile } from "../engine/types";

export const deadlift: ExerciseProfile = {
  id: "deadlift",
  name: "Deadlift",
  cameraView: "side",
  setupHint: "Side view, full body in frame, bar visible",
  // No ready check: standing by the bar looks the same as standing with it, and bending to grip is the lowering half of rep 1, so counting from standing is correct.
  rep: { metric: "hipAngle", start: 160, turn: 90 },
  phaseLabels: {
    idle: "GET SET",
    ready: "STANDING",
    "moving-out": "LOWERING",
    turn: "BOTTOM",
    "moving-back": "PULLING",
  },
  rules: [
    // The old "torso-angle" rule (torso at least 15 degrees from flat, "hips
    // are shooting up") is gone. A flat back at the bottom of a hinge is
    // correct, and in two recorded sets of good form the torso reads 0 to 5
    // degrees there, so the rule flagged every rep. Catching hips that rise
    // before the chest needs a different measure. Look at the debug numbers
    // before adding one.
    {
      id: "neck-angle",
      metric: "neckAngle",
      // Was 145. Only a clearly dropped head, not a head that hangs a little
      // at the bottom. Provisional, until the debug numbers are in.
      min: 130,
      message: "Eyes forward, keep your back straight",
      cue: "Eyes forward",
    },
    {
      id: "bar-path",
      metric: "barOffset",
      // Was 0.5. Provisional, until the debug numbers are in.
      max: 0.7,
      message: "Keep the bar close to your legs",
      cue: "Bar closer",
    },
  ],
};
