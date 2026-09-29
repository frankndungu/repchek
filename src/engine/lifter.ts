import { computeFrameMetrics } from "./angles";
import { passesCheck } from "./readiness";
import type { ExerciseProfile, Landmark, ReadyCheck } from "./types";
import { LANDMARK } from "./types";

// In a busy gym the camera often sees more than one person. LifterLock
// decides which of them is the lifter, every frame.
//
// It keeps a "track" for each person: where they are and a short history
// (HISTORY_MS) of how their arms moved. Each frame, every pose the model
// finds is matched to the track it is nearest to, so a person keeps the
// same track from frame to frame. See docs/07-lifter-lock.md.
//
// Each track gets a score. Highest score is most likely the lifter:
//   - Movement (strongest): how much the wrists and elbows went up and down
//     lately. The lifter repeats a movement, a spotter mostly stands still.
//     This works from any camera angle.
//   - Posture (medium): passes the exercise's ready checks, like lying on
//     the bench. Only a bonus, never a requirement, because the checks were
//     written for one camera angle and can misjudge another.
//   - Size (small): how big the body looks. Only a tie breaker.
//
// Then:
//   - The first pick is the highest score.
//   - Before counting starts, we switch to someone else only if they have
//     scored clearly higher (CLEARLY_HIGHER) for SWITCH_AFTER_MS in a row.
//     So the skeleton does not flick between people.
//   - Once counting has started we never switch. If the lifter's track
//     finds no pose this frame, we say the lifter is not found and the
//     readiness gate decides when they count as lost. A spotter standing
//     close by has their own track, so they are never handed the lifter's.
//   - A tap on someone locks onto them (see chooseAt): no automatic
//     switching until that person has not been seen for TAP_LOCK_LOST_MS or
//     the session ends.

// Score weights. First guesses, to be tuned on real gym clips.
const MOVEMENT_WEIGHT = 3;
const POSTURE_WEIGHT = 2;
const SIZE_WEIGHT = 1;

// Movement this big or more gets full marks. It is the standard deviation
// of the wrists' and elbows' height, as a share of body size. A normal rep
// is about this much; standing still is close to 0.
const FULL_MOVEMENT = 0.2;

// How much arm movement history each track keeps.
const HISTORY_MS = 2000;
// Less history than this is too little to judge movement.
const MIN_HISTORY_MS = 500;

// A pose is only matched to a track within this distance of where that
// person last was, as a share of the screen width.
const MAX_JUMP = 0.25;

// A track not matched for this long is forgotten. Longer than the gate's
// 1.5 s lost time and the tap lock's 3 s, so a lifter hidden for a moment
// comes back on the same track.
const FORGET_AFTER_MS = 3000;

// Before counting, someone else must score at least this many times our
// person's score, for SWITCH_AFTER_MS in a row, before we switch.
const CLEARLY_HIGHER = 1.3;
const SWITCH_AFTER_MS = 1500;

// A tap lock ends when that person has not been seen for this long.
const TAP_LOCK_LOST_MS = 3000;

// Below this, a landmark counts as not seen.
const MIN_VISIBILITY = 0.5;

// The joints whose up and down movement we measure.
const LIMBS = [
  LANDMARK.LEFT_WRIST,
  LANDMARK.RIGHT_WRIST,
  LANDMARK.LEFT_ELBOW,
  LANDMARK.RIGHT_ELBOW,
];

interface Point {
  x: number;
  y: number;
}

// One moment in a track's history.
interface Sample {
  at: number;
  // Height of each LIMBS joint, NaN when that joint was not seen.
  limbY: number[];
  // Body size in the same units as the heights, to compare people who are
  // near the camera with people far away.
  bodyScale: number;
}

