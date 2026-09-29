# Lifter lock: who is the lifter?

In a busy gym the camera often sees more than one person: a spotter, a
friend filming, someone walking past. The pose model finds up to three
people each frame, and `LifterLock` (`src/engine/lifter.ts`) decides which
one is the lifter. Only that person is drawn, counted and judged.

## The spotter problem

The first version picked the biggest person on screen, then followed
whoever was nearest to the lifter's last position. On bench press that goes
wrong. A spotter standing at the lifter's head looks bigger than a lifter
lying down, so they got picked first. And they stand close to the lifter,
so if the model missed the lifter for a single frame, the nearest person
was the spotter, and the lock jumped to them for good.

Checking posture (lying on the bench) helps, but the posture checks were
written for a camera side-on. Filmed from the front or at an angle, a real
lifter can fail them.

## Tracks

Each person gets a track: where their shoulders are, and the last two
seconds of how their arms moved. Every frame, each pose the model finds is
given to the track it is nearest to, closest pairs first. So the spotter's
pose always goes to the spotter's track, even in a frame where the lifter
was missed. The lifter's track just finds no pose that frame, which is
reported as "lifter not found", and the lifter is not swapped for anyone.

## The score

Each track gets a score. Highest is most likely the lifter.

- Movement, the strongest part: how much the wrists and elbows went up and
  down over the last two seconds, compared with the person's size. A lifter
  repeats a movement, a spotter mostly stands still. This works from any
  camera angle, because every exercise moves the arms.
- Posture, a medium part: a bonus for passing the exercise's ready checks,
  like lying on the bench. Only a bonus, never a requirement, so a lifter
  filmed from an unusual angle is not ruled out.
- Size, a small part: how big the body looks. Only a tie breaker.

The weights (3, 2 and 1) are first guesses. When more than one person is in
view, the debug line shows everyone's score, with the lifter marked by a
star, for example "people 4.6* 1.1", so they can be tuned on real clips.

For the bench example: the lifter pressing scores about 4.6 (moving,
lying down, a bit smaller), the spotter standing still about 1.1 (not
moving, standing, bigger).

## Staying on one person

The first pick is the highest score. After that we stay with that person:

- Before counting starts, we switch only if someone else has scored at
  least 30 percent higher for a second and a half in a row. So the
  skeleton does not flick between two people who score about the same.
- Once counting has started we never switch. If the lifter is hidden, the
  readiness gate decides when they count as lost, as before.
- When a set ends we choose again by score. The arm movement history is
  kept, so the person who just did the reps still scores highest.

## Tap to lock

If the app still picks the wrong person, tap yourself on the screen. The
tap is matched to the person whose nearest joint is closest to it (with
the front camera the picture is mirrored, so the tap is flipped to match),
and a notice says "Locked onto you". A tap lock turns off automatic picking
until the session ends, or until that person has not been seen for 3
seconds. The first time more than one person is seen, a notice says "More
than one person seen. Tap yourself to lock on."
