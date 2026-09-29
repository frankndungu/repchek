import { computeFrameMetrics } from "./angles";
import { passesCheck } from "./readiness";
import type { ExerciseProfile, Landmark, ReadyCheck } from "./types";
import { LANDMARK } from "./types";

// In a busy gym the camera often sees more than one person. LifterLock
// decides which of them is the lifter, every frame.
//
// Posture first, size second. The profile's ready checks describe the
// lifter's start position (lying on the bench, in a plank, ...). A spotter
// standing at the head of the bench can look bigger than the lifter lying
// down, but they fail "lying on the bench", so they are not a candidate.
//
// The rules:
//   - First pick: the biggest person who passes the ready checks, or the
//     biggest of everyone if nobody passes yet.
//   - After that we follow that person from frame to frame, by where their
//     shoulders are (see follow). We do not jump to someone else just
//     because they look better for one frame.
//   - Before counting starts, we switch to someone else only if they have
//     been the better choice for a whole second in a row: they pass the
//     ready checks while our person does not, or they are clearly bigger.
//   - Once counting has started we never switch. If the lifter is not found
//     in a frame, we say so, and the readiness gate decides when they count
//     as lost.
//   - A tap on someone locks onto them (see chooseAt). Then there is no
//     automatic switching at all, until that person has not been seen for 3
//     seconds or the session ends.

// Further than this from the lifter's last spot, as a share of the screen
// width, and it is not the lifter.
const MAX_JUMP = 0.25;

// A pose this close to where the lifter just was is taken to be the lifter
// even if it fails the ready checks. The checks describe the start of a
// rep, and some lifts leave that posture mid-rep (the lat pulldown bar
// comes down to the chest), so without this a lifter on their own would be
// dropped halfway through every rep. Much smaller than MAX_JUMP, so a
// spotter standing nearby is not mistaken for the lifter.
const SAME_PERSON_RADIUS = 0.1;

// Before counting, how long someone else must be the better choice, frame
// after frame, before we switch to them.
const SWITCH_AFTER_MS = 1000;

// "Clearly bigger" means at least this many times the size.
const CLEARLY_BIGGER = 1.3;

// A tap lock ends when that person has not been seen for this long.
const TAP_LOCK_LOST_MS = 3000;

// Below this, a landmark counts as not seen.
const MIN_VISIBILITY = 0.5;

interface Point {
  x: number;
  y: number;
}

// One detected person, with what we need to compare them.
interface Person {
  pose: Landmark[];
  shoulders: Point;
  size: number;
  // Passes the profile's ready checks (always true if it has none).
  fits: boolean;
}

function midpoint(a: Landmark, b: Landmark): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function shoulderMid(pose: Landmark[]): Point {
  return midpoint(
    pose[LANDMARK.LEFT_SHOULDER],
    pose[LANDMARK.RIGHT_SHOULDER],
  );
}

// Landmarks are 0 to 1 across the width and 0 to 1 down the height, which
// are different lengths on a non-square video. Distances here are measured
// in screen widths, so y is scaled by height / width (1 / aspect).
function distance(a: Point, b: Point, aspect: number): number {
  return Math.hypot(a.x - b.x, (a.y - b.y) / aspect);
}

// How big the body looks: shoulders to ankles, or shoulders to hips when
// the ankles are not seen. Measured along the body, not straight up, so a
// lifter lying on a bench is not mistaken for someone small.
function bodySize(pose: Landmark[], aspect: number): number {
  const leftAnkle = pose[LANDMARK.LEFT_ANKLE];
  const rightAnkle = pose[LANDMARK.RIGHT_ANKLE];
  const anklesSeen =
    Math.max(leftAnkle.visibility, rightAnkle.visibility) >= MIN_VISIBILITY;
  const end = anklesSeen
    ? midpoint(leftAnkle, rightAnkle)
    : midpoint(pose[LANDMARK.LEFT_HIP], pose[LANDMARK.RIGHT_HIP]);
  return distance(shoulderMid(pose), end, aspect);
}

function biggest(people: Person[]): Person | null {
  let best: Person | null = null;
  for (const person of people) {
    if (!best || person.size > best.size) best = person;
  }
  return best;
}

// Only people in the start posture are candidates. If nobody is (the
// lifter is still setting up), everyone is.
function candidates(people: Person[]): Person[] {
  const fitting = people.filter((person) => person.fits);
  return fitting.length > 0 ? fitting : people;
}

export class LifterLock {
  private readonly checks: ReadyCheck[];
  // Where the lifter's shoulders were the last time they were found.
  private last: Point | null = null;
  private lastFoundAt = 0;
  // Someone who looks like a better choice than our person, before
  // counting starts, and since when they have looked better.
  private challenger: { at: Point; since: number } | null = null;
  // Set by a tap: follow this person, never switch automatically.
  private tapLocked = false;
  // This frame's poses, for mapping a tap to a person.
  private seen: Landmark[][] = [];
  private aspect = 1;

  constructor(profile: ExerciseProfile) {
    this.checks = profile.ready ?? [];
  }

  // How many people were in the last frame.
  get peopleSeen(): number {
    return this.seen.length;
  }

  get isTapLocked(): boolean {
    return this.tapLocked;
  }

