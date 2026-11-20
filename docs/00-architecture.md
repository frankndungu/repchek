# Architecture

repchek is a web app that watches you train through a phone camera. It counts
your reps (or seconds, for holds), checks your form against rules for each
exercise, records the set with your numbers on the video, and saves the
workout to your account so you can see your progress.

The computer vision runs on the device, in the browser. The camera video is
analysed there and is not uploaded. A small backend (Supabase) stores accounts
and workout records, and Polar handles payments for Premium.

## The pipeline

Every camera frame flows through these stages. Each maps to a file in
`src/engine/`, and `src/main.ts` wires them together.

### 1. The eyes: pose estimation (`pose.ts`)

MediaPipe Pose Landmarker (the lite model), a pre-trained model from Google,
outputs 33 body landmarks per person per frame, for up to three people. It runs
on the GPU through WebGL when it can and falls back to the CPU. Nothing is
trained here: the model is used the way you would use an API. The model file
and the WASM engine are served from `public/`, so there is no runtime CDN.

### 2. Who is training: lifter lock (`lifter.ts`)

When several people are in view, each gets a track, and the one whose posture
and movement fit the exercise is locked as the lifter. Only that person is
drawn, counted and judged. See `07-lifter-lock.md`.

### 3. The geometry: metrics (`angles.ts`, `reference.ts`)

Landmarks become numbers that mean something: knee, hip and elbow angles on
the side facing the camera, the torso angle from horizontal, the neck angle,
limb tilts, and ratios such as how far the wrists rise over the torso length.
Frames where the needed joints are not seen clearly are skipped, and the app
says which body part is out of frame. Front view floor exercises measure
against a remembered reference for the hands and shoulder width. See
`03-angle-math.md`.

### 4. Ready to count: readiness gate (`readiness.ts`)

Nothing is counted or judged while you walk in or get into position. The gate
arms once you are in the start zone of the rep, pass the exercise's posture
checks and hold still for one second. Some lifts can also arm on the first
full rep (a rolling start).

### 5. The counter: state machine (`repCounter.ts`)

A rep is a journey on one metric: from the start zone, out to the turn, and
back. Coming back counts a rep; turning back early, after at least 40 percent
of the way, is a partial. For a hold such as the plank, the counter instead
counts one for each second spent in position. See `05-rep-counter.md`.

### 6. The judge: rules (`judge.ts`)

Where good form is defined. A rule is a metric with a minimum and/or maximum,
optionally only in one phase of the rep, with a message for the screen and a
short cue for the voice. A rule must fail 5 frames in a row before it counts.
See `04-judge-and-profiles.md`.

### 7. The session (`session.ts`)

Reps roll up into sets against the target. Rest between sets is detected, not
tapped. The finished session is a plain record: every rep with its duration,
faults and time in the set. While a set runs, a checkpoint is kept in IndexedDB
(`src/storage/db.ts`), so a reload mid set can be recovered.

### 8. Output: screen, voice, recording, saving

- The live screen (`src/ui/hud.ts`) shows the rep count or the Stats bar (Set,
  Reps, Time, Pace and the Rest to Peak line), a pill saying what counting is
  waiting for, and a red banner for faults.
- The voice coach (`src/ui/voice.ts`) speaks short cues.
- The recorder (`src/ui/recorder.ts`) paints the frame, the skeleton and the
  stats onto a canvas and records it. See `06-recording.md`.
- The finished session is saved to the account (`src/account.ts`), and a queue
  retries if the phone is offline.

## Engine and profiles

The engine never changes per exercise. Each exercise is a profile in
`src/profiles/`: the rep metric with its start and turn, the posture checks,
the form rules, the camera view, and whether it is a hold. Adding an exercise
means writing a profile, not editing engine code.

What the user picks is an exercise; what the app measures is a profile. An
exercise can have two profiles, one for each phone position, because a side
view and a front view see different things (`EXERCISES` in
`src/profiles/index.ts`).

## The app around the engine

- **Screens** (`src/ui/`): Train (home), All exercises, Workout setup, the live
  screen, the summary with clips, History with Progress, Profile, Your streak,
  Challenges with the Hall of Gains, and the guided stretch player.
- **Plain logic** for those screens lives outside `src/ui/` with no DOM or
  network, so it can be tested: `train.ts`, `history.ts`, `analytics.ts`,
  `progress.ts`, `stats.ts`, `challenges.ts`, `stretches.ts`.
- **Backend** (`supabase/`): Postgres tables for profiles, sessions and
  challenges, all behind row level security. Challenges are only reached
  through database functions that check who is asking. Two edge functions
  handle Polar checkout and its webhooks.

## Key decisions

- **Browser over a native app or Python.** The job is to run a pre-trained
  model live on a phone with nothing to install. The browser does that, and
  MediaPipe's core is the same C++ either way, compiled to WASM here.
- **On the device over a server.** No video upload, live feedback without
  network delay, and no server cost for the vision work.
- **Rules over a trained classifier.** Form is defined as readable thresholds
  per exercise, so it can be explained, tested and tuned from recorded sets
  without collecting a labelled dataset.
- **Home and free weights first.** On the floor or standing, the camera sees
  the whole body. Benches and machines hide joints, so those lifts were set
  aside.
- **One camera, side view by default.** Most exercises are judged from the
  side, where the body line, depth and hinge are clearest. A front view is
  offered where it sees something the side cannot.
