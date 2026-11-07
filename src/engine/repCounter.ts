import type {
  ExerciseProfile,
  FrameMetrics,
  ReadyCheck,
  RepPhase,
  RepTrigger,
} from "./types";
import { passesCheck } from "./readiness";

export interface RepEvent {
  type: "rep" | "partial";
  count: number;
  durationMs: number;
}

// A hold counts one for every second spent in position.
const HOLD_TICK_MS = 1000;

const ZONE_MARGIN = 0.15;
const PARTIAL_MIN_PROGRESS = 0.4;

export class RepCounter {
  private trigger: RepTrigger;
  private phase: RepPhase;
  private count: number;
  private repStartedAt: number;
  private deepestProgress: number;
  private latestProgress = 0;
  // For a hold: the posture checks that mean "in position", and when the
  // next second is due. Null when this is a counter of reps.
  private readonly holdChecks: ReadyCheck[] | null;
  private nextTickAt: number | null = null;

  constructor(trigger: RepTrigger, holdChecks?: ReadyCheck[]) {
    this.trigger = trigger;
    this.holdChecks = holdChecks ?? null;
    this.phase = "idle";
    this.count = 0;
    this.repStartedAt = 0;
    this.deepestProgress = 0;
  }

  get currentPhase(): RepPhase {
    return this.phase;
  }

  get reps(): number {
    return this.count;
  }

  // Where the last frame was in the rep, from 0 at the start position (rest)
  // to 1 at the turn (peak). For the gauge on the live screen.
  get progress(): number {
    return this.latestProgress;
  }

  reset(): void {
    this.phase = "idle";
    this.count = 0;
    this.deepestProgress = 0;
    this.latestProgress = 0;
    this.nextTickAt = null;
  }

  update(metrics: FrameMetrics, nowMs: number): RepEvent | null {
    if (this.holdChecks) return this.updateHold(metrics, nowMs);
    const value = metrics[this.trigger.metric];
    const { start, turn } = this.trigger;
    const range = Math.abs(start - turn);
    const margin = range * ZONE_MARGIN;
    const startIsHigh = start > turn;

    const atStart = startIsHigh
      ? value >= start - margin
      : value <= start + margin;
    const atTurn = startIsHigh
      ? value <= turn + margin
      : value >= turn - margin;
    const progress = Math.min(1, Math.abs(value - start) / range);
    this.latestProgress = progress;

    switch (this.phase) {
      case "idle":
        if (atStart) {
          this.phase = "ready";
        } else if (atTurn) {
          this.phase = "turn";
          this.repStartedAt = nowMs;
        }
        return null;

      case "ready":
        if (!atStart) {
          this.phase = "moving-out";
          this.repStartedAt = nowMs;
          this.deepestProgress = progress;
        }
        return null;

      case "moving-out":
        this.deepestProgress = Math.max(this.deepestProgress, progress);
        if (atTurn) {
          this.phase = "turn";
        } else if (atStart) {
          this.phase = "ready";
          if (this.deepestProgress >= PARTIAL_MIN_PROGRESS) {
            return {
              type: "partial",
              count: this.count,
              durationMs: nowMs - this.repStartedAt,
            };
          }
        }
        return null;

      case "turn":
        if (!atTurn) this.phase = "moving-back";
        return null;

      case "moving-back":
        if (atStart) {
          this.count += 1;
          this.phase = "ready";
          return {
            type: "rep",
            count: this.count,
            durationMs: nowMs - this.repStartedAt,
          };
        }
        if (atTurn) this.phase = "turn";
        return null;
    }
  }

  // A hold: out of position, nothing counts and the clock starts over. In
  // position, each full second counts as one.
  private updateHold(metrics: FrameMetrics, nowMs: number): RepEvent | null {
    const inPosition = (this.holdChecks ?? []).every((check) =>
      passesCheck(check, metrics),
    );
    if (!inPosition) {
      this.phase = "idle";
      this.nextTickAt = null;
      this.latestProgress = 0;
      return null;
    }
    this.latestProgress = 1;
    if (this.nextTickAt === null) {
      this.phase = "turn";
      this.nextTickAt = nowMs + HOLD_TICK_MS;
      return null;
    }
    if (nowMs < this.nextTickAt) return null;
    this.nextTickAt += HOLD_TICK_MS;
    this.count += 1;
    return { type: "rep", count: this.count, durationMs: HOLD_TICK_MS };
  }
}

// The counter for a profile: seconds held for a hold, reps for the rest.
// `trigger` is for a learned start; it defaults to the profile's own.
export function counterFor(
  profile: ExerciseProfile,
  trigger: RepTrigger = profile.rep,
): RepCounter {
  return new RepCounter(trigger, profile.hold ? (profile.ready ?? []) : undefined);
}
