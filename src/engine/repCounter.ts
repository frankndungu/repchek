import type { FrameMetrics, RepPhase, RepTrigger } from "./types";

export interface RepEvent {
  type: "rep" | "partial";
  count: number;
  durationMs: number;
}

const ZONE_MARGIN = 0.15;
const PARTIAL_MIN_PROGRESS = 0.4;

export class RepCounter {
  private trigger: RepTrigger;
  private phase: RepPhase;
  private count: number;
  private repStartedAt: number;
  private deepestProgress: number;

  constructor(trigger: RepTrigger) {
    this.trigger = trigger;
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

  reset(): void {
    this.phase = "idle";
    this.count = 0;
    this.deepestProgress = 0;
  }

  update(metrics: FrameMetrics, nowMs: number): RepEvent | null {
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
}
