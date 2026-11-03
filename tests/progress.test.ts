import { describe, expect, it } from "vitest";
import {
  levelFor,
  milestonesFor,
  personalBests,
  streakFor,
  totalsFor,
  xpFor,
} from "../src/progress";
import type { SessionSummary } from "../src/progress";

// Wednesday 11 Nov 2026, local time.
const NOW = new Date(2026, 10, 11, 12, 0, 0);

function session(
  daysAgo: number,
  totalReps = 20,
  cleanReps = 20,
): SessionSummary {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  return {
    exerciseId: "pushup",
    exerciseName: "Push-up (side)",
    startedAt: d.toISOString(),
    totalReps,
    cleanReps,
  };
}

describe("xp and level", () => {
  it("counts clean reps only", () => {
    expect(xpFor([session(0, 34, 29), session(1, 10, 3)])).toBe(32);
  });

  it("starts at level 1 with nothing", () => {
    expect(levelFor(0)).toEqual({ level: 1, into: 0, needed: 200 });
  });

  it("matches the mockup: level 4 at 320 of 500", () => {
    // 200 + 300 + 400 to finish levels 1 to 3, then 320 into level 4.
    expect(levelFor(900 + 320)).toEqual({ level: 4, into: 320, needed: 500 });
  });

  it("moves up exactly at the boundary", () => {
    expect(levelFor(199).level).toBe(1);
    expect(levelFor(200).level).toBe(2);
  });
});

describe("streak", () => {
  it("is zero with no sessions", () => {
    expect(streakFor([], NOW)).toMatchObject({ weeks: 0, thisWeek: 0, best: 0 });
  });

  it("does not count an unfinished week, and does not break on it", () => {
    // Last week had 3 sessions. This week has 1 so far.
    const sessions = [session(7), session(8), session(9), session(0)];
    const s = streakFor(sessions, NOW);
    expect(s.weeks).toBe(1);
    expect(s.thisWeek).toBe(1);
  });

  it("counts this week once it reaches the goal", () => {
    const sessions = [session(0), session(1), session(2)];
    expect(streakFor(sessions, NOW).weeks).toBe(1);
  });

  it("counts weeks in a row and stops at a gap", () => {
    const week = (daysAgo: number) => [
      session(daysAgo),
      session(daysAgo + 1),
      session(daysAgo + 2),
    ];
    // Last week and the one before it. Nothing three weeks ago. Then a run.
    const sessions = [...week(7), ...week(14), ...week(35), ...week(42)];
    const s = streakFor(sessions, NOW);
    expect(s.weeks).toBe(2);
    expect(s.best).toBe(2);
  });

  it("ignores sessions with no reps", () => {
    const sessions = [session(0, 0, 0), session(1, 0, 0), session(2, 0, 0)];
    expect(streakFor(sessions, NOW).weeks).toBe(0);
  });
});

describe("totals", () => {
  it("counts sessions with reps and their clean reps", () => {
    expect(totalsFor([session(0, 10, 8), session(1, 0, 0)])).toEqual({
      sessions: 1,
      cleanReps: 8,
    });
  });
});

describe("milestones", () => {
  const earned = (sessions: SessionSummary[]) =>
    milestonesFor(sessions, NOW)
      .filter((m) => m.earned)
      .map((m) => m.id);

  it("earns nothing at the start", () => {
    expect(earned([])).toEqual([]);
  });

  it("earns the first clean session, form focus and 100 reps", () => {
    const sessions = Array.from({ length: 5 }, (_, i) => session(i, 20, 20));
    expect(earned(sessions)).toEqual([
      "first-clean-session",
      "clean-100",
      "form-focus",
      "form-streak",
    ]);
  });

  it("needs more than 90% for form focus", () => {
    expect(earned([session(0, 20, 18)])).not.toContain("form-focus");
    expect(earned([session(0, 20, 19)])).toContain("form-focus");
  });

  it("says how much is left on a locked one", () => {
    const m = milestonesFor([session(0, 20, 20)], NOW).find(
      (x) => x.id === "clean-1000",
    );
    expect(m?.todo).toBe("980 reps to go");
  });
});

describe("personal bests", () => {
  it("gives one row per exercise with the best numbers", () => {
    const row = (id: string, total: number, clean: number) => ({
      ...session(1, total, clean),
      exerciseId: id,
      exerciseName: id === "pushup" ? "Push-up (side)" : "Deadlift",
    });
    const bests = personalBests([
      row("pushup", 20, 15),
      row("pushup", 30, 27),
      row("deadlift", 8, 8),
    ]);
    expect(bests).toEqual([
      {
        exerciseId: "pushup",
        exerciseName: "Push-up",
        sessions: 2,
        mostCleanReps: 27,
        bestCleanPct: 90,
      },
      {
        exerciseId: "deadlift",
        exerciseName: "Deadlift",
        sessions: 1,
        mostCleanReps: 8,
        // Under 10 reps, so no rate record yet.
        bestCleanPct: null,
      },
    ]);
  });

  it("skips sessions with no reps", () => {
    expect(personalBests([session(0, 0, 0)])).toEqual([]);
  });
});
