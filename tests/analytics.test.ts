import { describe, expect, it } from "vitest";
import {
  cleanTrend,
  compareSessions,
  exercisesByUse,
  forExercise,
  fromRecord,
  inPeriod,
  insightsFor,
  recommendationFor,
  recordsTimeline,
} from "../src/analytics";
import type { AnalyticsSession, SetStat } from "../src/analytics";
import type { SessionRecord } from "../src/engine/session";

const NOW = new Date(2026, 10, 11, 12, 0, 0);
const DAY = 86_400_000;

function setStat(set: number, reps: number, clean: number, extra: Partial<SetStat> = {}): SetStat {
  return { set, reps, clean, avgMs: 1800, slowdown: null, faults: {}, ...extra };
}

function session(
  daysAgo: number,
  over: Partial<AnalyticsSession> = {},
  sets: SetStat[] = [setStat(1, 10, 9), setStat(2, 10, 9)],
): AnalyticsSession {
  const totalReps = sets.reduce((n, s) => n + s.reps, 0);
  const cleanReps = sets.reduce((n, s) => n + s.clean, 0);
  return {
    id: `s${daysAgo}`,
    exerciseId: "pushup",
    exerciseName: "Push-up",
    startedAt: new Date(NOW.getTime() - daysAgo * DAY).toISOString(),
    weightKg: null,
    targetReps: 10,
    targetSets: 2,
    totalReps,
    cleanReps,
    partials: 0,
    avgMs: 1800,
    sets,
    ...over,
  };
}

const faultName = (_e: string, id: string) => (id === "hips" ? "Hips sagging" : id);

describe("fromRecord", () => {
  it("works out sets, clean reps, faults and slowdown from a saved record", () => {
    const rep = (durationMs: number, faults: string[] = []) => ({ durationMs, faults, atMs: 0 });
    const record: SessionRecord = {
      id: "r1",
      exerciseId: "pushup",
      exerciseName: "Push-up (side)",
      startedAt: NOW.toISOString(),
      endedAt: NOW.toISOString(),
      target: { sets: 1, reps: 6 },
      weightKg: 20,
      sets: [
        {
          set: 1,
          // First third 1000ms, last third 1500ms: 50% slower.
          reps: [rep(1000), rep(1000), rep(1200, ["hips"]), rep(1200), rep(1500), rep(1500)],
          partials: 2,
        },
      ],
    };
    const s = fromRecord(record);
    expect(s).toMatchObject({
      exerciseName: "Push-up",
      totalReps: 6,
      cleanReps: 5,
      partials: 2,
      weightKg: 20,
      targetReps: 6,
    });
    expect(s.sets[0].faults).toEqual({ hips: 1 });
    expect(s.sets[0].slowdown).toBeCloseTo(0.5);
  });
});

describe("selecting", () => {
  const all = [session(1), session(30), session(2, { exerciseId: "row", exerciseName: "Row" }), session(5, { totalReps: 0, cleanReps: 0 })];

  it("gives one exercise oldest first and skips empty sessions", () => {
    expect(forExercise(all, "pushup").map((s) => s.id)).toEqual(["s30", "s1"]);
  });

  it("keeps a period", () => {
    expect(inPeriod(forExercise(all, "pushup"), "4w", NOW).map((s) => s.id)).toEqual(["s1"]);
    expect(inPeriod(forExercise(all, "pushup"), "all", NOW)).toHaveLength(2);
  });

  it("lists exercises most trained first", () => {
    expect(exercisesByUse([...all, session(3)]).map((e) => `${e.id}:${e.sessions}`)).toEqual(["pushup:3", "row:1"]);
  });
});

describe("cleanTrend", () => {
  it("is null with fewer than 3 sessions", () => {
    expect(cleanTrend([session(2), session(1)])).toBeNull();
  });

  it("compares the earliest with the latest sessions", () => {
    const list = [
      session(20, {}, [setStat(1, 20, 14)]),
      session(10, {}, [setStat(1, 20, 16)]),
      session(0, {}, [setStat(1, 20, 18)]),
    ];
    // n = 1: first 70%, last 90%.
    expect(cleanTrend(list)).toEqual({ from: 70, to: 90, points: 20, sessions: 3 });
  });
});

