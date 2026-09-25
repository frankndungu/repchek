# Architecture

Repchek is a browser-based workout form coach. A phone camera watches a lift, the system judges form in real time (green for good, red for broken), counts reps and sets, logs every rep with a verdict, and sends a session summary via Telegram.

Everything runs on-device in the browser: no app install, no server-side video processing, no footage leaving the phone.

## The pipeline

Every video frame flows through five stages. Each stage maps to a folder in
`src/`.

### 1. The eyes: pose estimation (`src/engine/pose.ts`)

MediaPipe Pose Landmarker, a pre-trained model from Google, takes each frame and outputs 33 body landmarks (shoulders, hips, knees, ankles and so on) as coordinates. We train nothing; we consume the model the way you consume an API.

Details in docs/02-pose-estimation.md.

### 2. The geometry: angle calculation (`src/engine/angles.ts`)

Raw coordinates become meaningful numbers. Given three landmarks (hip, knee,
ankle) the angle at the middle point is computed with atan2. Output per frame
is a small set of named angles like `kneeAngle: 87`.

### 3. The judge: rules engine (`src/engine/judge.ts`)

Where "good form" lives. Rules per exercise (for a deadlift: spine angle stays
within a range) are checked against the current angles. Output is a verdict
per frame: green or red, plus which rule failed. Plain logic on numbers, no
machine learning.

### 4. The counter: state machine (`src/engine/repCounter.ts`)

A rep is a journey through states (setup, descending, bottom, ascending,
lockout). The state machine tracks the journey on a key angle and counts a rep
when the cycle completes. Reps roll up into sets, sets into a session, and
idle pose between sets marks rest periods.

### 5. The memory and the messenger (`src/storage/`, `api/`)

Every rep is logged locally (IndexedDB) with a timestamp, form verdict, and
metrics. At session end the phone posts a summary to a serverless function,
which forwards it to the Telegram Bot API.

## Engine vs profiles

The engine (stages 1 to 5) never changes per exercise. Each exercise is a
profile in `src/profiles/`: a config object declaring which angles to track,
the form rules, the rep trigger thresholds, and the expected camera angle.
Adding squats means writing `squat.ts`, not editing engine code. This is
data-driven design: exercises are data, not code.

Honest caveat: each exercise still needs its own thinking (camera placement
differs, rules differ), so "supports all exercises" means "supports any
exercise you write a profile for".

## Key decisions

- Browser over Python: Python dominates model training and data analysis;
  Morgan does neither. It runs a pre-trained model live on a phone, and the
  browser is the only runtime that does that with zero install. MediaPipe's
  core is C++ either way; we use its WASM binding instead of its Python
  binding, so no model quality is lost.
- On-device over server: zero latency for live feedback, zero video upload,
  zero server cost.
- Bar tracking in v1 uses the wrist midpoint as a proxy for bar position
  (hands hold the bar), which gives bar path and velocity for free from the
  pose model. Proper plate detection with an object detection model is a v2
  upgrade.
- Assets are self-hosted: the model file and WASM engine ship from our own
  `public/`, so the app has no runtime dependency on third-party CDNs.
