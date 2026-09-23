# M.O.R.G.A.N. Development Log

## Day 1 (2026-09-19): Scaffold, camera, and first skeleton

Built the foundation and got live pose tracking working end to end.

### What got built

- Project scaffold: Vite + vanilla TypeScript, folder structure mirroring the
  five-stage architecture (see docs/00-architecture.md)
- Deployment pipeline: GitHub repo wired to Vercel, HTTPS URL live on every push
- Camera acquisition: rear-facing stream via getUserMedia with proper error handling
- Pose estimation: MediaPipe Pose Landmarker running on-device in the browser,
  green skeleton drawn over the live feed at real time speed

### Stack choices

- TypeScript: the engine passes 33-landmark arrays around, and typed indices
  turn silent bugs into compile errors
- Vite: zero-config dev server and bundler, current standard
- No framework: the core of the app is a 30fps render loop, not UI state,
  and React would fight that pattern instead of helping it
- MediaPipe tasks-vision: pre-trained pose model, WASM engine, runs on-device,
  no server and no ML training required
- Vercel: free HTTPS hosting (camera access requires a secure context) and
  automatic deploys on push

### Bug 1: PowerShell is not Bash

`mkdir -p api docs ...` failed with a parameter binding error. PowerShell reads
`-p` as its `-Path` parameter and takes lists comma-separated, and `touch` does
not exist there at all. Lesson: when a command fails with a parameter binding
error, suspect a shell dialect issue before suspecting the command.

### Bug 2: the CSS that ate the afternoon

Symptom: eternal "Loading pose model..." screen, no camera, no skeleton.

Evidence: the console showed "Graph successfully started running" and a stack
trace of the render loop processing frames. So the engine was fine, which meant
the bug had to be visual.

Diagnosis: main.ts hides the start screen by setting the `hidden` attribute.
`hidden` only works because the browser's built-in stylesheet applies
`display: none` to hidden elements. Our own CSS set `display: flex` on
`#start-screen`, and author CSS outranks browser defaults in the cascade, so
the fully working app sat behind an opaque black div the whole time.

Fix: one rule.

    #start-screen[hidden] { display: none; }

Lesson: a computer vision app is still a web app, and debugging it is mostly
web debugging. Evidence first, then diagnosis, then the fix is usually small.

### Milestone

First live skeleton, tracking arms and face in real time. Posted the clip as
Day 1 on Instagram, 300 views.

## Day 2 (2026-09-20): Documentation day

Wrote the documentation before moving forward: architecture overview, camera
concepts, and pose estimation concepts. The rule for this project is that docs
keep pace with code, one concept doc per step. Next up is Step 4, angle math,
where landmarks become joint angles and Morgan starts measuring instead of
just seeing.

### Day 3, evening: Morgan gets opinions, first gym test

Step 5 complete. The judge: declarative rules per exercise (metric, min,
max, message), debounced over five frames so landmark jitter cannot cause
false reds. Deadlift profile with torso angle and bar path rules. Red
skeleton, red banner with the message, and an 880 Hz beep from the Web Audio
API so I can hear form breaks mid-rep without looking.

Two corrections along the way. Angles on normalized coordinates are skewed on
non-square frames (x and y are scaled differently), fixed with an aspect
ratio correction before any math. And side view occludes the far side of
the body, so metrics now use only the camera-facing side, picked by
visibility score, instead of left and right midpoints.

First gym test on the deadlift. Morgan flagged "hips are shooting up" with
torso at -3 degrees and I could not argue: shoulders level with hips,
head down. It was right.

## Day 4 (2026-09-22): Feedback, more exercises, second gym session

Posted the deadlift clip and got form feedback from commenters: back
rounded, head down, hips too high. They were right, and Morgan had already
flagged the same pattern from a different angle. Turned the feedback into
code: a neck angle metric (ear, shoulder, hip) that measures the neutral
spine line directly, a new deadlift rule on it, and a cyan spine guide drawn
on the overlay so I can see the line straighten during setup.

Rule of the day: a neutral spine is a straight line from ear to hip, not a
curve. Hips below shoulders, chest up, eyes a couple of meters ahead.

Built the exercise picker: a profile registry, a dropdown built from it, a
camera hint per exercise. Added lat pulldown, bench press and biceps curl
profiles with two new metrics, forearm tilt and upper arm tilt (angle of a
limb segment from vertical). The debug readout now shows whichever metrics
the active profile judges.

Second gym session, four exercises. Morgan corrected my lat pulldown, which
I had been doing with too much lean, and the deadlift setup was better after
the feedback. One false alarm on bench: wrists were stacked but the camera
angle made the forearm read as tilted. Camera placement matters more than
the code.

Realistic note from a quote tweet: everyone's anatomy differs. True, which
is why every threshold is calibrated to my body from my own readings, not a
universal standard. In-app calibration is on the roadmap.

## Day 5 (2026-09-23): Rep counter, sets and rest

Step 6 complete. The rep counter is a state machine on one trigger metric
per exercise (hip angle for deadlift, elbow angle for the rest): idle,
ready, moving out, turn, moving back. A rep is a round trip from the start
zone through the turn zone and home. Zones have a 15 percent margin as
hysteresis, so jitter at a boundary cannot count phantom reps. Half reps
that turn around past 40 percent of the range are reported as partials.

Caught one bug in review before it reached the gym: the machine only woke
up in the start zone, so a deadlift starting from the floor would never
count its first pull. Now it can wake up in either zone.

The judge is phase aware: a rule can be limited to one phase. Profiles name
their phases in lifter language (STANDING, LOWERING, BOTTOM, PULLING).

Sets on top of reps: a session tracker with a target (4 by 12 by default,
editable on the start screen). A set closes on hitting the target or after
20 seconds without a rep, which is how rest is detected without a button.
The counter reads Set 1/4, Reps 3, PULLING, then REST, then Set 2/4.

Each closed set keeps its rep count, partials and every rep duration. That
record is the data shape for logging and the Telegram summary.

Also today: first LinkedIn post about the project.

Next: Step 7, logging every rep and set on the device.
