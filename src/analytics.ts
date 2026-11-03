// The numbers behind Premium: trends, what we noticed, what to try next,
// comparisons and records. Pure functions over the saved sessions, so they
// are easy to test. Everything is worked out from what is stored. Nothing
// is guessed.

import type { SessionRecord } from "./engine/session";

export interface SetStat {
  set: number;
  reps: number;
  clean: number;
  // Average time of a rep, and how much slower the last third of the reps
  // ran than the first third. Null for a set under six reps.
  avgMs: number;
  slowdown: number | null;
  faults: Record<string, number>;
}

export interface AnalyticsSession {
  id: string;
  exerciseId: string;
  exerciseName: string;
  startedAt: string;
  weightKg: number | null;
  targetReps: number;
  targetSets: number;
  totalReps: number;
  cleanReps: number;
  partials: number;
  avgMs: number;
  sets: SetStat[];
}

const MIN_REPS_FOR_TEMPO = 6;

function avg(values: number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

export function fromRecord(record: SessionRecord): AnalyticsSession {
  const sets: SetStat[] = record.sets.map((s) => {
    const durations = s.reps.map((r) => r.durationMs);
    let slowdown: number | null = null;
    if (durations.length >= MIN_REPS_FOR_TEMPO) {
      const third = Math.floor(durations.length / 3);
      const first = avg(durations.slice(0, third));
      const last = avg(durations.slice(-third));
      slowdown = first > 0 ? last / first - 1 : null;
    }
    const faults: Record<string, number> = {};
    for (const rep of s.reps) {
      for (const id of rep.faults) faults[id] = (faults[id] ?? 0) + 1;
    }
    return {
      set: s.set,
      reps: s.reps.length,
      clean: s.reps.filter((r) => r.faults.length === 0).length,
      avgMs: avg(durations),
      slowdown,
      faults,
    };
  });
  const totalReps = sets.reduce((n, s) => n + s.reps, 0);
  const cleanReps = sets.reduce((n, s) => n + s.clean, 0);
  const allDurations = record.sets.flatMap((s) => s.reps.map((r) => r.durationMs));
  return {
    id: record.id,
    exerciseId: record.exerciseId,
    exerciseName: record.exerciseName.split(" (")[0],
    startedAt: record.startedAt,
    weightKg: record.weightKg,
    targetReps: record.target.reps,
    targetSets: record.target.sets,
    totalReps,
    cleanReps,
    partials: record.sets.reduce((n, s) => n + s.partials, 0),
    avgMs: avg(allDurations),
    sets,
  };
}

export function cleanPct(s: { totalReps: number; cleanReps: number }): number {
  return s.totalReps ? Math.round((s.cleanReps / s.totalReps) * 100) : 0;
}

// Oldest first, only sessions that counted a rep.
export function forExercise(
  sessions: AnalyticsSession[],
  exerciseId: string,
): AnalyticsSession[] {
  return sessions
    .filter((s) => s.exerciseId === exerciseId && s.totalReps > 0)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
}

export type Period = "4w" | "12w" | "all";

const DAY_MS = 86_400_000;
const PERIOD_DAYS: Record<Exclude<Period, "all">, number> = { "4w": 28, "12w": 84 };

export function inPeriod(
  sessions: AnalyticsSession[],
  period: Period,
  now: Date = new Date(),
): AnalyticsSession[] {
  if (period === "all") return sessions;
  const cutoff = now.getTime() - PERIOD_DAYS[period] * DAY_MS;
  return sessions.filter((s) => Date.parse(s.startedAt) >= cutoff);
}

// Exercises with the sessions each has, most trained first.
export function exercisesByUse(
  sessions: AnalyticsSession[],
): { id: string; name: string; sessions: number }[] {
  const map = new Map<string, { id: string; name: string; sessions: number }>();
  for (const s of sessions) {
    if (s.totalReps === 0) continue;
    const entry = map.get(s.exerciseId) ?? { id: s.exerciseId, name: s.exerciseName, sessions: 0 };
    entry.sessions += 1;
    map.set(s.exerciseId, entry);
  }
  return [...map.values()].sort((a, b) => b.sessions - a.sessions);
}

type Counted = Pick<AnalyticsSession, "totalReps" | "cleanReps">;

function weightedPct(list: Counted[]): number {
  return cleanPct({
    totalReps: list.reduce((n, s) => n + s.totalReps, 0),
    cleanReps: list.reduce((n, s) => n + s.cleanReps, 0),
  });
}

// --- Trend ----------------------------------------------------------------

// A trend needs at least this many sessions.
export const MIN_SESSIONS_FOR_TREND = 3;

export interface CleanTrend {
  from: number;
  to: number;
  points: number;
  sessions: number;
}

// The earliest sessions against the latest ones, up to three each. Null
// until there are enough sessions to say anything.
export function cleanTrend(list: Counted[]): CleanTrend | null {
  if (list.length < MIN_SESSIONS_FOR_TREND) return null;
  const n = Math.min(3, Math.floor(list.length / 2));
  const from = weightedPct(list.slice(0, n));
  const to = weightedPct(list.slice(-n));
  return { from, to, points: to - from, sessions: list.length };
}

// --- What we noticed -----------------------------------------------------

export type Tone = "good" | "watch" | "info";

export interface Insight {
  id: string;
  tone: Tone;
  text: string;
}

const STEADY_POINTS = 1;
const FATIGUE_DROP_POINTS = 15;
const SLOWDOWN_SHARE = 0.2;

export function insightsFor(
  list: AnalyticsSession[],
  name: string,
  faultName: (exerciseId: string, faultId: string) => string,
): Insight[] {
  if (list.length < MIN_SESSIONS_FOR_TREND) return [];
  const out: Insight[] = [];
  const lower = name.toLowerCase();

  const trend = cleanTrend(list);
  if (trend) {
    if (Math.abs(trend.points) <= STEADY_POINTS) {
      out.push({
        id: "trend",
        tone: "info",
        text: `Your ${lower} clean rate is steady at ${trend.to}%.`,
      });
    } else if (trend.points > 0) {
      out.push({
        id: "trend",
        tone: "good",
        text: `Your ${lower} clean rate rose from ${trend.from}% to ${trend.to}% over ${trend.sessions} sessions.`,
      });
    } else {
      out.push({
        id: "trend",
        tone: "watch",
        text: `Your ${lower} clean rate dipped from ${trend.from}% to ${trend.to}% over ${trend.sessions} sessions.`,
      });
    }
  }

  // Which set form breaks in, across sessions.
  const bySet = new Map<number, { reps: number; clean: number; sessions: number }>();
  for (const s of list) {
    for (const set of s.sets) {
      const e = bySet.get(set.set) ?? { reps: 0, clean: 0, sessions: 0 };
      e.reps += set.reps;
      e.clean += set.clean;
      e.sessions += 1;
      bySet.set(set.set, e);
    }
  }
  const first = bySet.get(1);
  if (first && first.reps > 0) {
    const base = Math.round((first.clean / first.reps) * 100);
    let worst: { set: number; drop: number } | null = null;
    for (const [set, e] of bySet) {
      if (set === 1 || e.sessions < MIN_SESSIONS_FOR_TREND || e.reps === 0) continue;
      const drop = base - Math.round((e.clean / e.reps) * 100);
      if (drop >= FATIGUE_DROP_POINTS && (!worst || drop > worst.drop)) {
        worst = { set, drop };
      }
    }
    if (worst) {
      out.push({
        id: "fatigue",
        tone: "watch",
        text: `Your form slips in set ${worst.set}: ${worst.drop} points less clean than set 1. Try more rest before it.`,
      });
    }
  }

  // The rep fault that comes up most.
  const faults = new Map<string, number>();
  let totalReps = 0;
  for (const s of list) {
    totalReps += s.totalReps;
    for (const set of s.sets) {
      for (const [id, n] of Object.entries(set.faults)) {
        faults.set(id, (faults.get(id) ?? 0) + n);
      }
    }
  }
  const top = [...faults.entries()].sort((a, b) => b[1] - a[1])[0];
  if (top && totalReps > 0) {
    const [id, count] = top;
    const message = faultName(list[0].exerciseId, id);
    const share = Math.round((count / totalReps) * 100);
    let line = `Most common fault: ${message.toLowerCase()}, on ${count} reps (${share}% of all).`;
    if (list.length >= 4) {
      const half = Math.floor(list.length / 2);
      const rate = (part: AnalyticsSession[]) => {
        const reps = part.reduce((n, s) => n + s.totalReps, 0);
        const hits = part.reduce(
          (n, s) => n + s.sets.reduce((m, set) => m + (set.faults[id] ?? 0), 0),
          0,
        );
        return reps ? Math.round((hits / reps) * 100) : 0;
      };
      const before = rate(list.slice(0, half));
      const after = rate(list.slice(-half));
      if (before !== after) {
        line += ` It is ${after < before ? "down" : "up"} from ${before}% to ${after}%.`;
      }
    }
    out.push({ id: "fault", tone: "info", text: line });
  }

  // Reps that slow down as a set goes on.
  const slowdowns = list.flatMap((s) =>
    s.sets.map((set) => set.slowdown).filter((v): v is number => v !== null),
  );
  if (slowdowns.length >= MIN_SESSIONS_FOR_TREND) {
    const mean = avg(slowdowns);
    if (mean >= SLOWDOWN_SHARE) {
      out.push({
        id: "tempo",
        tone: "watch",
        text: `Your last reps run ${Math.round(mean * 100)}% slower than your first. That is tiredness showing.`,
      });
    }
  }

  // Partial reps, if any.
  const partials = list.reduce((n, s) => n + s.partials, 0);
  if (partials > 0 && totalReps > 0) {
    out.push({
      id: "partials",
      tone: "info",
      text: `${partials} partial rep${partials === 1 ? "" : "s"} were not counted. Use the full range to count them.`,
    });
  }

  return out;
}

// --- What to try next ----------------------------------------------------

export type RecommendationKind = "add_weight" | "add_reps" | "clean_up" | "hold";

export interface Recommendation {
  kind: RecommendationKind;
  title: string;
  detail: string;
}

const READY_PCT = 85;
const CLEAN_UP_PCT = 70;
const LOAD_STEP_KG = 2.5;
const RECENT = 3;

function kg(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)} kg`;
}

// One next step, from the last three sessions. Null with how many sessions
// are missing until there are three.
export function recommendationFor(
  list: AnalyticsSession[],
): { recommendation: Recommendation } | { missing: number } {
  if (list.length < RECENT) return { missing: RECENT - list.length };
  const recent = list.slice(-RECENT);
  const pcts = recent.map(cleanPct);
  const met = recent.every((s) => s.totalReps >= s.targetReps * s.targetSets * 0.9);
  const ready = pcts.every((p) => p >= READY_PCT) && met;
  const latest = recent[recent.length - 1];
  const weight = latest.weightKg && latest.weightKg > 0 ? latest.weightKg : null;
  const rate = weightedPct(recent);

  if (ready && weight !== null) {
    return {
      recommendation: {
        kind: "add_weight",
        title: `You are ready to try ${kg(weight + LOAD_STEP_KG)}.`,
        detail: `Based on 3 sessions of clean sets at ${kg(weight)}.`,
      },
    };
  }
  if (ready) {
    return {
      recommendation: {
        kind: "add_reps",
        title: "You are ready to add 2 reps to every set.",
        detail: "Based on 3 sessions above 85% clean, with every target met.",
      },
    };
  }
  if (rate < CLEAN_UP_PCT) {
    return {
      recommendation: {
        kind: "clean_up",
        title: "Clean up your form before adding more.",
        detail: `Your clean rate over the last 3 sessions is ${rate}%.`,
      },
    };
  }
  return {
    recommendation: {
      kind: "hold",
      title: "Stay where you are for now.",
      detail: `Get 3 sessions in a row above ${READY_PCT}% clean with every target met. Right now: ${rate}%.`,
    },
  };
}

// --- Compare two sessions -------------------------------------------------

export interface CompareRow {
  label: string;
  a: string;
  b: string;
  // Positive means b is better, negative worse, zero the same, null no view.
  better: number | null;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function compareSessions(
  a: AnalyticsSession,
  b: AnalyticsSession,
): CompareRow[] {
  const rows: CompareRow[] = [
    { label: "Reps", a: String(a.totalReps), b: String(b.totalReps), better: Math.sign(b.totalReps - a.totalReps) },
    { label: "Clean reps", a: String(a.cleanReps), b: String(b.cleanReps), better: Math.sign(b.cleanReps - a.cleanReps) },
    { label: "Clean rate", a: `${cleanPct(a)}%`, b: `${cleanPct(b)}%`, better: Math.sign(cleanPct(b) - cleanPct(a)) },
    { label: "Avg rep", a: seconds(a.avgMs), b: seconds(b.avgMs), better: null },
    { label: "Partial reps", a: String(a.partials), b: String(b.partials), better: -Math.sign(b.partials - a.partials) || 0 },
  ];
  if (a.weightKg || b.weightKg) {
    rows.push({
      label: "Weight",
      a: a.weightKg ? kg(a.weightKg) : "Bodyweight",
      b: b.weightKg ? kg(b.weightKg) : "Bodyweight",
      better: Math.sign((b.weightKg ?? 0) - (a.weightKg ?? 0)),
    });
  }
  return rows;
}

// --- Records ---------------------------------------------------------------

export interface RecordEvent {
  startedAt: string;
  exerciseName: string;
  label: string;
  value: string;
  previous: string;
}

const BEST_RATE_MIN_REPS = 10;

// Every time a best was beaten, newest first. The first session of an
// exercise sets the starting point, so it is not a record.
export function recordsTimeline(
  sessions: AnalyticsSession[],
  limit = 10,
): RecordEvent[] {
  const events: RecordEvent[] = [];
  const bests = new Map<string, { clean: number; rate: number | null; weight: number }>();
  const ordered = [...sessions]
    .filter((s) => s.totalReps > 0)
    .sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt));
  for (const s of ordered) {
    const rate = s.totalReps >= BEST_RATE_MIN_REPS ? cleanPct(s) : null;
    const weight = s.weightKg ?? 0;
    const best = bests.get(s.exerciseId);
    if (!best) {
      bests.set(s.exerciseId, { clean: s.cleanReps, rate, weight });
      continue;
    }
    const push = (label: string, value: string, previous: string) =>
      events.push({ startedAt: s.startedAt, exerciseName: s.exerciseName, label, value, previous });
    if (s.cleanReps > best.clean) {
      push("Most clean reps", String(s.cleanReps), String(best.clean));
      best.clean = s.cleanReps;
    }
    if (rate !== null && (best.rate === null || rate > best.rate)) {
      if (best.rate !== null) push("Best clean rate", `${rate}%`, `${best.rate}%`);
      best.rate = rate;
    }
    if (weight > best.weight) {
      push("Heaviest weight", kg(weight), best.weight ? kg(best.weight) : "bodyweight");
      best.weight = weight;
    }
  }
  return events.reverse().slice(0, limit);
}

// --- Chart data ------------------------------------------------------------

export interface ChartPoint {
  startedAt: string;
  value: number;
}

export function cleanRateSeries(list: AnalyticsSession[]): ChartPoint[] {
  return list.map((s) => ({ startedAt: s.startedAt, value: cleanPct(s) }));
}