describe("insightsFor", () => {
  it("says nothing with too little data", () => {
    expect(insightsFor([session(1), session(0)], "Push-up", faultName)).toEqual([]);
  });

  it("reports a rising trend", () => {
    const list = [
      session(20, {}, [setStat(1, 20, 14)]),
      session(10, {}, [setStat(1, 20, 16)]),
      session(0, {}, [setStat(1, 20, 18)]),
    ];
    const trend = insightsFor(list, "Push-up", faultName).find((i) => i.id === "trend");
    expect(trend).toMatchObject({ tone: "good" });
    expect(trend?.text).toBe("Your push-up clean rate rose from 70% to 90% over 3 sessions.");
  });

  it("finds the set where form slips", () => {
    const list = [20, 10, 0].map((d) =>
      session(d, {}, [setStat(1, 10, 10), setStat(2, 10, 8), setStat(3, 10, 5)]),
    );
    const fatigue = insightsFor(list, "Push-up", faultName).find((i) => i.id === "fatigue");
    expect(fatigue?.text).toContain("set 3");
    expect(fatigue?.text).toContain("50 points");
  });

  it("names the most common fault and its change", () => {
    const list = [20, 15, 10, 5].map((d, i) =>
      session(d, {}, [setStat(1, 10, 10 - (i < 2 ? 4 : 1), { faults: { hips: i < 2 ? 4 : 1 } })]),
    );
    const fault = insightsFor(list, "Push-up", faultName).find((i) => i.id === "fault");
    expect(fault?.text).toContain("hips sagging");
    expect(fault?.text).toContain("down from 40% to 10%");
  });

  it("flags reps that slow down", () => {
    const list = [20, 10, 0].map((d) =>
      session(d, {}, [setStat(1, 12, 12, { slowdown: 0.4 })]),
    );
    expect(insightsFor(list, "Push-up", faultName).find((i) => i.id === "tempo")?.text).toContain("40% slower");
  });
});

describe("recommendationFor", () => {
  const good = (d: number, over: Partial<AnalyticsSession> = {}) =>
    session(d, over, [setStat(1, 10, 9), setStat(2, 10, 9)]);

  it("asks for more sessions first", () => {
    expect(recommendationFor([good(2), good(1)])).toEqual({ missing: 1 });
  });

  it("suggests more weight after three clean sessions at a weight", () => {
    const list = [3, 2, 1].map((d) => good(d, { weightKg: 20 }));
    expect(recommendationFor(list)).toEqual({
      recommendation: {
        kind: "add_weight",
        title: "You are ready to try 22.5 kg.",
        detail: "Based on 3 sessions of clean sets at 20 kg.",
      },
    });
  });

  it("suggests more reps for bodyweight", () => {
    const list = [3, 2, 1].map((d) => good(d));
    expect(recommendationFor(list)).toMatchObject({ recommendation: { kind: "add_reps" } });
  });

  it("does not push load when targets were missed", () => {
    const list = [3, 2, 1].map((d) =>
      session(d, { weightKg: 20 }, [setStat(1, 6, 6), setStat(2, 6, 6)]),
    );
    expect(recommendationFor(list)).toMatchObject({ recommendation: { kind: "hold" } });
  });

  it("says to clean up form when the rate is low", () => {
    const list = [3, 2, 1].map((d) =>
      session(d, {}, [setStat(1, 10, 6), setStat(2, 10, 6)]),
    );
    const r = recommendationFor(list);
    expect(r).toMatchObject({ recommendation: { kind: "clean_up" } });
    expect("recommendation" in r && r.recommendation.detail).toBe(
      "Your clean rate over the last 3 sessions is 60%.",
    );
  });
});

describe("compareSessions", () => {
  it("compares reps, clean rate and weight", () => {
    const a = session(10, { weightKg: 20 }, [setStat(1, 10, 6)]);
    const b = session(1, { weightKg: 22.5 }, [setStat(1, 12, 11)]);
    const rows = compareSessions(a, b);
    expect(rows.find((r) => r.label === "Clean rate")).toMatchObject({ a: "60%", b: "92%", better: 1 });
    expect(rows.find((r) => r.label === "Weight")).toMatchObject({ a: "20 kg", b: "22.5 kg", better: 1 });
  });

  it("leaves weight out for bodyweight sessions", () => {
    expect(compareSessions(session(2), session(1)).some((r) => r.label === "Weight")).toBe(false);
  });
});

describe("recordsTimeline", () => {
  it("lists beaten bests, newest first, and skips the first session", () => {
    const list = [
      session(30, {}, [setStat(1, 20, 14)]),
      session(20, {}, [setStat(1, 20, 17)]),
      session(10, { weightKg: 10 }, [setStat(1, 20, 17)]),
    ];
    const events = recordsTimeline(list);
    expect(events.map((e) => `${e.label}: ${e.previous} to ${e.value}`)).toEqual([
      "Heaviest weight: bodyweight to 10 kg",
      "Best clean rate: 70% to 85%",
      "Most clean reps: 14 to 17",
    ]);
  });
});
