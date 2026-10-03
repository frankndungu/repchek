# Repchek Development Log

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

## Day 6 (2026-09-24): Confidence floor and session logging

Feedback from Reddit: when part of the body is hidden, the pose model still
guesses where the joints are, and Morgan was judging those guesses as if
they were real. Now every frame gets a confidence score, the lowest
visibility across the joints the exercise needs. Below 0.6 the frame is
skipped: no judging, no rep counting, and the skeleton turns grey so you
know the camera cannot see you properly. Green is good, red is a fault,
grey is "I can't see".

Also fixed the HUD overlapping itself on small screens.

Step 7 complete: logging. Every session is saved on the phone in
IndexedDB, and nothing leaves the device. Each rep keeps its duration and
the form rules it broke, each set keeps its reps and partials, and the
session keeps the exercise and the weight. An End session button closes
it out.

Also today: picked the lime design from three start screen mockups, and
decided to build the summary screen now instead of later.

Next: a summary screen and a share card, so a finished session has
somewhere to go.

## Day 7 (2026-09-25): New look, nine new exercises, new name

Rebuilt the UI in Tailwind from the lime mockup: big wordmark, exercise
chips, and sets, reps and weight on one row. Two new screens:

- Summary after every session: total reps, clean percentage, average rep
  time, a bar per set, and "What Repchek noticed", plain notes built from
  the logged faults and rep times. Short sessions get softer advice,
  because three reps is not enough data to tell someone to drop the weight.
- Share card: a 1080 by 1350 image with the lift, the numbers and the
  coaching notes, sent through the phone's share sheet straight to
  WhatsApp or Instagram. This replaced the Telegram bot idea.

Exercises went from four to thirteen: barbell row, incline bench, chest
fly, overhead triceps extension, cable triceps pushdown, push-ups and
mountain climbers, plus the first front view profiles for push-ups and
mountain climbers. Front view needed new metrics measured against shoulder
width instead of torso length, because from the front the torso is
foreshortened, and the confidence check looks at both arms instead of one
side.

Bodyweight exercises: the weight field becomes "Extra kg", and blank means
bodyweight only.

New name. Morgan became Repchek, briefly morgan-pt on the way. The site is
now repchek.vercel.app. Added Vercel Analytics to see if anyone actually
uses it, and a credits line with contact details on the start screen.

## Day 8 (2026-09-26): Instant finish, and push-ups that did not count

The Finish button waited for the save to complete before showing the
report, which felt frozen. Now the report shows instantly and the save
happens in the background.

The bigger problem: a set of 16 push-ups counted zero. Instead of guessing,
I screen-recorded a set with the debug line visible, pulled frames out at
10 per second, read the debug line with OCR, and replayed the rep counter
against the real numbers. The cause: the trigger assumed a camera at hip
height. With the phone on the floor, the drop from top to bottom looks much
smaller on screen, so reps never reached the bottom zone. Recalibrated from
the recording, and the replay counted 16 of 16. The neck rule was firing on
good reps, so it is gone. On the front view, elbow flare is now only
checked at the bottom of the rep.

Committed the next morning. Lesson: record it, read the numbers, then
change the code.

## Day 9 (2026-09-27): Readiness gate

A clean 1 by 8 push-up set scored 75 percent. The reps were fine. The
problem was everything before them: Repchek started counting and judging the
moment it saw me, so getting down into the plank was scored as reps and
form faults.

Fix: a readiness gate in front of the counter. Nothing is counted or judged
until I am seen clearly, in the start position, passing the exercise's
posture checks, and holding still for one second. The second comes from a
recording: normal pauses at the top between push-ups are 0.6 to 0.9
seconds, so a full second only happens on purpose. The gate switches off
after every set, and when I am out of view for 1.5 seconds, so setting up
for the next set is never counted either.

Posture checks per exercise: plank for push-ups, hands overhead for
pulldown and overhead extension, upright for curls and pushdowns, lying
back for chest fly. Deadlift gets none, because standing next to the bar
looks the same as standing with it, and bending down to grip is the
lowering half of rep 1.

Rule going forward: any new exercise where standing around could look like
the start position gets a ready check.

## Day 15 (2026-10-03): Rolling start for bench press

On bench press the readiness gate wanted a one second hold at lockout
before it would count. Nobody benches like that: you unrack and start
pressing. In a real clip, 7 reps were done before the gate armed, and all
7 were lost.

Fix: bench press and incline bench now have a rolling start. While the
gate is off, a second rep counter (the probe) watches every clear frame
where you are lying back on the bench. The first full rep, lockout down to
the bottom and back up, arms the gate and counts as rep 1, with any form
faults the probe saw during it. Everything else that happens when the gate
arms (the whistle, the set clip) happens then too. The one second hold
still works if you do pause at lockout.

The rep has to start at lockout, so pressing the bar out of the rack, or
the dumbbells up off your chest, is not taken for a rep. Losing sight of
you, or sitting up, starts the probe over.

Once armed, a frame where you are not lying back (racking the bar and
sitting up) is skipped: not counted, not judged, and the gate stays on.
This is only for the rolling start lifts for now. Some other exercises
have ready checks that fail in the middle of a normal rep (the lat
pulldown's hands overhead check fails at the bottom of every pull), so
skipping those frames would stop them counting.

One gap: the set clip starts when the gate arms, which is the end of rep
1, so rep 1 itself is not in the clip.

### Triceps pushdown range

Triceps pushdown missed about half the reps. Real clips show the elbow at
about 100 to 120 degrees at the top and 150 to 169 at the bottom, but the
profile expected 90 to 165, so most reps never reached one end or the
other. The trigger is now 115 to 150, measured from those clips. With the
counter's zone margin, anything up to about 120 counts as the top and
anything from about 145 as the bottom.