  // Choose the lifter from this frame's poses, or null if the lifter is
  // not among them. `armed` is whether the readiness gate is on, `aspect`
  // the video's width / height, `now` the frame time in ms.
  pick(
    poses: Landmark[][],
    armed: boolean,
    aspect: number,
    now: number,
  ): Landmark[] | null {
    this.seen = poses;
    this.aspect = aspect;
    if (this.tapLocked && now - this.lastFoundAt > TAP_LOCK_LOST_MS) {
      this.tapLocked = false;
    }
    if (poses.length === 0) return null;

    const people = poses.map((pose) => this.describe(pose, aspect));
    let chosen: Person | null;
    if (!this.last) {
      // Nobody picked yet: take the best candidate straight away.
      chosen = biggest(candidates(people));
    } else if (this.tapLocked || armed) {
      // Follow our person, never switch.
      chosen = this.follow(people, aspect);
    } else if (people.length === 1) {
      // Before counting, with one person in view, there is no one to
      // confuse them with.
      chosen = people[0];
      this.challenger = null;
    } else {
      chosen = this.followOrSwitch(people, aspect, now);
    }

    if (chosen) {
      this.last = chosen.shoulders;
      this.lastFoundAt = now;
    }
    return chosen?.pose ?? null;
  }

  // Lock onto the person nearest to a tap. `point` is in the same 0 to 1
  // image coordinates as the landmarks. Returns false if nobody was near.
  chooseAt(point: Point, now: number): boolean {
    let best: Landmark[] | null = null;
    let bestDistance = Infinity;
    for (const pose of this.seen) {
      // Distance to the nearest visible joint, so a tap anywhere on the
      // body counts, not just on the shoulders.
      for (const landmark of pose) {
        if (landmark.visibility < MIN_VISIBILITY) continue;
        const d = distance(landmark, point, this.aspect);
        if (d < bestDistance) {
          bestDistance = d;
          best = pose;
        }
      }
    }
    if (!best) return false;
    this.tapLocked = true;
    this.last = shoulderMid(best);
    this.lastFoundAt = now;
    this.challenger = null;
    return true;
  }

  // A set has ended: forget the automatic pick, so the next set starts by
  // choosing again. A tap lock is kept, it lasts the whole session.
  newSet(): void {
    if (!this.tapLocked) this.last = null;
    this.challenger = null;
  }

  // The session has ended: forget everything, tap lock included.
  reset(): void {
    this.last = null;
    this.challenger = null;
    this.tapLocked = false;
  }

  private describe(pose: Landmark[], aspect: number): Person {
    let fits = true;
    if (this.checks.length > 0) {
      const metrics = computeFrameMetrics(pose, aspect);
      fits = this.checks.every((check) => passesCheck(check, metrics));
    }
    return {
      pose,
      shoulders: shoulderMid(pose),
      size: bodySize(pose, aspect),
      fits,
    };
  }

  // Find our person in this frame, or null if they are not in it.
  //   1. Anyone right where they just were (SAME_PERSON_RADIUS) is them,
  //      whatever their posture, because some lifts leave the start
  //      posture mid-rep.
  //   2. Failing that (they moved further while hidden for a moment), the
  //      nearest person within MAX_JUMP who is in the start posture. A
  //      spotter standing over the bench is out of posture, so they are
  //      never taken for the lifter, even when the lifter is missed.
  // A tap lock only uses rule 1, so it can never move to someone else.
  private follow(people: Person[], aspect: number): Person | null {
    const from = this.last;
    if (!from) return null;
    const nearest = (list: Person[], radius: number): Person | null => {
      let best: Person | null = null;
      let bestDistance = radius;
      for (const person of list) {
        const d = distance(person.shoulders, from, aspect);
        if (d <= bestDistance) {
          bestDistance = d;
          best = person;
        }
      }
      return best;
    };
    const samePerson = nearest(people, SAME_PERSON_RADIUS);
    if (samePerson || this.tapLocked) return samePerson;
    return nearest(
      people.filter((person) => person.fits),
      MAX_JUMP,
    );
  }

  // Before counting: keep following our person, unless someone else has
  // been the better choice for SWITCH_AFTER_MS in a row.
  private followOrSwitch(
    people: Person[],
    aspect: number,
    now: number,
  ): Person | null {
    const followed = this.follow(people, aspect);
    const rival = biggest(
      candidates(people).filter((person) => person !== followed),
    );
    const better =
      rival !== null &&
      (followed === null ||
        (rival.fits && !followed.fits) ||
        rival.size >= followed.size * CLEARLY_BIGGER);

    if (!better) {
      this.challenger = null;
      return followed;
    }

    // Is this the same rival as last frame? If not, their second starts
    // over.
    const sameRival =
      this.challenger !== null &&
      distance(rival.shoulders, this.challenger.at, aspect) <= MAX_JUMP;
    if (!this.challenger || !sameRival) {
      this.challenger = { at: rival.shoulders, since: now };
    } else {
      this.challenger.at = rival.shoulders;
    }

    if (now - this.challenger.since >= SWITCH_AFTER_MS) {
      this.challenger = null;
      return rival;
    }
    return followed;
  }
}
