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
//
// One person can come back from the model as two poses. It happens when the
// body is hard to read, like the bottom of a push-up filmed from the front,
// where the head hides the torso. The extra pose is a ghost: a squashed
// copy sitting on top of the real one. Left alone, the ghost starts a track
// of its own, the real pose gets matched to that track on the next frame,
// and our lock is left on a track nobody is in. So:
//   - Ghosts are removed before matching (see withoutGhosts).
//   - We only believe a track is a second person once it keeps being
//     seen in the same frames as the lifter (SEPARATE_AFTER_FRAMES). A
//     ghost that got through never is, because it shows up when the real
//     pose is missing or squashed.
//   - A track that is not a proven second person chooses last, so it
//     cannot take a pose from the lifter or from a real bystander.
//   - When the lifter's track finds nothing and one unclaimed pose is
//     left, near where the lifter last was, that pose is the lifter
//     (LONE_REACH), even after a jump too big for MAX_JUMP.

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

// When the lifter's track finds nothing and one unclaimed pose is left, it
// is taken for the lifter when it is within this distance of where the
// lifter last was. Wider than MAX_JUMP,
// because with the phone close a body moves a long way across the screen
// in the few frames the model can lose it for.
const LONE_REACH = 0.5;

// A second person is in view at the same time as the lifter. A track that
// has a pose on this many more of the lifter's frames than it misses is a
// second person, not another view of the lifter. The count stops rising at
// the cap, so someone who walks off is forgotten as a second person
// within a second or so.
const SEPARATE_AFTER_FRAMES = 10;
const SEEN_WITH_LIFTER_CAP = 30;

// A ghost lies on top of the real pose: at least this share of its box is
// inside the bigger one. A spotter standing behind a bench overlaps the
// lifter too, but most of their body is outside the lifter's box.
const GHOST_OVERLAP = 0.7;

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
  // Counted on frames where the lifter has a pose: up when this track has
  // one too, down when it does not.
  seenWithLifter: number;
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

// The box around a pose, from every landmark, in image coordinates.
interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

function boxOf(pose: Landmark[]): Box {
  const xs = pose.map((landmark) => landmark.x);
  const ys = pose.map((landmark) => landmark.y);
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

// How much of the screen a box covers. x is in screen widths and y in
// screen heights, which is fine for comparing two boxes in one frame.
function area(box: Box): number {
  return (box.right - box.left) * (box.bottom - box.top);
}

// The share of `box` that lies inside `other`, 0 to 1.
function shareInside(box: Box, other: Box): number {
  const width =
    Math.min(box.right, other.right) - Math.max(box.left, other.left);
  const height =
    Math.min(box.bottom, other.bottom) - Math.max(box.top, other.top);
  if (width <= 0 || height <= 0) return 0;
  const own = area(box);
  return own > 0 ? (width * height) / own : 1;
}

function inside(point: Point, box: Box): boolean {
  return (
    point.x >= box.left &&
    point.x <= box.right &&
    point.y >= box.top &&
    point.y <= box.bottom
  );
}

// Remove ghosts: a pose that lies on top of a bigger one (its shoulders and
// most of its box inside the bigger pose's box) is the same person seen
// twice, and the smaller one goes. A real second person stands beside or
// behind the lifter, with most of their body outside the lifter's box, so
// they are kept.
export function withoutGhosts(poses: Landmark[][]): Landmark[][] {
  if (poses.length < 2) return poses;
  const boxes = poses.map(boxOf);
  return poses.filter((pose, i) => {
    const shoulders = shoulderMid(pose);
    return !poses.some(
      (_, j) =>
        j !== i &&
        inside(shoulders, boxes[j]) &&
        shareInside(boxes[i], boxes[j]) >= GHOST_OVERLAP &&
        // The bigger box wins. On an exact tie the earlier pose wins, so
        // two identical poses do not remove each other.
        (area(boxes[j]) > area(boxes[i]) ||
          (area(boxes[j]) === area(boxes[i]) && j < i)),
    );
  });
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

  // Is someone other than the lifter in view? Ghosts and other stray
  // poses do not count, only a proven second person.
  get hasCompany(): boolean {
    return this.tracks.some(
      (track) =>
        track !== this.lock &&
        track.pose !== null &&
        track.seenWithLifter >= SEPARATE_AFTER_FRAMES,
    );
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

  // Give each pose to a track. A pose with no track near it starts a new
  // one. In order:
  //   1. Ghosts are dropped.
  //   2. The lifter and proven second people take their nearest pose,
  //      closest pairs first, so two people standing close together do
  //      not swap tracks.
  //   3. If the lifter got nothing and one pose is left, near where the
  //      lifter last was, it is the lifter.
  //   4. Everyone else takes what is left, closest pairs first.
  private matchPoses(all: Landmark[][], aspect: number, now: number): void {
    for (const track of this.tracks) track.pose = null;
    const poses = withoutGhosts(all);

    const lock =
      this.lock && this.tracks.includes(this.lock) ? this.lock : null;
    const proven = (track: Track) =>
      track === lock || track.seenWithLifter >= SEPARATE_AFTER_FRAMES;
    const usedPoses = new Set<number>();

    // Closest pairs first, among these tracks and the poses still free.
    const matchNearest = (tracks: Track[]) => {
      const pairs: Array<{ pose: number; track: Track; d: number }> = [];
      poses.forEach((pose, p) => {
        if (usedPoses.has(p)) return;
        const shoulders = shoulderMid(pose);
        for (const track of tracks) {
          const d = distance(shoulders, track.shoulders, aspect);
          if (d <= MAX_JUMP) pairs.push({ pose: p, track, d });
        }
      });
      pairs.sort((a, b) => a.d - b.d);
      for (const { pose, track } of pairs) {
        if (usedPoses.has(pose) || track.pose) continue;
        track.pose = poses[pose];
        usedPoses.add(pose);
      }
    };

    matchNearest(this.tracks.filter(proven));

    const free = poses.map((_, p) => p).filter((p) => !usedPoses.has(p));
    if (lock && !lock.pose && free.length === 1) {
      const d = distance(shoulderMid(poses[free[0]]), lock.shoulders, aspect);
      if (d <= LONE_REACH) {
        lock.pose = poses[free[0]];
        usedPoses.add(free[0]);
      }
    }

    matchNearest(this.tracks.filter((track) => !proven(track)));

    poses.forEach((pose, p) => {
      if (usedPoses.has(p)) return;
      this.tracks.push({
        shoulders: shoulderMid(pose),
        lastSeenAt: now,
        seenWithLifter: 0,
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
    // A second person is in view on the same frames as the lifter. A ghost
    // that got through shows up when the lifter's own pose is missing, so
    // on the lifter's frames it is nearly always absent and its count
    // stays near 0. Frames without the lifter change nothing, so a real
    // bystander stays proven while the lifter is hidden.
    if (lock?.pose) {
      for (const track of this.tracks) {
        if (track === lock) continue;
        track.seenWithLifter = track.pose
          ? Math.min(track.seenWithLifter + 1, SEEN_WITH_LIFTER_CAP)
          : Math.max(track.seenWithLifter - 1, 0);
      }
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
