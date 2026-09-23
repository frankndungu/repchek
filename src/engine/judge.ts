import type {
  ExerciseProfile,
  FormRule,
  FrameMetrics,
  RepPhase,
  Verdict,
} from "./types";

export function isRuleBroken(rule: FormRule, m: FrameMetrics): boolean {
  const value = m[rule.metric];
  if (rule.min !== undefined && value < rule.min) return true;
  if (rule.max !== undefined && value > rule.max) return true;
  return false;
}

export class Judge {
  private profile: ExerciseProfile;
  private minFailFrames: number;
  private failStreaks: Map<string, number>;

  constructor(profile: ExerciseProfile, minFailFrames = 5) {
    this.profile = profile;
    this.minFailFrames = minFailFrames;
    this.failStreaks = new Map();
  }

  evaluate(m: FrameMetrics, phase: RepPhase): Verdict {
    const failures: FormRule[] = [];

    for (const rule of this.profile.rules) {
      const applies = rule.phase === undefined || rule.phase === phase;
      const broken = applies && isRuleBroken(rule, m);
      const streak = broken ? (this.failStreaks.get(rule.id) ?? 0) + 1 : 0;
      this.failStreaks.set(rule.id, streak);
      if (streak >= this.minFailFrames) {
        failures.push(rule);
      }
    }

    return { ok: failures.length === 0, failures };
  }
}
