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

### New domain: repchek.fit

Repchek moved from repchek.vercel.app to repchek.fit. The share card and
the clip watermark now say repchek.fit. The page also has a description
and Open Graph tags, so a link posted on Reddit or Twitter shows a title
and a line about what Repchek does instead of a bare URL.

### Founding member offer

The first paid offer: 5 founding spots at $50 a year, with the price
locked forever. Rep counting and form feedback stay free. The money funds
what comes next: progress across weeks, a deadlift setup check and spoken
cues. Payment goes through a Polar checkout, which takes cards from any
country.

Every setting is in src/founding.ts: the price, the number of spots, the
spots taken (updated by hand after each payment), the checkout link and
the perks. The offer shows up in three places:

- A row under Start camera on the start screen, which opens the founding
  sheet with the price, the perks and the checkout button.
- A card on the summary, between the coaching notes and Share. It only
  shows when the session counted at least one rep. That is the moment
  Repchek has just worked for someone: they have seen their reps counted
  and their form called out, so the ask comes right after the proof
  instead of before anyone has tried it.
- repchek.fit/#founding opens the sheet directly, for posting the offer.

Polar sends a paying customer back to repchek.fit/?paid=1, which shows a
welcome screen with their founding member number and what happens next.
When all the spots are taken, the start screen row and the summary card
disappear, and the sheet says the spots are gone.

Analytics events: founding_open (with where it was opened from: start,
summary or hash), founding_checkout when the Polar button is tapped, and
founding_paid when the welcome screen shows. Together they show where
people drop off between seeing the offer and paying.

## Day 17 (2026-10-05): Home workouts first

### The niche

Repchek works best when the camera can see all of you. On the floor or
standing, it gets every joint it needs. On a bench or a machine, the
equipment hides part of the body, and that is where the false alarms
come from. The best feedback so far came from a free weight lift too:
Evans used it on bent-over barbell rows and said it really helped with
form. So Repchek now leads with home workouts and free weights.

The exercise chips are grouped by where you train instead of by muscle:

- At home: push-ups and mountain climbers.
- Free weights: deadlift, barbell row, biceps curl and overhead triceps
  extension.
- At the gym: bench press, incline bench, chest fly, lat pulldown and
  triceps pushdown.

The gym section starts folded, under "At the gym: benches and machines",
with a line warning that equipment hides your body and to expect false
alarms. It opens by itself when one of its lifts is the chosen exercise,
and stays open while you pick between chips. Push-up is now the default.

### Start screen

The start screen used to explain nothing before asking for the camera.
Now, from the top:

- The pitch says "A trainer watching your home workout." instead of "Form
  coach. Live. On your phone."
- A short looping demo clip sits right under the header, with a caption on
  what red means and how to rewatch a rep. If the clip cannot load, the
  whole block hides instead of leaving an empty frame.
- Evans's quote sits under the clip. It lives in founding.ts as
  TESTIMONIAL, and an empty quote hides the card.

The founding row on the start screen now says what the money is for:
"Tracking is coming. Founding members get it first." The founding sheet
says the same thing: fixing your form stays free, and founding members
fund progress tracked week by week. Evans's quote is on the sheet too,
under the price.

### Why the button is pinned

Start camera used to sit at the very bottom of the page. With the demo
clip and the quote added above the chips, it would have been even further
down, below the fold on most phones. Someone who has seen enough after the
clip should not have to scroll past the exercise list, the targets and the
phone settings to find it. The status line, Start camera and "Free. No
sign-up." are now in a bar pinned to the bottom of the screen, so the
button is one tap away from anywhere on the page. The bar pads itself for
the iPhone home indicator. The founding row and the credits stay in the
page above it.

### Measuring the funnel

Two new analytics events: session_start when the camera is on screen with
the model loaded, with the exercise, and session_complete when the summary
shows, with the exercise, the reps and which session this is on this
phone (a counter in localStorage). With page views, these show how many
visitors start a session, how many finish one, and how many come back for
a second.

### Front view push-ups: the lock dropped me and the count stopped at 2

Two recordings with the phone on the floor in front of me. With the back
camera it kept saying "Step into view" and counted nothing. With the front
camera it counted 2 of 12. It looked like a camera problem and was not. The
front camera only worked while I was watching the screen, for the first two
reps. As soon as I looked down it failed the same way.

I ran both recordings through the pose model on a laptop and then through
the engine code, frame by frame. Two separate bugs.

Bug 1, the lifter lock. At the bottom of a push-up seen from the front, my
head hides my body, and the model sometimes returns me twice: the real pose
and a squashed copy on top of it. The lock treated the copy as a second
person and gave it a track. On the next frame my real pose was matched to
that track, and the lock was left on a track with nobody in it. Once
counting has started the lock never switches, so every frame after that was
thrown away: the model saw a person in about half of all frames and the
lock discarded them. After 1.5 seconds the gate switched off and waited for
a one second hold that never comes in the middle of a set.

Fix, in lifter.ts:

- A pose lying on top of a bigger pose (its shoulders and most of its box
  inside the bigger one) is the same person seen twice, and is dropped.
- A track only counts as a second person once it keeps being seen in the
  same frame as the lifter. Until then it chooses last, so it cannot take
  the lifter's pose.
- When the lifter's track finds nothing and one unclaimed pose is left
  within half a screen width of where the lifter last was, it is the
  lifter. With the phone close, a body moves further across the screen
  than the old limit allowed.
- The "More than one person seen" tip now waits for a proven second
  person, so a ghost does not trigger it.

