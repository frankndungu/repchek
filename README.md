# Repchek

A workout form coach that runs entirely in the phone browser. Prop the phone
up at the gym, pick an exercise, tap Start. Morgan tracks your body live,
turns the skeleton red and beeps when your form breaks, counts your reps and
sets, and detects rest between sets. Nothing to install, no server, no video
leaves the device.

Built as a first computer vision project and documented step by step in
`docs/` and `DEVLOG.md`.

## What it does today

- Live pose tracking (33 landmarks) from the phone camera at real-time speed
- Form rules per exercise, green when good, red plus a beep when broken
- Rep counting with partial rep detection
- Sets against a target (4 by 12 by default), with automatic rest detection
- A spine guide overlay and live joint angles on screen

Exercises so far: deadlift, lat pulldown, bench press (barbell or
dumbbell), biceps curl (dumbbell, EZ bar or cable).

## How it works

Every video frame flows through five stages:

1. Eyes: MediaPipe Pose Landmarker outputs 33 body landmarks per frame
2. Geometry: landmarks become joint angles and body-relative metrics
3. Judge: per-exercise rules check the metrics and return a verdict
4. Counter: a state machine counts reps, partials, sets and rest
5. Memory and messenger: logging and session summaries (in progress)

Exercises are data, not code. Each one is a profile: a trigger metric for
rep counting, form rules with thresholds, and camera setup hints. Adding an
exercise is one new file and one line in the registry. See
`docs/00-architecture.md` for the full design.

## Stack

TypeScript, Vite, MediaPipe Tasks Vision (WASM, on-device), HTML canvas for
the overlay, Web Audio for the beep, Vercel for hosting. No framework, no
model training, and the model and WASM engine are self-hosted in `public/`.

## Run it locally

```bash
npm install
npm run dev
```

Open the local URL on the laptop for webcam testing. To test on a phone the
app must be served over HTTPS (the camera API requires a secure context), so
deploy to Vercel or use a tunnel. Camera placement matters: most exercises
expect a side view, full body in frame, two to three meters away.

## Project structure

src/
engine/ pose estimation, angle math, judge, rep counter, sessions
profiles/ one file per exercise plus the registry
ui/ overlay drawing, HUD, audio
camera.ts camera acquisition and mirroring
main.ts wires the pipeline together
docs/ one concept doc per step
DEVLOG.md the day-by-day build log

## Honest limitations

- Single camera, 2D. Faults that need a top or front view (elbow flare on
  bench) are not detected yet.
- Thresholds are calibrated to one lifter. Anatomy differs, and in-app
  calibration is on the roadmap.
- Lying exercises are noisier to track because the bench hides part of the
  body.

## Roadmap

- Logging every rep and set on the device
- Session summaries via Telegram with coaching suggestions from the data
- Video replay mode for tuning profiles against recorded clips
- Per-user calibration
- Bar path and velocity from the wrist midpoint
- More exercises: lateral raise, cable front raise, squat

Status: in active development.
