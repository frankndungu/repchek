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
  const range = Math.abs(trigger.start - trigger.turn);
  const margin = range * ZONE_MARGIN;
  const startIsHigh = trigger.start > trigger.turn;
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
    const range = Math.abs(this.trigger.start - this.trigger.turn);
    if (this.holdMax - this.holdMin > range * STEADY_FRACTION) {
      this.startHold(value, nowMs);
    }

    if (nowMs - (this.holdStartedAt ?? nowMs) >= HOLD_MS) {
      this.armed = true;
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

  private startHold(value: number, nowMs: number): void {
    this.holdStartedAt = nowMs;
    this.holdMin = value;
    this.holdMax = value;
  }

  private clearHold(reason: string): void {
    this.holdStartedAt = null;
    this.reason = reason;
  }
}
