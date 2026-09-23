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
