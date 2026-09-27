# Rep counter, sets and rest

Stage 4 of the pipeline: counting. A state machine on one number.

## A rep is a round trip

Each profile names a trigger metric and two values: start (where a rep
begins and ends) and turn (the far end of the movement). Deadlift uses the
hip angle: about 160 standing, 90 at the bottom. Pulldown, bench and curl
use the elbow angle.

The machine (`src/engine/repCounter.ts`) is always in one phase:

- idle: not yet in position
- ready: in the start zone
- moving-out: left the start zone, heading to the turn
- turn: in the turn zone
- moving-back: heading home

Leave start, reach turn, return to start: one rep, with its duration
measured from the moment you left the start zone. From idle the machine can
wake in either zone, so a deadlift that begins on the floor counts its
first pull.

## Hysteresis

The zones have a margin of 15 percent of the range. With start at 160 and
turn at 90, "at start" means above about 150 and "at turn" means below
about 100. Without the margin a landmark jittering across a single
threshold would count phantom reps. This is hysteresis, the same idea as
the judge's debounce expressed in values instead of frames.

## Partials

The machine tracks how far into the range each attempt got. Leaving start
and returning without reaching the turn is a partial rep if the attempt got
past 40 percent of the range, and is ignored as a wobble below that. Partials
are announced on screen and recorded per set.

## Readiness gate

The bug: counting started as soon as the camera saw a person, so the
movement of getting into position was counted and judged as part of the
set. Getting down into a plank passes through the same zones as a rep, and
the half-set-up body breaks form rules. A clean 1x8 push-up set scored 75
percent because the setup was scored as bad reps and faults.

The fix is a gate in front of the counter (`src/engine/readiness.ts`).
While it is off, nothing is counted and nothing is judged, and the counter
pill says why ("Get into your plank", "Hold still"). It switches on, or
arms, when all four of these are true:

1. You are seen clearly. Frames with no person, or low confidence, do not
   count toward arming.
2. You are in the start zone of the rep, the same zone the counter uses.
3. You pass the profile's `ready` checks, if it has any. A ready check is a
   metric with a min, a max or both, like a form rule.
4. You hold still like that for 1 second. Still means the rep metric moves
   less than a quarter of the rep range. Drift more and the second starts
   over.

Why 1 second: in a recording of normal push-ups, the pause at the top
between reps was 0.6 to 0.9 seconds. A hold longer than any natural pause
means the gate arms when you deliberately settle into position, not on a
passing pause while you are still moving.

It disarms, and you have to set up and hold again, in two cases:

- after each set, so walking back to the bar or getting back down for the
  next set is not counted
- when you cannot be seen properly for 1.5 seconds. Shorter tracking blips
  are normal and are ignored

Conditions 1, 2 and 4 come from the rep trigger, so every exercise
gets the gate with no extra work. The `ready` checks are the part you add
by hand. The rule for new exercises: add a `ready` check if standing around
or walking up to the equipment could look like the start position. Standing
with your arms down puts your wrists where they are at the top of a
push-up, so the push-up checks that your torso is near horizontal. The
deadlift has no check, because standing next to the bar looks the same as
standing with it, and bending down to grip is the lowering half of rep 1,
so counting from standing is correct.

## Sets and rest

`SessionTracker` (`src/engine/session.ts`) sits on top of the counter with
a target of sets and reps. A set closes in one of two ways:

- the rep target is reached
- 20 seconds pass without a completed rep, after at least one rep

The second is rest detection: no button, Morgan notices you stopped. When a
set closes the rep count resets, the label shows REST until the next rep,
and after the last set the session is done.

Each closed set keeps its rep count, partial count and every rep's duration.
This record is the data shape that logging and the session summary use.

## What the counter unlocks

Rules that only make sense at one moment of the rep (arms fully extended at
the top of a pulldown) can now be gated to a phase. Rep durations give rep
timing and, later, fatigue detection when reps slow down late in a set.
