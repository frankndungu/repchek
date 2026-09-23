# The judge and exercise profiles

Stage 3 of the pipeline: turning metrics into a verdict. This is where
"good form" is defined, and it is defined as data, not code.

## Profiles are data

An exercise profile (`src/profiles/`) is a config object:

- `rep`: which metric swings during a rep, and its start and turn values
- `phaseLabels`: lifter-language names for the machine's phases
- `rules`: a list of form rules
- `cameraView` and `setupHint`: how to place the phone

A rule says: this metric must stay between min and max, and here is the
message when it does not. Optionally, a rule applies only in one phase.

```ts
{ id: "bar-path", metric: "barOffset", max: 0.5,
  message: "Keep the bar close to your legs" }
```

The registry (`src/profiles/index.ts`) is the single list of profiles. The
picker on the start screen is built from it and the judge is created from
whichever entry the user picks. Adding an exercise is one new file plus one
line in the registry; no engine or UI code changes.

## The judge

`Judge.evaluate(metrics, phase)` checks every applicable rule against the
current frame and returns a verdict: ok, or a list of failed rules. It is
plain comparison on numbers, no machine learning.

Two protections against noise:

- Debouncing: a rule must fail for five consecutive frames before it is
  reported. A single jittery landmark cannot flash the screen red.
- Phase gating: a rule with a `phase` only applies in that phase, and its
  fail streak resets outside it.

## Metrics

Every frame produces a `FrameMetrics` object (`src/engine/angles.ts`):

- Six joint angles, left and right: knee, hip, elbow
- The camera-facing side's hip, knee and elbow angles as `hipAngle`,
  `kneeAngle`, `elbowAngle`, so profiles name one number
- `torsoAngle`: torso from horizontal, 90 upright, 0 flat
- `neckAngle`: ear, shoulder, hip; near 180 for a neutral spine
- `barOffset`: horizontal wrist-to-ankle distance in torso lengths
- `forearmTilt` and `upperArmTilt`: a limb segment's angle from vertical

Two rules for making metrics robust:

- Body-relative units. Distances are measured in torso lengths so a rule
  means the same thing at any camera distance.
- Near side only. From a side view the far side of the body is occluded and
  its landmarks are guesses. Metrics use the side with the higher visibility
  score.

Before any of this, landmark x values are multiplied by the frame's aspect
ratio. Normalized coordinates scale x and y differently on non-square
frames, which skews angles if left uncorrected.

## Calibration, honestly

Every threshold is a starting guess tuned against one lifter's readings from
the debug line. Anatomy differs, so the same profile will not fit everyone.
The right long-term answer is in-app calibration: measure a person's neutral
setup and derive their thresholds from it. Until then, thresholds live in
the profile files and are tuned by hand.

## Feedback channels

The verdict drives two channels. The skeleton color and banner message are
for review between reps. The beep (`src/ui/audio.ts`, an 880 Hz square wave
from the Web Audio API) is for mid-rep, when you cannot look at the phone.
Audio is unlocked inside the Start Camera tap because browsers require a
user gesture before playing sound.