Bug 2, the rep measurement. The rep was shoulder height above the wrists,
divided by shoulder width. At the bottom the model squashes the two
shoulders together, from about 0.31 of the screen to 0.01, so the number
shot up when it should have dropped to half, and the bottom was never
reached. The elbows and wrists also fell below the confidence bar there, so
those frames were skipped anyway. The height of the shoulders stayed good
the whole time, and the hands never move.

Fix: a new engine/reference.ts remembers where the hands are and how wide
the shoulders look, from the frames where both arms are seen clearly
(mostly the top of each rep). The front view rep is now the live shoulder
height against the remembered hands, over the remembered width. A profile
can also list requiredWhileCounting: the front push-up needs the full arms
to start and only the shoulders once counting has begun.

Replayed through the engine, before and after:

- Front camera clip, 12 reps: 0 before (the phone counted 2), 12 after.
- Back camera clip, first attempt, 16 reps: 0 before, 16 after.
- Back camera clip, second attempt, 3 reps: 1 before, 3 after.
- Frames where a person was seen but the lock discarded them: 58, 49 and
  25 percent before, 0 after.

What this does not fix: the elbow check. In the lower half of the rep the
shoulders are squashed in about 9 frames out of 10, so elbow flare can only
be judged in 7 to 10 percent of those frames. The rule now skips the frames
it cannot judge, so it does not give false alarms, but from this angle it
will also miss real flare. The front position counts reps reliably now. It
does not yet check elbows reliably.

The replay ran on a laptop with the same model file, not on the phone, so
the numbers on the phone will differ a little. Test it there before
trusting it.

Lesson, again: record it, read the numbers, then change the code. The
camera was a wrong guess that two recordings made look right.

## Founding member offer removed

The founding member offer is gone: the start screen row, the summary card,
the offer sheet, the welcome screen, the testimonial card, the Polar
checkout link and the code behind them. Nobody signed up. Premium replaces
it later. The history above is kept as it was.

## Sessions saved to the account, and the Profile tab

Every finished session with at least one rep is saved to Supabase, one row
in `sessions`, with the full record kept as JSON for the history screen
later. If the phone is offline the session waits on the device and is sent
the next time the app opens or the user opens Profile. A session is never
saved twice: the database refuses a repeat of the same session id.

Rules, all in `src/progress.ts` and covered by tests:

- XP is clean reps. Nothing else earns it, so it is not stored.
- Finishing level n takes 100 x (n + 1) XP. Level 4 is 500, as in the mockup.
- A week counts when it has 3 sessions. The streak is weeks in a row that
  counted. The week in progress adds to the streak once it is done and
  never breaks it. Weeks start on Monday, in the user's own time zone.
- Milestones are worked out from the saved sessions. Seven for now.

Plans live in `profiles.plan`. A user cannot change their own plan: the
database only lets them change their name. Premium is set by hand in
Supabase, until payments exist.

The SQL is in `supabase/migrations`. Tests of the row rules were run in
Supabase as a signed in user, a different user and the account owner.

Not built yet: History, Challenges, leaderboards, the weight unit setting,
and payments. The Profile screen leaves out the leaderboard and weight unit
rows for that reason.

## History tab and the four tabs

Tabs are now Train, History, Challenges and Profile, each with an icon.

History lists saved sessions. A free account sees the last 7 days. Older
sessions stay saved and show as a locked tile with their count. Premium
sees every session. The 7 day limit is applied in the app, not in the
database: it is a plan feature, not a security rule, and the Profile totals
need the older sessions too. If it ever needs to be firm, it should move to
a database function.

Challenges is a "coming soon" screen. The upgrade sheet has no checkout, so
its button is off until payments exist.

## Free side of the new plan: complete history, reports, improvement signal

Product split agreed: free records the training and builds the habit,
Premium interprets it (charts, trends, comparisons, progression advice, and
later an AI coach). Free now has:

- Complete history. The 7 day limit and the locked tile are gone.
- Reopen any past session's report from History.
- An "am I improving" card on History: this week's clean rate against last
  week's, with a small chart of the last 5 sessions. It follows the exercise
  chip that is selected.
- A "vs last time" line on every report, against the last session of the
  same exercise. The first session of an exercise says so.
- Personal bests per exercise on Profile: most clean reps in a session and
  best clean rate (sessions of 10 reps or more).

History is grouped by week with calm tiles and exercise chips. Logic is in
`src/history.ts` and `src/progress.ts`, with tests.

Next: the free share card gets the improvement line, per set data capture
for analytics, then Premium analytics and the upgrade screen, then payments.

## Premium analytics

History now has Sessions and Progress. Progress is the Premium product.

Premium sees, per exercise and for 4 weeks, 12 weeks or all time:

- A clean rate chart.
- What we noticed: the clean rate trend, which set form slips in, the most
  common fault and how it is changing, reps that slow down through a set,
  and partial reps.
- What to try next, from the last three sessions: more weight (2.5 kg) after
  three clean sessions at a weight, more reps for bodyweight, clean up form
  when the rate is under 70%, or hold.
- A comparison of any two sessions.
- A record timeline across every exercise.

A free account sees a blurred chart of their own data and one real sentence
about their trend, plus what Premium adds. Under 3 sessions of an exercise
it says how many are missing.

Everything is worked out from what is already saved (`src/analytics.ts`,
with tests). No new data is captured. The engine's depth reading stops at
the turning point, so it only separates full from partial reps, which the
record already stores. Real range of motion needs a new measurement and
should be tried on a phone first.

As with the old history limit, the Premium gate is in the app, not the
database. The analytics read the user's own sessions, so this is a plan
feature and not a secret. Premium loads the newest 500 sessions.
