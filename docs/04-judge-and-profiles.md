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

The registry (`src/profiles/index.ts`) is the single list of profiles, and
the judge is created from whichever one the session uses. Adding an
exercise is one new profile file, one line in the registry and one entry in
the exercise list below; no engine or UI code changes.

## Exercises and profiles

What the user picks is an exercise; what the app measures is a profile.
Most exercises have one profile. A few, like push-ups and mountain
climbers, have two: one for the phone beside you (side view) and one for
the phone in front of you (front view). The start screen shows one chip per
exercise, grouped by muscle (Chest, Back, Arms, Core), and for an exercise
with two profiles asks "Where is your phone?". The choice is remembered per
exercise.

The two profiles stay separate because the two views see different
things. From the side you can see whether the body stays in a straight line
from shoulders to ankles, but not the elbows flaring out. From the front
you see the elbows and whether the shoulders stay level, but the body line
points straight at the camera. So the side push-up checks for sagging or
piking and the front push-up checks elbow flare, with different metrics,
rep triggers and ready checks. Merging them would mean one profile full of
rules that only work from one angle.

The exercise list (`EXERCISES` in the same file) maps each exercise to its
profiles by id. Sessions are still saved with the profile id, so history
and everything downstream find their profile exactly as before. On screen,
in clips, on the summary and on the share card the lift is called by its
exercise name ("Push-up"); only the debug line says which version ran
("Push-up (front)").

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
for review between reps. For mid-rep, when you cannot look at the phone,
the coach speaks a short cue (below). The start screen's "Coach voice"
setting chooses Voice, Beep (the old 880 Hz square wave from
`src/ui/audio.ts`) or Off. Audio is unlocked inside the Start Camera tap
because browsers require a user gesture before playing sound.

## Coach cues

Each rule carries a `cue`: two or three words the coach says out loud when
it fails, like "Chest up" or "Elbows in". The banner message explains the
fault; the cue is what you can take in mid-rep, so it is kept short.
Speech uses the phone's built-in voice (`src/ui/voice.ts`), with an English
voice picked if the phone's default speaks another language.

A fault usually lasts many frames, so without some rules the coach would
nag. `say()` never queues cues, because a cue said a second late is about
a rep that is already over. The same cue is not repeated within 3 seconds.
A different cue can cut off the one being spoken, but only after it has
had 0.8 seconds to be heard. With several faults at once, only the first
failing rule is spoken.

iPhones only allow a page to speak after speech has been started once
during a tap. So the Start tap speaks an empty, silent sentence
(`warmUp()`). Without it, every cue, which comes from the camera loop and
not a tap, would be silently ignored on iOS.
