import type {
  ExerciseProfile,
  FrameMetrics,
  ReadyCheck,
  RepTrigger,
} from "./types";

// The readiness gate answers one question on every frame:
// "Is this person in position and ready, so we can start counting?"
//
// Until the answer is yes, nothing is counted and nothing is judged.
// That stops the app from scoring you while you walk in, get down
// into your plank, or pick the bar up.
//
// It works for EVERY exercise, including ones you add later, because
// it only needs things every profile already has:
//   1. the person is seen clearly (main.ts only calls update() on
//      confident frames)
//   2. they are in the start zone of the rep trigger
//   3. they hold still like that for HOLD_MS
//
// On top of that, a profile can list extra posture checks in its
// `ready` field (for example, a push-up needs the body near horizontal,
// otherwise standing with your arms down looks like the top of a rep).
// No `ready` field means steps 1 to 3 only.
//
// Auto-calibration: for a trigger with `turnRatio`, step 2 only needs you
// at or beyond the profile's start, and the average value you held in
// step 3 becomes your personal start (see heldValue).
//
// It disarms (switches off) again when:
//   - the person cannot be seen properly for LOST_MS, or
//   - main.ts calls reset(), which it does when a set finishes.

// How long you must hold the start position before counting starts.
// Between normal push-up reps you pause at the top for 0.6 to 0.9 s,
// so 1 s means it will not accidentally arm halfway through moving.
const HOLD_MS = 1000;

// How long you can disappear before the gate switches off again.
// Short blips of bad tracking are normal, so we allow a bit of slack.
const LOST_MS = 1500;

// "Still" means the rep metric moves less than this share of the
// full rep range while you hold. 0.25 = a quarter of a rep.
const STEADY_FRACTION = 0.25;

// Same zone size the RepCounter uses. Keeping them identical means
// that when the gate arms, the counter starts cleanly in "ready".
const ZONE_MARGIN = 0.15;

export type GateStatus = "waiting" | "holding" | "armed";

// Is this value inside the start zone of the rep?
// Works whether the start is the high end or the low end of the range.
export function inStartZone(trigger: RepTrigger, value: number): boolean {
  const startIsHigh = trigger.start > trigger.turn;
  // A learned trigger has no real start yet, only a floor: anything at or
  // beyond the profile's start will do, however far beyond.
  if (trigger.turnRatio !== undefined) {
    return startIsHigh ? value >= trigger.start : value <= trigger.start;
  }
  const range = Math.abs(trigger.start - trigger.turn);
  const margin = range * ZONE_MARGIN;
  return startIsHigh
    ? value >= trigger.start - margin
    : value <= trigger.start + margin;
}

function passes(check: ReadyCheck, metrics: FrameMetrics): boolean {
  const value = metrics[check.metric];
  if (check.min !== undefined && value < check.min) return false;
  if (check.max !== undefined && value > check.max) return false;
  return true;
}

export class ReadinessGate {
  private readonly trigger: RepTrigger;
  private readonly checks: ReadyCheck[];
  private armed = false;
  private holdStartedAt: number | null = null;
  private holdMin = 0;
  private holdMax = 0;
  // Running total of the rep metric during the hold, for its average.
  private holdSum = 0;
  private holdCount = 0;
  private held: number | null = null;
  private lastSeenAt = 0;
  private lastNow = 0;

  // A short human reason for why we are not counting yet.
  // Shown in the counter pill and the debug line.
  reason = "Step into view";

  constructor(profile: ExerciseProfile) {
    this.trigger = profile.rep;
    this.checks = profile.ready ?? [];
  }

  get isArmed(): boolean {
    return this.armed;
  }

  // The posture checks this exercise uses, for the debug line.
  get readyChecks(): readonly ReadyCheck[] {
    return this.checks;
  }

  get status(): GateStatus {
    if (this.armed) return "armed";
    return this.holdStartedAt === null ? "waiting" : "holding";
  }

  // The average value of the rep metric during the hold that last armed
  // the gate, or null before it has armed. A learned trigger starts here.
  get heldValue(): number | null {
    return this.held;
  }

  // 0 to 1, how far through the hold we are.
  get holdProgress(): number {
    if (this.armed) return 1;
    if (this.holdStartedAt === null) return 0;
    return Math.min(1, (this.lastNow - this.holdStartedAt) / HOLD_MS);
  }

  // Call this on every frame where the person is seen clearly.
  // Returns true on the one frame where the gate switches on.
  update(metrics: FrameMetrics, nowMs: number): boolean {
    this.lastSeenAt = nowMs;
    this.lastNow = nowMs;
    if (this.armed) return false;

    const value = metrics[this.trigger.metric];

    // Start zone.
    if (!inStartZone(this.trigger, value)) {
      this.clearHold("Go to the start position");
      return false;
    }

    // Posture checks from the profile, if any.
    for (const check of this.checks) {
      if (!passes(check, metrics)) {
        this.clearHold(check.hint);
        return false;
      }
    }

    // Hold still. If you drift too much, the hold starts again.
    if (this.holdStartedAt === null) {
      this.startHold(value, nowMs);
    }
    this.holdMin = Math.min(this.holdMin, value);
    this.holdMax = Math.max(this.holdMax, value);
    if (this.holdMax - this.holdMin > this.repRange(value) * STEADY_FRACTION) {
      this.startHold(value, nowMs);
    }
    this.holdSum += value;
    this.holdCount += 1;

    if (nowMs - (this.holdStartedAt ?? nowMs) >= HOLD_MS) {
      this.armed = true;
      this.held = this.holdSum / this.holdCount;
      this.holdStartedAt = null;
      this.reason = "";
      return true;
    }

    this.reason = "Hold still";
    return false;
  }

  // Call this on every frame where the person is NOT seen clearly
  // (no person found, or confidence too low).
  // Returns true on the one frame where the gate switches off.
  lost(nowMs: number): boolean {
    this.lastNow = nowMs;
    if (!this.armed) {
      this.clearHold("Step into view");
      return false;
    }
    if (nowMs - this.lastSeenAt > LOST_MS) {
      this.armed = false;
      this.clearHold("Step into view");
      return true;
    }
    return false;
  }

  // Switch off and start over. main.ts calls this after each set,
  // so the walk back to the bar or getting back down is not counted.
  reset(): void {
    this.armed = false;
    this.clearHold("Get in position");
  }

  // The full rep range, which "hold still" is measured against. A learned
  // trigger has no fixed range yet, so it uses the range this value would
  // give if it became the start.
  private repRange(value: number): number {
    const { start, turn, turnRatio } = this.trigger;
    if (turnRatio === undefined) return Math.abs(start - turn);
    return Math.abs(value * (1 - turnRatio));
  }

  private startHold(value: number, nowMs: number): void {
    this.holdStartedAt = nowMs;
    this.holdMin = value;
    this.holdMax = value;
    this.holdSum = 0;
    this.holdCount = 0;
  }

  private clearHold(reason: string): void {
    this.holdStartedAt = null;
    this.reason = reason;
  }
}