// One person, followed from frame to frame.
interface Track {
  shoulders: Point;
  lastSeenAt: number;
  samples: Sample[];
  // This frame only: the pose matched to this track (null if none), and
  // the score it got.
  pose: Landmark[] | null;
  score: number;
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

// A body size to measure movement against, in screen heights (the same
// unit as the joint heights). The larger of shoulder width and torso
// length: from the side the shoulders overlap and their width is close to
// 0, from the front a lifter lying down has a very short torso on screen.
function bodyScale(pose: Landmark[], aspect: number): number {
  const ls = pose[LANDMARK.LEFT_SHOULDER];
  const rs = pose[LANDMARK.RIGHT_SHOULDER];
  const shoulders = shoulderMid(pose);
  const hips = midpoint(pose[LANDMARK.LEFT_HIP], pose[LANDMARK.RIGHT_HIP]);
  const shoulderWidth = Math.hypot((ls.x - rs.x) * aspect, ls.y - rs.y);
  const torso = Math.hypot(
    (shoulders.x - hips.x) * aspect,
    shoulders.y - hips.y,
  );
  return Math.max(shoulderWidth, torso);
}

function takeSample(pose: Landmark[], aspect: number, at: number): Sample {
  return {
    at,
    limbY: LIMBS.map((i) =>
      pose[i].visibility >= MIN_VISIBILITY ? pose[i].y : NaN,
    ),
    bodyScale: bodyScale(pose, aspect),
  };
}

function standardDeviation(values: number[]): number {
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

// How much the wrists and elbows went up and down over the history, as a
// share of body size. 0 until there is at least MIN_HISTORY_MS of it.
function movement(samples: Sample[]): number {
  if (samples.length < 2) return 0;
  if (samples[samples.length - 1].at - samples[0].at < MIN_HISTORY_MS) {
    return 0;
  }
  const scale =
    samples.reduce((sum, s) => sum + s.bodyScale, 0) / samples.length;
  if (scale <= 0) return 0;

  let total = 0;
  let joints = 0;
  LIMBS.forEach((_, j) => {
    const heights = samples
      .map((s) => s.limbY[j])
      .filter((y) => Number.isFinite(y));
    // A joint hidden most of the time would only add noise.
    if (heights.length < samples.length / 2) return;
    total += standardDeviation(heights);
    joints += 1;
  });
  return joints > 0 ? total / joints / scale : 0;
}

function best(tracks: Track[]): Track | null {
  let top: Track | null = null;
  for (const track of tracks) {
    if (!top || track.score > top.score) top = track;
  }
  return top;
}

export class LifterLock {
  private readonly checks: ReadyCheck[];
  private tracks: Track[] = [];
  // The track we think is the lifter.
  private lock: Track | null = null;
  // Set by a tap: follow this person, never switch automatically.
  private tapLocked = false;
  // Someone scoring clearly higher than our person, before counting
  // starts, and since when.
  private challenger: { track: Track; since: number } | null = null;
  private aspect = 1;

  constructor(profile: ExerciseProfile) {
    this.checks = profile.ready ?? [];
  }

  // How many people were in the last frame.
  get peopleSeen(): number {
    return this.visible().length;
  }

  get isTapLocked(): boolean {
    return this.tapLocked;
  }

  // Everyone's score this frame, highest first, the lifter marked with *.
  // For the debug line, to tune the weights.
  get scoreSummary(): string {
    return this.visible()
      .sort((a, b) => b.score - a.score)
      .map((t) => `${t.score.toFixed(1)}${t === this.lock ? "*" : ""}`)
      .join(" ");
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
    this.aspect = aspect;
    this.matchPoses(poses, aspect, now);
    this.scoreTracks(aspect);

    // Our person was forgotten (not seen for FORGET_AFTER_MS).
    if (this.lock && !this.tracks.includes(this.lock)) {
      this.lock = null;
      this.tapLocked = false;
    }
    if (this.tapLocked && now - this.lock!.lastSeenAt > TAP_LOCK_LOST_MS) {
      this.tapLocked = false;
    }

    if (!this.lock) {
      // Nobody picked yet: take the highest score straight away.
      this.lock = best(this.visible());
      this.challenger = null;
    } else if (!armed && !this.tapLocked) {
      this.maybeSwitch(now);
    }
    return this.lock?.pose ?? null;
  }

  // Lock onto the person nearest to a tap. `point` is in the same 0 to 1
  // image coordinates as the landmarks. Returns false if nobody was near.
  chooseAt(point: Point, now: number): boolean {
    let chosen: Track | null = null;
    let nearest = Infinity;
    for (const track of this.visible()) {
      // Distance to the nearest visible joint, so a tap anywhere on the
      // body counts, not just on the shoulders.
      for (const landmark of track.pose!) {
        if (landmark.visibility < MIN_VISIBILITY) continue;
        const d = distance(landmark, point, this.aspect);
        if (d < nearest) {
          nearest = d;
          chosen = track;
        }
      }
    }
    if (!chosen) return false;
    this.lock = chosen;
    chosen.lastSeenAt = now;
    this.tapLocked = true;
    this.challenger = null;
    return true;
  }

  // A set has ended: choose again for the next set, by score. The history
  // is kept, so the person who just did the reps still scores high. A tap
  // lock is kept, it lasts the whole session.
  newSet(): void {
    if (!this.tapLocked) this.lock = null;
    this.challenger = null;
  }

  // The session has ended: forget everyone, tap lock included.
  reset(): void {
    this.tracks = [];
    this.lock = null;
    this.tapLocked = false;
    this.challenger = null;
  }

  // Tracks that found a pose this frame.
  private visible(): Track[] {
    return this.tracks.filter((track) => track.pose !== null);
  }

  // Give each pose to the track it is nearest to, closest pairs first, so
  // two people standing close together do not swap tracks. A pose with no
  // track near it starts a new one.
  private matchPoses(poses: Landmark[][], aspect: number, now: number): void {
    for (const track of this.tracks) track.pose = null;

    const pairs: Array<{ pose: number; track: Track; d: number }> = [];
    poses.forEach((pose, p) => {
      const shoulders = shoulderMid(pose);
      for (const track of this.tracks) {
        const d = distance(shoulders, track.shoulders, aspect);
        if (d <= MAX_JUMP) pairs.push({ pose: p, track, d });
      }
    });
    pairs.sort((a, b) => a.d - b.d);

    const usedPoses = new Set<number>();
    for (const { pose, track } of pairs) {
      if (usedPoses.has(pose) || track.pose) continue;
      track.pose = poses[pose];
      usedPoses.add(pose);
    }
    poses.forEach((pose, p) => {
      if (usedPoses.has(p)) return;
      this.tracks.push({
        shoulders: shoulderMid(pose),
        lastSeenAt: now,
        samples: [],
        pose,
        score: 0,
      });
    });

    for (const track of this.tracks) {
      if (!track.pose) continue;
      track.shoulders = shoulderMid(track.pose);
      track.lastSeenAt = now;
      track.samples.push(takeSample(track.pose, aspect, now));
      track.samples = track.samples.filter((s) => now - s.at <= HISTORY_MS);
    }
    this.tracks = this.tracks.filter(
      (track) => now - track.lastSeenAt <= FORGET_AFTER_MS,
    );
  }

  private scoreTracks(aspect: number): void {
    const seen = this.visible();
    const sizes = seen.map((track) => bodySize(track.pose!, aspect));
    const biggest = Math.max(...sizes, 1e-6);
    seen.forEach((track, i) => {
      const moving = Math.min(1, movement(track.samples) / FULL_MOVEMENT);
      track.score =
        MOVEMENT_WEIGHT * moving +
        POSTURE_WEIGHT * (this.inPosture(track.pose!, aspect) ? 1 : 0) +
        SIZE_WEIGHT * (sizes[i] / biggest);
    });
  }

  // Passes the profile's ready checks. A profile with none gives nobody the
  // bonus, so it does not change who wins.
  private inPosture(pose: Landmark[], aspect: number): boolean {
    if (this.checks.length === 0) return false;
    const metrics = computeFrameMetrics(pose, aspect);
    return this.checks.every((check) => passesCheck(check, metrics));
  }

  // Before counting: switch only to someone who has scored clearly higher
  // than our person for SWITCH_AFTER_MS in a row. Our person scores 0 in a
  // frame where they are not seen.
  private maybeSwitch(now: number): void {
    const lock = this.lock!;
    const ours = lock.pose ? lock.score : 0;
    const rival = best(this.visible().filter((track) => track !== lock));
    const clearlyHigher =
      rival !== null &&
      rival.score > ours &&
      rival.score >= ours * CLEARLY_HIGHER;

    if (!rival || !clearlyHigher) {
      this.challenger = null;
      return;
    }
    // A different rival from last frame starts the clock over.
    if (this.challenger?.track !== rival) {
      this.challenger = { track: rival, since: now };
    }
    if (now - this.challenger.since >= SWITCH_AFTER_MS) {
      this.lock = rival;
      this.challenger = null;
    }
  }
}
